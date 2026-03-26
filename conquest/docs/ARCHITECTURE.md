# ARCHITECTURE.md — Conquest Technical Architecture

Current scope note: this document describes the supported Chrome-first extension surface on the current branch. Firefox packaging remains deferred work and is not part of the supported release flow.

## High-Level Component Diagram

```
+---------------------------------------------------------------------+
|                         BROWSER (Chrome-first)                       |
|                                                                      |
|  +------------------------+        +-----------------------------+   |
|  |    Content Script       |        |   Background Service Worker  |   |
|  |  (per-tab, isolated)    |<======>|   (single, persistent-ish)   |   |
|  |                         | chrome |                              |   |
|  |  +-------------------+  | runtime|  +--------------------------+ |   |
|  |  | Trigger Listener  |  | message|  | Message Router           | |   |
|  |  | (auto-capture)    |  | passing|  |                          | |   |
|  |  +---------+---------+  |        |  | START_CAPTURE ----+      | |   |
|  |            |             |        |  | GET_STATUS -------+      | |   |
|  |  +---------v---------+  |        |  | CONFIG_UPDATED ---+      | |   |
|  |  | Platform Detect   |  |        |  | REGION_SELECTED --+      | |   |
|  |  +---------+---------+  |        |  +--------------------+-----+ |   |
|  |            |             |        |                       |       |   |
|  |  +---------v---------+  |        |  +--------------------v-----+ |   |
|  |  |  Overlay (UI)     |  |        |  |    Orchestrator          | |   |
|  |  |  [Shadow DOM]     |  |        |  |                          | |   |
|  |  +-------------------+  |        |  |  screenshot --> prompt   | |   |
|  |                         |        |  |  prompt --> LLM call     | |   |
|  +------------------------+        |  |  response --> parse      | |   |
|                                     |  |  result --> log + send   | |   |
|  +------------------------+        |  +------------+-------------+ |   |
|  |       Popup             |        |               |               |   |
|  |  (on-demand, toolbar)   |<======>|  +------------v-------------+ |   |
|  |                         | chrome |  |    LLM Provider Layer     | |   |
|  |  Status display         | runtime|  |                          | |   |
|  |  Last answer            | message|  |  Factory --> Ollama      | |   |
|  |  Capture buttons        | passing|  |         --> OpenAI       | |   |
|  |  Session log viewer     |        |  |                          | |   |
|  +------------------------+        |  |  withRetry wrapper       | |   |
|                                     |  +--------------------------+ |   |
|  +------------------------+        |                              |   |
|  |     Options Page        |        |  +--------------------------+ |   |
|  |  (full tab)             |<======>|  |   Storage                | |   |
|  |                         | chrome |  |   config, session_log    | |   |
|  |  Provider config        | storage|  |   tab state (session)   | |   |
|  |  Capture settings       |        |  +--------------------------+ |   |
|  |  Model recommendations  |        +-----------------------------+   |
|  +------------------------+                                          |
+---------------------------------------------------------------------+
                                    |
                                    | HTTP (localhost only)
                                    v
                        +-----------------------+
                        |   Local LLM Server     |
                        |                        |
                        |  Ollama (port 11434)   |
                        |  -- or --              |
                        |  OpenAI-compat server  |
                        |  (LM Studio, LocalAI,  |
                        |   llama.cpp, Jan, vLLM) |
                        +-----------------------+
```

## Message Flow Diagrams

### Flow 1: Manual Trigger (Alt+Q)

```
User presses Alt+Q
        |
        v
chrome.commands.onCommand('trigger-capture')
  [Background Service Worker]
        |
        +-> getConfig() from storage
        |     returns ExtensionConfig
        |
        +-> resolve capture mode
        |     full page -> captureVisibleTab
        |     saved region -> captureVisibleTab + crop
        |     missing region -> request region selection from content
        |
        +-> detectPlatform(tab.url)
        |     returns { platform: string, hints: string }
        |
        +-> buildPrompt(platform, hints)
        |     returns full prompt string
        |
        +-> withRetry(() => provider.analyzeImage(screenshot, prompt))
        |     +- attempt 1 --> HTTP to LLM server
        |     +- (retry on 5xx / network error)
        |     +- returns raw text response
        |
        +-> parseResponse(rawText)
        |     returns QuizAnswer
        |
        +-> appendLog({ answer, captureMode, platform, timestamp })
        |
        +-> chrome.action.setBadgeText({ text: '87%' })
        |   chrome.action.setBadgeBackgroundColor({ color: '#00d4aa' })
        |
        +-> sendToTab(tabId, { type: 'ANSWER_READY', payload: answer })
                |
                v
          Content Script receives ANSWER_READY
                |
                +-> overlay.show(answer)
                      injects/updates Shadow DOM panel
                      fade-in animation
```

