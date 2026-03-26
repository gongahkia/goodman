# STYLE_GUIDE.md — Conquest Coding Conventions

## TypeScript Conventions

### Formatting

```typescript
// No semicolons
// Single quotes
// 2-space indent
// Trailing commas in multiline constructs

const config = {
  captureMode: 'fullpage',
  llmProvider: 'ollama',
  llmEndpoint: 'http://localhost:11434',
}

function createProvider(
  type: LLMProviderType,
  endpoint: string,
  model: string,
): VisionLLMProvider {
  // ...
}
```

### Variable Declarations

- `const` by default
- `let` only when reassignment is required
- Never `var`
- Destructure objects and arrays when accessing multiple properties

```typescript
// good
const { captureMode, llmProvider } = await getConfig()

// bad
const config = await getConfig()
const captureMode = config.captureMode
const llmProvider = config.llmProvider
```

### Functions

- Arrow functions for callbacks and inline functions
- Named `function` declarations for top-level exported functions where hoisting or self-documentation benefits apply
- Always declare explicit return types on exported functions
- Use `async`/`await`, never `.then()` chains

```typescript
// exported top-level: named function
export async function captureFullPage(): Promise<string> {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
  return dataUrl.split(',')[1] ?? ''
}

// callback: arrow function
const entries = log.filter((entry) => entry.confidence > 0.5)

// internal helper: either style is fine, prefer arrow for short bodies
const buildPrompt = (platform: string, hints: string): string =>
  `Analyze this ${platform} screenshot. ${hints}`
```

### Types and Interfaces

- Use `interface` for object shapes that may be extended or implemented
- Use `type` for unions, intersections, mapped types, and aliases
- Export all types from their defining module
- No `any`. Use `unknown` and narrow with type guards.
- Prefix type guard functions with `is`: `isQuizAnswer(value: unknown): value is QuizAnswer`
- Use `Readonly<T>` for data that should not be mutated after creation

```typescript
// interface for extensible object shapes
export interface VisionLLMProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  analyzeImage(image: string, prompt: string): Promise<QuizAnswer>
}

// type for unions and aliases
export type LLMProviderType = 'ollama' | 'openai-compatible'
export type CaptureMode = 'fullpage' | 'region'

// type guard
export function isQuizAnswer(value: unknown): value is QuizAnswer {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.answer === 'string' && typeof obj.confidence === 'number'
}
```

### Null Handling

- Prefer `undefined` over `null` for optional values in internal code
- Use `null` only when interfacing with APIs that return `null` (e.g., `chrome.tabs.captureVisibleTab`)
- Use optional chaining (`?.`) and nullish coalescing (`??`) extensively
- Never use non-null assertion (`!`) except in test files where the assertion is preceded by an explicit check

```typescript
// good
const model = config.llmModel ?? DEFAULT_LLM_MODEL
const host = new URL(endpoint).hostname ?? 'unknown'

// bad
const model = config.llmModel!
```

### Enums and Constants

- Use `enum` for error codes and other fixed sets used in switch statements
- Use `as const` objects for string maps that need runtime access
- Use SCREAMING_SNAKE_CASE for module-level constants
- Use PascalCase for enum names and members

```typescript
export enum ErrorCode {
  CaptureFailed = 'CAPTURE_FAILED',
  LlmUnavailable = 'LLM_UNAVAILABLE',
  LlmError = 'LLM_ERROR',
  LlmTimeout = 'LLM_TIMEOUT',
  ParseFailed = 'PARSE_FAILED',
  StorageError = 'STORAGE_ERROR',
}

export const SUPPORTED_PLATFORMS = [
  'wooclap.com',
  'kahoot.it',
  'docs.google.com/forms',
  'mentimeter.com',
  'slido.com',
  'menti.com',
  'app.sli.do',
] as const
```

## File and Folder Naming

- **Files**: kebab-case. Examples: `service-worker.ts`, `error-handler.ts`, `openai-compat.ts`, `log-viewer.ts`
- **Folders**: kebab-case. Examples: `src/llm/`, `src/lib/`, `src/ui/`
- **Test files**: `<module-name>.test.ts` inside a `__tests__/` directory co-located with the module. Example: `src/llm/__tests__/parser.test.ts`
- **CSS files**: match their HTML/TS counterpart. `popup.css`, `options.css`, `overlay.css`
- **Type-only files**: `types.ts` in `src/lib/`. Platform-specific types can live in their module.
- **One primary export per file** where practical. Utility files (like `constants.ts`) may have many exports.

## Import Ordering

Group imports in this order, separated by blank lines:

1. Node/browser built-ins (rare in extension code)
2. Third-party packages used by the active Chrome-first branch
3. Internal absolute imports — lib modules (`../lib/types`, `../lib/storage`)
4. Internal relative imports — sibling/child modules (`./parser`, `./retry`)
5. Type-only imports (use `import type` syntax)

```typescript
import { describe } from 'vitest'                        // 2. third-party

import { getConfig, appendLog } from '../lib/storage'     // 3. internal absolute
import { sendMessage } from '../lib/messages'              // 3. internal absolute
import { handleError } from '../lib/error-handler'         // 3. internal absolute

import { createProvider } from './factory'                 // 4. internal relative
import { withRetry } from './retry'                        // 4. internal relative

import type { QuizAnswer, ExtensionConfig } from '../lib/types'  // 5. type-only
import type { Message } from '../lib/messages'                     // 5. type-only
```

Within each group, sort alphabetically by module path.

## Error Handling Patterns

### The AgentError Class

All errors surfaced to users must be wrapped in `AgentError`. Raw `Error` objects are for internal/unexpected failures only.

