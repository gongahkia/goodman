# TC-Guard Style Guide

All code conventions for the TC-Guard browser extension. Read this before writing any TypeScript, CSS, or test file.

## TypeScript Configuration

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@providers/*": ["src/providers/*"],
      "@content/*": ["src/content/*"],
      "@background/*": ["src/background/*"],
      "@popup/*": ["src/popup/*"],
      "@summarizer/*": ["src/summarizer/*"],
      "@versioning/*": ["src/versioning/*"]
    }
  }
}
```

- `strict: true` — no exceptions.
- No `any` type. Use `unknown` + type narrowing.
- Explicit return types on all exported functions.
- Prefer `interface` over `type` for object shapes. Use `type` for unions and intersections.
- Avoid enums. Use union types: `type Severity = 'low' | 'medium' | 'high' | 'critical'`.

## File Naming

- **Source files:** kebab-case with `.ts`. Examples: `checkbox-detector.ts`, `summary-diff.ts`.
- **Test files:** same name with `.test.ts`. Example: `checkbox-detector.test.ts`.
- **Index files:** `index.ts` for barrel exports only. Never put business logic in index files.
- **CSS:** No separate CSS files. CSS lives as template literal strings inside Shadow DOM components.

## Export Naming

| Kind | Convention | Example |
|------|-----------|---------|
| Functions | camelCase | `detectCheckboxes()`, `computeSeverity()` |
| Classes | PascalCase | `OpenAIProvider`, `CheckboxDetector` |
| Interfaces/Types | PascalCase | `DetectedElement`, `LLMProvider` |
| Constants | UPPER_SNAKE_CASE | `STORAGE_VERSION`, `DEFAULT_SETTINGS` |

## Import Ordering

Four groups separated by blank lines, alphabetical within each group:

```typescript
// 1. External packages
import { diffLines } from 'diff';
import browser from 'webextension-polyfill';

// 2. Internal absolute imports (path aliases)
import { ok, err } from '@shared/result';
import type { Summary } from '@providers/types';

// 3. Parent/sibling relative imports
import { normalizeText } from '../extractors/normalizer';

// 4. Same-directory relative imports
import { KEYWORDS } from './constants';
```

Configure the same path aliases in `vite.config.ts` via `resolve.alias`.

## Error Handling: The Result Pattern

All functions that can fail return `Result<T, E>` instead of throwing.

### Definition

Place in `src/shared/result.ts`:

```typescript
export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export function ok<T>(data: T): Result<T, never> {
  return { ok: true, data };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

### Usage

```typescript
import { ok, err, type Result } from '@shared/result';

function parseJson(raw: string): Result<Summary, InvalidResponseError> {
  try {
    const data = JSON.parse(raw) as unknown;
    const validated = validateSummary(data);
    if (!validated) {
      return err(new InvalidResponseError('Invalid summary structure'));
    }
    return ok(validated);
  } catch {
    return err(new InvalidResponseError('Failed to parse JSON response'));
  }
}

// Caller
const result = parseJson(response);
if (!result.ok) {
  showError(result.error.userMessage);
  return;
}
renderSummary(result.data);
```

### Where Result is required

- All LLM provider `summarize()` calls
- Storage reads/writes
- URL fetching
- JSON parsing
- Text extraction from DOM or linked pages

### Where Result is NOT needed

- Pure functions that cannot fail (severity computation, text normalization)
- DOM element creation
- Simple data transformations

### When to throw

Only for programmer errors — assertion failures, unreachable code paths. These indicate bugs, not runtime conditions.

## Error Types

All custom errors extend `TCGuardError`. Place in `src/shared/errors.ts`:

```typescript
export class TCGuardError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'TCGuardError';
  }
}

export class NetworkError extends TCGuardError {
  constructor(provider: string) {
    super(
      `Network error connecting to ${provider}`,
      `Could not connect to ${provider}. Check your internet connection.`,
      'NETWORK_ERROR'
    );
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends TCGuardError {
  constructor(provider: string, public readonly retryAfterSeconds: number) {
    super(
      `Rate limited by ${provider}`,
      `Rate limited by ${provider}. Please wait ${retryAfterSeconds} seconds.`,
      'RATE_LIMIT'
    );
    this.name = 'RateLimitError';
  }
}

export class InvalidResponseError extends TCGuardError {
  constructor(detail: string) {
    super(
      `Invalid LLM response: ${detail}`,
      'The AI returned an unexpected response. Retrying...',
      'INVALID_RESPONSE'
    );
    this.name = 'InvalidResponseError';
  }
}

export class ProviderError extends TCGuardError {
  constructor(provider: string, detail: string) {
    super(
      `${provider} error: ${detail}`,
      `${provider} encountered an error. Try again or switch providers.`,
      'PROVIDER_ERROR'
    );
    this.name = 'ProviderError';
  }
}

export class ExtractionError extends TCGuardError {
  constructor(detail: string) {
    super(
      `Extraction failed: ${detail}`,
      'Could not extract text from this page. The page structure may be unsupported.',
      'EXTRACTION_ERROR'
    );
    this.name = 'ExtractionError';
  }
}
```

## Function Design

- Keep functions under 40 lines. Extract helpers.
- Pure functions preferred. Side effects isolated to boundary modules (storage, messaging, DOM).
- Single responsibility: one function does one thing.
- Comment the WHY, not the WHAT. Add brief comments when making best-judgment calls on ambiguous requirements.

## CSS in Shadow DOM

CSS is written as template literal strings injected via `<style>` tags inside Shadow DOM:

```typescript
const styles = `
  :host {
    all: initial;
    font-family: var(--tc-font-family);
    color: var(--tc-text);
  }

  .tc-guard-overlay {
    background: var(--tc-bg);
    border: 1px solid var(--tc-border);
    border-radius: var(--tc-radius-lg);
    box-shadow: var(--tc-shadow-lg);
    max-width: 380px;
    max-height: 500px;
    overflow-y: auto;
  }
`;

const style = document.createElement('style');
style.textContent = styles;
shadowRoot.appendChild(style);
```

- All class names prefixed with `tc-guard-` to avoid collisions.
- Use CSS custom properties (variables) for all design tokens. See `DESIGN_SYSTEM.md` for the complete token set.
- `:host { all: initial }` resets inherited styles from the host page.

## Testing Conventions (TDD)

### Framework

- **Vitest** with `jsdom` environment for DOM tests.
- Tests live in the `tests/` directory mirroring `src/` structure: `tests/detectors/`, `tests/extractors/`, etc.

### TDD Workflow

1. Write the test first (match DONE WHEN criteria from `todo.txt`).
2. Run `pnpm test` — see it fail (red).
3. Implement minimum code to pass (green).
4. Refactor for clarity.
5. Run full suite — confirm no regressions.

### Test Structure

Use Arrange-Act-Assert pattern. Name tests descriptively:

```typescript
import { describe, it, expect } from 'vitest';
import { detectCheckboxes } from '@content/detectors/checkbox';

describe('detectCheckboxes', () => {
  it('should detect a standard checkbox with T&C label with confidence >= 0.8', () => {
    // Arrange
    const root = document.createElement('div');
    root.innerHTML = `
      <input type="checkbox" id="agree">
      <label for="agree">I agree to the <a href="/terms">Terms</a></label>
    `;
    document.body.appendChild(root);

    // Act
    const results = detectCheckboxes(root);

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.8);
    expect(results[0].type).toBe('checkbox');

    // Cleanup
    document.body.removeChild(root);
  });

  it('should not detect a "Remember me" checkbox', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <input type="checkbox" id="remember">
      <label for="remember">Remember me</label>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results).toHaveLength(0);
    document.body.removeChild(root);
  });
});
```

### Chrome API Mocks

Reusable mock in `tests/mocks/chrome.ts`:

```typescript
import { vi } from 'vitest';

export const mockStorage: Record<string, unknown> = {};

export const chrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (key in mockStorage) result[key] = mockStorage[key];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
  },
};
```

Register in Vitest's `setupFiles` to make `chrome` globally available in test environments.

### LLM Provider Mocks

Never make real API calls in tests. Return canned `Summary` objects:

```typescript
export const mockSummary: Summary = {
  summary: 'This service collects your data and shares it with third parties.',
  keyPoints: ['Data is shared with advertisers', 'No deletion rights'],
  redFlags: [
    {
      category: 'data_selling',
      description: 'Your data is sold to third parties.',
      severity: 'high',
      quote: 'We may sell your personal information to selected partners.',
    },
  ],
  severity: 'high',
};
```

## i18n Conventions

All user-facing strings go through Chrome's i18n API.

### Messages file structure

`_locales/en/messages.json`:

```json
{
  "EXTENSION_NAME": {
    "message": "TC Guard",
    "description": "Extension name shown in browser"
  },
  "OVERLAY_CLOSE": {
    "message": "Close",
    "description": "Close button aria-label on overlay"
  },
  "SEVERITY_LOW": {
    "message": "Low",
    "description": "Severity badge label"
  },
  "SEVERITY_CRITICAL": {
    "message": "Critical",
    "description": "Severity badge label"
  },
  "POPUP_NO_TC": {
    "message": "No T&C detected on this page",
    "description": "Shown in popup when no terms found"
  },
  "ERROR_NETWORK": {
    "message": "Could not connect to $PROVIDER$. Check your internet connection.",
    "description": "Network error message",
    "placeholders": {
      "PROVIDER": {
        "content": "$1",
        "example": "OpenAI"
      }
    }
  }
}
```

### Key naming

UPPER_SNAKE_CASE with module prefix:

- `OVERLAY_*` — overlay UI strings
- `POPUP_*` — popup UI strings
- `SEVERITY_*` — severity labels
- `RED_FLAG_*` — red flag category names
- `SETTINGS_*` — settings UI strings
- `ERROR_*` — error messages
- `EXTENSION_*` — manifest-level strings

### Usage in code

```typescript
const label = browser.i18n.getMessage('SEVERITY_CRITICAL');
const errorMsg = browser.i18n.getMessage('ERROR_NETWORK', ['OpenAI']);
```

Never concatenate translated strings — use placeholders instead.

## ESLint & Prettier

### Prettier (`.prettierrc`)

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### ESLint (`.eslintrc.cjs`)

```javascript
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': ['error', {
      allowExpressions: true,
      allowHigherOrderFunctions: true,
    }],
    'no-console': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
};
```