### Flow 2: Popup Status Request

```
User clicks extension icon
        |
        v
Popup opens, popup.ts runs
        |
        +-> query active tab -> tabId
        |
        +-> sendMessage({ type: 'GET_STATUS', payload: { tabId } })
                |
                v
          Background receives GET_STATUS
                |
                +-> bounded provider health check
                |   (fixed short timeout)
                |
                +-> read tab_analysis_state
                |   and require tabUrl match
                |
                +-> respond with { type: 'STATUS', payload: {
                      active: true,
                      providerEndpoint: 'localhost:11434',
                      providerConnected: true,
                      lastCaptureMode: 'region',
                      providerName: 'ollama',
                      lastPlatform: 'kahoot',
                      modelName: 'qwen2.5-vl',
                      lastAnswer: QuizAnswer | undefined,
                      lastUpdatedAt: 1711111111111
                    }}
                        |
                        v
                  Popup receives STATUS
                        |
                        +-> render status card, last answer, etc.
                        |
                        +-> STATUS_CHANGED { tabId } later triggers
                            a fresh GET_STATUS refresh for the active tab
```

### Flow 3: Configuration Update

```
User changes settings in Options page
        |
        v
options.ts calls setConfig({ llmProvider: 'openai-compatible', ... })
        |
        +-> writes to chrome.storage.local
        |
        +-> sendMessage({ type: 'CONFIG_UPDATED', payload: partial })
                |
                v
          Background receives CONFIG_UPDATED
                |
                +-> invalidate cached provider instance
                |
                +-> broadcast to all tabs:
                    sendToTab(tabId, { type: 'CONFIG_UPDATED', payload })
                        |
                        v
                  Each content script updates behavior
                  (e.g., auto-capture toggle changes)
```

### Flow 4: Error Path

```
LLM call fails (timeout, network error, parse failure)
        |
        v
withRetry exhausts retries
        |
        v
catch block in orchestrator
        |
        +-> handleError(err) -> AgentError { code, userMessage }
        |
        +-> console.error('[conquest]', code, message, stack)
        |
        +-> chrome.action.setBadgeText({ text: '!' })
        |   chrome.action.setBadgeBackgroundColor({ color: '#e04060' })
        |
        +-> sendToTab(tabId, { type: 'ERROR', payload: { code, userMessage } })
                |
                v
          Content script receives ERROR
                |
                +-> overlay.showError(userMessage)
                      red-tinted glass panel
                      auto-dismiss after 5s

          (simultaneously, if popup is open)
          Popup receives ERROR via onMessage listener
                |
                +-> show error banner at top
                      auto-dismiss after 5s
```

## LLM Provider Abstraction

### Interface

```typescript
export interface VisionLLMProvider {
  readonly name: string
  isAvailable(): Promise<boolean>
  analyzeImage(image: string, prompt: string): Promise<QuizAnswer>
}
```

`image` is always a base64-encoded PNG string (no data URI prefix — just the raw base64). `prompt` is a fully-constructed analysis prompt including platform hints.

### Factory Pattern

```typescript
// llm/factory.ts

let cachedProvider: VisionLLMProvider | null = null
let cachedConfigHash: string = ''

export function createProvider(config: ExtensionConfig): VisionLLMProvider {
  const hash = `${config.llmProvider}:${config.llmEndpoint}:${config.llmModel}`
  if (cachedProvider && cachedConfigHash === hash) return cachedProvider

  switch (config.llmProvider) {
    case 'ollama':
      cachedProvider = new OllamaProvider(config.llmEndpoint, config.llmModel)
      break
    case 'openai-compatible':
      cachedProvider = new OpenAICompatProvider(config.llmEndpoint, config.llmModel)
      break
  }

  cachedConfigHash = hash
  return cachedProvider
}

export function invalidateProvider(): void {
  cachedProvider = null
  cachedConfigHash = ''
}

export async function autoDetect(): Promise<VisionLLMProvider | null> {
  // 1. Try Ollama at default port
  // 2. Try LM Studio at localhost:1234
  // 3. Try other presets
  // Return first available, or null
}
```