```typescript
export class AgentError extends Error {
  readonly code: ErrorCode
  readonly userMessage: string

  constructor(code: ErrorCode, userMessage: string, cause?: unknown) {
    super(userMessage)
    this.name = 'AgentError'
    this.code = code
    this.userMessage = userMessage
    if (cause) this.cause = cause
  }
}
```

### Error Message Tone

User-facing error messages are terse and technical. They state what failed and what to check. No casual language, no emojis, no apologies.

```typescript
// good
'LLM endpoint unreachable: connection refused at localhost:11434'
'Screenshot capture failed: tab not accessible'
'Response parse failed: no valid JSON in LLM output'
'LLM timeout: no response after 30s from ollama/qwen2.5-vl'

// bad
'Oops! We could not connect to your AI model. Please try again!'
'Something went wrong while taking a screenshot :('
```

### Error Normalization

The `handleError` function normalizes any thrown value:

```typescript
export function handleError(error: unknown): AgentError {
  if (error instanceof AgentError) return error
  if (error instanceof Error) {
    return new AgentError(ErrorCode.LlmError, error.message, error)
  }
  return new AgentError(ErrorCode.LlmError, String(error))
}
```

### Try/Catch Discipline

- Every async pipeline step is wrapped in try/catch at the orchestration level
- Individual functions throw typed errors; the orchestrator catches and routes
- Never silently swallow errors. At minimum, `console.error` with stack trace
- After catching, always continue listening for the next trigger (never crash the listener)

```typescript
export async function handleCaptureRequest(tabId: number): Promise<void> {
  try {
    const screenshot = await captureFullPage()
    const config = await getConfig()
    const provider = createProvider(config)
    const answer = await withRetry(
      () => provider.analyzeImage(screenshot, buildPrompt(config)),
      { maxRetries: 2, baseDelayMs: 1000, backoffMultiplier: 2 },
    )
    await sendToTab(tabId, { type: 'ANSWER_READY', payload: answer })
    await appendLog({ answer, platform: detectPlatform(url), timestamp: Date.now() })
  } catch (err) {
    const agentErr = handleError(err)
    console.error(`[conquest] ${agentErr.code}:`, agentErr.message, agentErr.cause)
    await sendToTab(tabId, { type: 'ERROR', payload: { code: agentErr.code, userMessage: agentErr.userMessage } })
  }
}
```

## Comment Policy

### When to Comment

- **Why, not what.** Do not restate code in English. Explain non-obvious decisions, trade-offs, or constraints.
- **All magic numbers** get a comment explaining the value.
- **Complex regex patterns** get a comment explaining what they match.
- **Workarounds** for browser bugs or API quirks must be commented with the issue/reason.

### When NOT to Comment

- Self-explanatory code does not need comments
- Do not comment type definitions unless the field name is ambiguous
- Do not use `//` comments to disable code. Remove dead code.

### Format

```typescript
// Single-line comments use double-slash with one space after

/**
 * Multi-line JSDoc for exported functions.
 * Keep it to one sentence for simple functions.
 */
export async function captureFullPage(): Promise<string> {
  // 30s timeout: local vision models on consumer GPUs average 5-15s
  const TIMEOUT_MS = 30_000

  // Match ```json ... ``` blocks (LLMs often wrap JSON in markdown fences)
  const fencedJsonRe = /```json\s*([\s\S]*?)```/
}
```

### TODO Format

```typescript
// TODO(task-XX): description of what needs to be done
// where XX is the PRD task number
```

## CSS Conventions

### BEM Naming

All CSS classes follow Block__Element--Modifier convention:

```css
/* Block */
.cq-overlay { }

/* Element */
.cq-overlay__header { }
.cq-overlay__answer-text { }
.cq-overlay__confidence-bar { }

/* Modifier */
.cq-overlay--hidden { }
.cq-overlay__confidence-bar--high { }
.cq-overlay__confidence-bar--medium { }
.cq-overlay__confidence-bar--low { }
```

### Prefix

All Conquest CSS classes use the `cq-` prefix to avoid collisions (even inside Shadow DOM, this is a convention for clarity):

```css
.cq-popup { }
.cq-popup__header { }
.cq-options { }
.cq-options__section { }
```

### CSS Custom Properties

All theme values are defined as custom properties on `:host` (for Shadow DOM) or `:root` (for extension pages). See DESIGN_SYSTEM.md for the complete token list.

```css
:host {
  --cq-bg-primary: #0a0a1a;
  --cq-glass-bg: rgba(15, 15, 35, 0.75);
  --cq-glass-blur: 16px;
  --cq-text-primary: #e8e8f0;
  --cq-accent: #6c5ce7;
  /* ... see DESIGN_SYSTEM.md */
}
```

### CSS File Organization

Each CSS file follows this order:

1. Custom property definitions (`:host` or `:root`)
2. Reset/base styles (minimal, scoped)
3. Block styles (`.cq-overlay`)
4. Element styles (`.cq-overlay__header`)
5. Modifier styles (`.cq-overlay--hidden`)
6. State styles (`.cq-overlay.is-dragging`)
7. Animations (`@keyframes`)
8. Media queries

### Units

- `rem` for font sizes, padding, margins (base 16px)
- `px` for borders, shadows, and fine-grained positioning
- `%` or viewport units for responsive layouts
- Do not use `em` (inheritance makes it unpredictable in Shadow DOM)

## Git Conventions

### Commit Messages

```
<type>(<scope>): <description>

type: feat, fix, refactor, test, docs, build, chore
scope: llm, capture, ui, popup, options, detect, core, lib, build
description: imperative mood, lowercase, no period

Examples:
feat(llm): add multi-strategy response parser
fix(ui): prevent overlay from obscuring quiz area on small viewports
test(detect): add platform detection tests for all supported platforms
```

### Branch Naming

```
feat/<short-description>
fix/<short-description>
refactor/<short-description>
```