### Ollama Provider

```
POST http://localhost:11434/api/generate
{
  "model": "qwen2.5-vl",
  "prompt": "<analysis prompt>",
  "images": ["<base64 PNG>"],
  "stream": false
}

Response: { "response": "<text containing JSON answer>" }
```

### OpenAI-Compatible Provider

```
POST http://localhost:1234/v1/chat/completions
{
  "model": "qwen2.5-vl",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "<analysis prompt>" },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,<image>" } }
    ]
  }],
  "max_tokens": 1000,
  "temperature": 0.1
}

Response: { "choices": [{ "message": { "content": "<text>" } }] }
```

Note: The OpenAI-compatible provider prepends `data:image/png;base64,` to the image. The Ollama provider sends raw base64.

## Multi-Strategy Response Parsing Cascade

LLMs do not reliably output clean JSON. The parser tries four strategies in order and returns the first successful parse.

```typescript
// llm/parser.ts

export function parseResponse(raw: string): QuizAnswer {
  // Strategy 1: Direct JSON.parse
  //   The LLM may have returned pure JSON
  try {
    const parsed = JSON.parse(raw)
    if (isQuizAnswer(parsed)) return normalizeAnswer(parsed)
  } catch { /* continue */ }

  // Strategy 2: Extract from ```json ... ``` fenced block
  //   LLMs frequently wrap JSON in markdown code fences
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fencedMatch?.[1]) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim())
      if (isQuizAnswer(parsed)) return normalizeAnswer(parsed)
    } catch { /* continue */ }
  }

  // Strategy 3: Extract bare {...} object
  //   LLM may have output JSON embedded in surrounding text
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch?.[0]) {
    try {
      const parsed = JSON.parse(braceMatch[0])
      if (isQuizAnswer(parsed)) return normalizeAnswer(parsed)
    } catch { /* continue */ }
  }

  // Strategy 4: Fallback — return raw text as the answer with confidence 0
  //   Parsing failed entirely; user still sees the raw LLM output
  return {
    answer: raw.trim().slice(0, 500),
    confidence: 0,
    reasoning: '',
    questionType: 'unknown',
  }
}
```

**`normalizeAnswer` ensures:**
- `confidence` is clamped to `[0, 1]`
- `answer` is a non-empty string (falls back to `'No answer extracted'`)
- `reasoning` defaults to `''` if missing
- `questionType` defaults to `'unknown'` if missing

**`isQuizAnswer` type guard checks:**
- Value is a non-null object
- `answer` property exists and is a string
- `confidence` property exists and is a number

## Storage Schema

All data is stored in `chrome.storage.local` under these keys:

### `config` Key

```typescript
interface ExtensionConfig {
  captureMode: CaptureMode           // 'fullpage' | 'region'
  llmProvider: LLMProviderType       // 'ollama' | 'openai-compatible'
  llmEndpoint: string                // e.g., 'http://localhost:11434'
  llmModel: string                   // e.g., 'qwen2.5-vl'
  autoCapture: boolean               // auto-capture on known platforms
  keyboardShortcut: string           // display only — actual shortcut in manifest commands
  llmTimeoutMs: number               // LLM request timeout, default 30000
}
```

**Default values** (from `constants.ts`):

```typescript
export const DEFAULT_CONFIG: ExtensionConfig = {
  captureMode: 'fullpage',
  llmProvider: 'ollama',
  llmEndpoint: 'http://localhost:11434',
  llmModel: 'qwen2.5-vl',
  autoCapture: false,
  keyboardShortcut: 'Alt+Q',
  llmTimeoutMs: 30_000,
}
```

### `session_log` Key

```typescript
interface LogEntry {
  answer: QuizAnswer
  screenshotThumbnail?: string    // optional: small base64 thumbnail
  platform: string                // detected platform name or 'generic'
  timestamp: number               // Date.now()
}
```

Stored as a JSON array. Maximum 500 entries. Oldest entries trimmed when limit is exceeded. Cleared on extension install/activate (session-scoped).

### `regions` Key

```typescript
// Per-domain saved capture regions
Record<string, { x: number, y: number, w: number, h: number }>
```

### Storage Access Pattern

```typescript
// storage.ts exports:
export async function getConfig(): Promise<ExtensionConfig>
export async function setConfig(partial: Partial<ExtensionConfig>): Promise<void>
export async function getSessionLog(): Promise<LogEntry[]>
export async function appendLog(entry: LogEntry): Promise<void>
export async function clearSessionLog(): Promise<void>
export async function exportSessionLog(): Promise<string>
export async function getMaskedConfig(): Promise<ExtensionConfig>
export async function getSavedRegion(domain: string): Promise<Region | undefined>
export async function saveRegion(domain: string, region: Region): Promise<void>
export async function getTabAnalysisState(
  tabId: number,
  currentTabUrl?: string,
): Promise<TabAnalysisState | undefined>
export async function setTabAnalysisState(
  tabId: number,
  state: TabAnalysisState,
): Promise<void>
export async function clearTabAnalysisState(tabId: number): Promise<void>
export async function clearAllTabAnalysisState(): Promise<void>
```

`getConfig` merges stored values with `DEFAULT_CONFIG`, so missing fields always have defaults. `setConfig` does a shallow merge (spread) with existing config.
`session_log` remains in `chrome.storage.local`, while `tab_analysis_state` is stored in `chrome.storage.session` when available and falls back to local storage only when session storage is unavailable.

## Security Boundaries

### Boundary 1: Content Script vs Background

The content script runs in the web page context (isolated world). It has no access to LLM endpoints. All LLM communication is routed through the background service worker via `chrome.runtime.sendMessage`.

```
Content Script                    Background Worker
-------------------               -------------------
Cannot call LLM endpoints  -----> Only component that calls LLM endpoints
Cannot access storage keys -----> Full access to chrome.storage.local
  (except via messages)
Injects overlay via Shadow -----> Manages provider lifecycle
  DOM (style isolation)
```

### Boundary 2: No Host Permissions

The extension requests only:
- `activeTab`: grants access to the current tab when the user invokes the extension (click or shortcut)
- `storage`: for `chrome.storage.local`
- `tabs`: for `chrome.tabs.captureVisibleTab`

No `<all_urls>`, no `http://*/*`. The extension cannot read page content or make requests on behalf of the page.

### Boundary 3: Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'"
}
```

No inline scripts, no eval, no remote scripts on extension pages.

### Boundary 4: Local-Only Network

LLM endpoints are restricted in code to `localhost`, loopback, and RFC1918 private IPv4 addresses over `http://` or `https://`. The extension blocks public hosts before saving config and again before provider use, so screenshots cannot be sent to arbitrary remote endpoints through the supported UI.

### Boundary 5: Shadow DOM Isolation

The overlay is injected into host pages inside a closed Shadow DOM root:

```typescript
const host = document.createElement('div')
host.id = 'conquest-overlay-host'
const shadow = host.attachShadow({ mode: 'closed' })
// inject styles and overlay HTML into shadow
document.body.appendChild(host)
```

`mode: 'closed'` prevents host page scripts from accessing the shadow internals.

## Error Handling Strategy

### ErrorCode Enum

```typescript
export enum ErrorCode {
  CaptureFailed = 'CAPTURE_FAILED',
  LlmUnavailable = 'LLM_UNAVAILABLE',
  LlmError = 'LLM_ERROR',
  LlmTimeout = 'LLM_TIMEOUT',
  ParseFailed = 'PARSE_FAILED',
  StorageError = 'STORAGE_ERROR',
}
```

### AgentError Class

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

### Error Normalization

```typescript
export function handleError(error: unknown): AgentError {
  if (error instanceof AgentError) return error

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new AgentError(
      ErrorCode.LlmUnavailable,
      'LLM endpoint unreachable: check that your local server is running',
      error,
    )
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AgentError(
      ErrorCode.LlmTimeout,
      `LLM timeout: no response after configured timeout`,
      error,
    )
  }

  if (error instanceof Error) {
    return new AgentError(ErrorCode.LlmError, error.message, error)
  }

  return new AgentError(ErrorCode.LlmError, String(error))
}
```

### Retry Logic

```typescript
// llm/retry.ts

export interface RetryOptions {
  maxRetries: number        // default 2 (3 total attempts)
  baseDelayMs: number       // default 1000
  backoffMultiplier: number // default 2
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err

      // Do NOT retry on client errors (4xx)
      if (isClientError(err)) throw err

      // Do NOT retry on final attempt
      if (attempt === options.maxRetries) throw err

      const delay = options.baseDelayMs * (options.backoffMultiplier ** attempt)
      await sleep(delay)
    }
  }

  throw lastError // unreachable but satisfies TS
}

function isClientError(err: unknown): boolean {
  if (err instanceof AgentError && err.code === ErrorCode.ParseFailed) return true
  // Check for HTTP 4xx in fetch errors
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status
    return status >= 400 && status < 500
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

**Retry sequence:** attempt 0 (immediate) -> 1000ms delay -> attempt 1 -> 2000ms delay -> attempt 2 (final).

### Timeout Implementation

The background service worker wraps LLM calls with `AbortController`:

```typescript
async function callWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}
```

Both provider implementations accept `AbortSignal` and pass it to `fetch`.

## Message Types (Discriminated Union)

```typescript
export type Message =
  | { type: 'ANSWER_READY', payload: QuizAnswer }
  | { type: 'CLEAR_SESSION_STATE', payload: null }
  | { type: 'CONFIG_UPDATED', payload: Partial<ExtensionConfig> }
  | { type: 'ERROR', payload: { code: ErrorCode, userMessage: string } }
  | { type: 'GET_STATUS', payload: { tabId?: number | null } }
  | { type: 'LIST_VISION_MODELS', payload: null }
  | { type: 'OLLAMA_PULL_RESULT', payload: { errorMessage?: string, ok: boolean } }
  | { type: 'PROVIDER_CONNECTION_RESULT', payload: ProviderConnectionResult }
  | { type: 'PULL_OLLAMA_MODEL', payload: { model: string } }
  | { type: 'REGION_SELECTED', payload: { region: Region, tabUrl: string, triggerSource: TriggerSource } }
  | { type: 'REGION_SELECTION_CANCELLED', payload: null }
  | { type: 'SESSION_STATE_CLEARED', payload: null }
  | { type: 'START_CAPTURE', payload: { mode: CaptureTriggerMode, tabId?: number | null, triggerSource: TriggerSource } }
  | { type: 'START_REGION_SELECTION', payload: null }
  | { type: 'STATUS', payload: StatusPayload }
  | { type: 'STATUS_CHANGED', payload: { tabId: number } }
  | { type: 'TEST_PROVIDER_CONNECTION', payload: null }
  | { type: 'VISION_MODELS_RESULT', payload: { errorMessage?: string, models: string[] } }

export interface StatusPayload {
  lastCaptureMode?: CaptureMode
  lastErrorCode?: string
  lastLatencyMs?: number
  lastParseStrategy?: ParseStrategy
  lastTriggerSource?: TriggerSource
  providerConnected: boolean
  providerEndpoint: string
  providerErrorMessage?: string
  providerName: string
  providerStatus: ProviderStatus
  lastPlatform?: string
  modelName: string
  lastAnswer?: QuizAnswer
  lastUpdatedAt?: number
  statusCheckedAt: number
}
```

All messages are sent via `chrome.runtime.sendMessage` (content/popup to background) or `chrome.tabs.sendMessage` (background to content). Typed wrapper functions enforce the `Message` type at call sites.

## Build Configuration

### Vite + CRXJS

```typescript
// vite.config.ts (conceptual shape)
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  build: {
    target: 'es2022',
    minify: 'terser',
    rollupOptions: {
      // Content script and background are separate entry points
      // handled by CRXJS based on manifest.json declarations
    },
  },
  plugins: [
    crx({ manifest }),
  ],
})
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome"],
    "jsx": "preserve",
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

## Test Strategy

Target: ~60% coverage on critical paths.

| Module                    | Test Type    | What Is Tested                                                 |
|---------------------------|-------------|----------------------------------------------------------------|
| `llm/parser.ts`          | Unit        | All 4 parsing strategies, edge cases, malformed input          |
| `detect/platform.ts`     | Unit        | All supported platforms, case sensitivity, unknown URLs        |
| `lib/storage.ts`         | Unit        | Config CRUD, log append/trim/clear, default merging            |
| `llm/retry.ts`           | Unit        | Retry count, backoff timing, 4xx non-retry, success on retry   |
| Integration              | Integration | Full pipeline with mocked chrome APIs and mocked LLM server   |

Tests use Vitest with jsdom environment. Chrome API mocking via a lightweight mock object in test setup files. No browser-level E2E tests — the integration test mocks at the `chrome.*` API boundary and the HTTP fetch boundary.
