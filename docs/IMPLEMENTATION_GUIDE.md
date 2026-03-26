# Goodman Implementation Guide

Step-by-step execution playbook for implementing Goodman. This document tells you exactly what order to build things in, how to apply TDD, and what pitfalls to avoid.

## Pre-Implementation Checklist

Before writing any code, read these documents in order:

1. `CLAUDE.md` — Project overview, conventions, rules
2. `ARCHITECTURE.md` — System architecture, data flow, module boundaries
3. `STYLE_GUIDE.md` — Code conventions, Result pattern, testing patterns
4. `DESIGN_SYSTEM.md` — Design tokens, component patterns
5. This file (`IMPLEMENTATION_GUIDE.md`) — Execution order and workflow

Then read `todo.txt` in full to understand all 57 tasks.

## Task Execution Order

Tasks are organized into waves based on `blockedBy` dependencies. Within each wave, tasks are independent and can be done in any order. Execute waves sequentially; within a wave, follow the suggested sub-order.

### Wave 1 — Foundation (no dependencies)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 1 | Task 0 | scaffold | Initialize project with pnpm, Vite, crxjs, TypeScript, ESLint, Prettier |
| 2 | Task 13 | extraction | Text normalizer (standalone, no deps) |

> After Task 0: verify `pnpm dev` and `pnpm build` work. Create `src/shared/result.ts` with the Result type. Create `_locales/en/messages.json` with initial entries. Set up path aliases in `tsconfig.json` and `vite.config.ts`.

### Wave 2 — Manifest (depends on Task 0)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 3 | Task 1 | scaffold | Create Manifest V3 configuration |

### Wave 3 — Message Passing (depends on Task 1)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 4 | Task 2 | scaffold | Typed message-passing backbone |

### Wave 4 — Core Infrastructure (depends on Task 2)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 5 | Task 3 | scaffold | Storage schema and typed accessors |
| 6 | Task 53 | compat | webextension-polyfill integration |
| 7 | Task 4 | detection | MutationObserver for dynamic DOM |
| 8 | Task 10 | extraction | Linked page text extraction |

### Wave 5 — Detectors + Provider Interface (depends on Wave 4)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 9 | Task 14 | providers | LLMProvider interface definition |
| 10 | Task 21 | providers | System prompt + red flag taxonomy |
| 11 | Task 5 | detection | Checkbox detector |
| 12 | Task 6 | detection | Modal/banner detector |
| 13 | Task 7 | detection | Full-page T&C detector |
| 14 | Task 11 | extraction | PDF text extraction |
| 15 | Task 43 | security | API key security |
| 16 | Task 54 | compat | Firefox dual-manifest |

> Do Task 14 and 21 before the providers (Wave 6) since providers depend on the interface and prompt.

### Wave 6 — Provider Implementations (depends on Task 14)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 17 | Task 15 | providers | OpenAI provider |
| 18 | Task 16 | providers | Claude provider |
| 19 | Task 17 | providers | Gemini provider |
| 20 | Task 18 | providers | Ollama provider |
| 21 | Task 19 | providers | Custom endpoint provider |
| 22 | Task 9 | extraction | Inline text extraction (depends on 5, 6) |
| 23 | Task 8 | detection | Unified scoring (depends on 5, 6, 7) |
| 24 | Task 12 | extraction | Text chunker (depends on 9, 10) |
| 25 | Task 56 | docs | Red flag category documentation |

### Wave 7 — Provider Factory + Tests (depends on Wave 6)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 26 | Task 20 | providers | Provider factory |
| 27 | Task 42 | security | Typed error handling for all providers |
| 28 | Task 45 | testing | Detection unit tests |
| 29 | Task 46 | testing | Extraction unit tests |
| 30 | Task 57 | docs | Developer guide for adding providers |

### Wave 8 — Summarization + Popup Base (depends on Wave 7)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 31 | Task 22 | summarizer | Single-shot summarization |
| 32 | Task 36 | popup | Popup base UI |

### Wave 9 — Summarization Pipeline + UI (depends on Wave 8)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 33 | Task 23 | summarizer | Chunked map-reduce summarization |
| 34 | Task 24 | summarizer | Severity computation |
| 35 | Task 25 | summarizer | Summary caching |
| 36 | Task 32 | ui | Overlay panel (Shadow DOM) |
| 37 | Task 38 | popup | Provider settings UI |
| 38 | Task 39 | popup | Detection sensitivity settings |

### Wave 10 — Overlay Polish + Versioning Start (depends on Wave 9)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 39 | Task 33 | ui | Overlay positioning |
| 40 | Task 34 | ui | Dark/light theme support |
| 41 | Task 35 | ui | Dismiss/re-show with animations |
| 42 | Task 44 | security | XSS prevention in overlay |
| 43 | Task 26 | versioning | Version history schema |
| 44 | Task 40 | popup | Cache management UI |
| 45 | Task 47 | testing | Summarizer unit tests |

### Wave 11 — Version Change Detection (depends on Wave 10)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 46 | Task 27 | versioning | Change detection (hash comparison) |

### Wave 12 — Diffing (depends on Wave 11)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 47 | Task 28 | versioning | Text-level diffing |

### Wave 13 — Summary Diff + Notifications (depends on Wave 12)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 48 | Task 29 | versioning | Summary-level diffing |

### Wave 14 — Version UI + Notifications (depends on Wave 13)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 49 | Task 30 | versioning | Version timeline UI |
| 50 | Task 31 | versioning | Change notifications (badge + banner) |
| 51 | Task 48 | testing | Version tracking integration tests |

### Wave 15 — Popup Completion + CI (depends on Wave 14)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 52 | Task 37 | popup | Version history panel in popup |
| 53 | Task 41 | popup | Per-domain notification toggles |
| 54 | Task 50 | cicd | GitHub Actions CI workflow |

### Wave 16 — E2E + Packaging (depends on Wave 15)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 55 | Task 49 | testing | E2E tests with Playwright |
| 56 | Task 51 | cicd | Chrome/Firefox packaging |

### Wave 17 — Distribution + Docs (depends on Wave 16)

| Order | Task | Tag | Description |
|-------|------|-----|-------------|
| 57 | Task 52 | cicd | Store submission scripts |
| 58 | Task 55 | docs | README |

## TDD Workflow Per Task

For every task (except scaffold tasks 0-1 which are configuration):

### The Cycle

1. **Read** the task's PURPOSE, WHAT TO DO, and DONE WHEN in `todo.txt`.
2. **Create the test file** first. Each DONE WHEN checkbox should map to at least one test assertion.
3. **Run `pnpm test`** — see the tests fail (red).
4. **Implement** the minimum code to make all tests pass (green).
5. **Refactor** — apply naming conventions from `STYLE_GUIDE.md`, extract helpers, ensure functions are < 40 lines.
6. **Run the full suite** — `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
7. **Commit** — one commit per task, using the format from `CLAUDE.md`.

### Worked Example: Task 5 (Checkbox Detector)

```
Step 1: Read Task 5 in todo.txt
  - PURPOSE: detect checkboxes near legal text
  - DONE WHEN: 4 acceptance criteria

Step 2: Create tests/detectors/checkbox.test.ts

  describe('detectCheckboxes', () => {
    it('should detect standard checkbox+label with confidence >= 0.8', ...)
    it('should detect checkbox 3 levels from T&C link with confidence >= 0.6', ...)
    it('should NOT detect "Remember me" checkbox (confidence below threshold)', ...)
    it('should return nearestLink URL when a T&C link is found', ...)
  })

Step 3: pnpm test → 4 tests FAIL (module not found)

Step 4: Create src/content/detectors/checkbox.ts
  - Implement detectCheckboxes(root: Element): DetectedElement[]
  - Query for input[type="checkbox"]
  - Walk DOM tree, check keywords, compute proximity score
  - Return DetectedElement[] with confidence, type, keywords, nearestLink

Step 5: pnpm test → 4 tests PASS

Step 6: Refactor
  - Extract keyword matching into a helper function
  - Extract DOM walking into a separate function
  - Ensure all functions have explicit return types

Step 7: pnpm typecheck && pnpm lint && pnpm test && pnpm build → all pass

Step 8: git add && git commit -m "feat(detection): Task 5 - implement checkbox detector"
```

### Tasks with Dedicated Test Tasks

Tasks 45-49 are dedicated testing tasks. When implementing the feature tasks (5-8, 9-13, 22-24, 26-29), write **basic smoke tests** alongside the implementation. Then in the dedicated test task commit, expand coverage to meet the full acceptance criteria.

## Commit Convention Details

Format: `<type>(<scope>): Task <N> - <description>`

| Type | When to Use |
|------|------------|
| `chore` | Scaffolding, configuration (Tasks 0) |
| `feat` | New functionality (most tasks) |
| `test` | Dedicated test tasks (Tasks 45-49) |
| `fix` | Security/error handling (Tasks 42-44) |
| `ci` | CI/CD pipeline (Tasks 50-52) |
| `docs` | Documentation (Tasks 55-57) |

Scope is the task tag without `+` prefix: `scaffold`, `detection`, `extraction`, `providers`, `summarizer`, `versioning`, `ui`, `popup`, `security`, `testing`, `cicd`, `compat`, `docs`.

Description: imperative mood, lowercase, no period, under 60 characters.

## Result Pattern Implementation

### Setup (during Task 0)

Create `src/shared/result.ts` as described in `STYLE_GUIDE.md`.

### Application Rules

| Module | Returns Result? | Why |
|--------|----------------|-----|
| `providers/*.ts` `summarize()` | Yes | Network calls can fail (timeout, rate limit, parse error) |
| `shared/storage.ts` get/set | Yes | Storage can be corrupted or unavailable |
| `extractors/linked.ts` | Yes | Network fetch can fail |
| `extractors/pdf.ts` | Yes | PDF parsing can fail |
| `summarizer/singleshot.ts` | Yes | Wraps provider call |
| `summarizer/chunked.ts` | Yes | Wraps multiple provider calls |
| `detectors/*.ts` | No | Pure DOM analysis, return empty array on no match |
| `extractors/normalizer.ts` | No | Pure string transformation, always succeeds |
| `extractors/chunker.ts` | No | Pure splitting, always returns at least one chunk |
| `summarizer/severity.ts` | No | Pure computation from red flags |
| `ui/overlay.ts` | No | DOM creation always succeeds |

### Propagating Results

When a function calls another Result-returning function, check and propagate early:

```typescript
async function summarizeText(text: string): Promise<Result<Summary, TCGuardError>> {
  const providerResult = await getActiveProvider();
  if (!providerResult.ok) return providerResult;

  const chunks = chunkText(text);
  if (chunks.length === 1) {
    return singleShotSummarize(chunks[0], providerResult.data);
  }
  return chunkedSummarize(chunks, providerResult.data);
}
```

## i18n Setup

### During Task 0

1. Create `_locales/en/messages.json` with initial entries (extension name, description).
2. Set `"default_locale": "en"` in the manifest.

### During every subsequent task

For every user-facing string added:
1. Add an entry to `_locales/en/messages.json`.
2. Use `browser.i18n.getMessage('KEY')` in code instead of hardcoded strings.
3. Use placeholders for dynamic values, never string concatenation.

### Key naming by module

| Prefix | Module | Example |
|--------|--------|---------|
| `EXTENSION_` | Manifest | `EXTENSION_NAME`, `EXTENSION_DESCRIPTION` |
| `OVERLAY_` | Overlay UI | `OVERLAY_TITLE`, `OVERLAY_CLOSE` |
| `POPUP_` | Popup UI | `POPUP_NO_TC`, `POPUP_ANALYZE` |
| `SEVERITY_` | Severity labels | `SEVERITY_LOW`, `SEVERITY_CRITICAL` |
| `RED_FLAG_` | Red flag names | `RED_FLAG_DATA_SELLING` |
| `SETTINGS_` | Settings UI | `SETTINGS_API_KEY`, `SETTINGS_TEST` |
| `ERROR_` | Error messages | `ERROR_NETWORK`, `ERROR_RATE_LIMIT` |
| `HISTORY_` | Version history | `HISTORY_FIRST_VERSION` |
| `NOTIFICATION_` | Change notifications | `NOTIFICATION_TC_CHANGED` |

## Accessibility Checklist Per UI Component

Apply to every component created in Tasks 30, 32-41:

- [ ] Uses semantic HTML (`<button>`, `<h2>`, `<ul>`, `<details>`, not `<div>` with click handlers)
- [ ] All interactive elements have `tabindex="0"` (or natural tabindex from semantic elements)
- [ ] All interactive elements have `role` if not implied by element type
- [ ] All interactive elements have `aria-label` or `aria-labelledby` (use i18n keys)
- [ ] Visible focus indicator: `box-shadow: 0 0 0 3px var(--tc-focus-ring)` — never `outline: none` without replacement
- [ ] Keyboard activation: Enter and Space trigger click handlers
- [ ] Color is not the sole conveyor of information (severity has text label + color)
- [ ] Expandable sections use `aria-expanded="true|false"`
- [ ] Close buttons have `aria-label="Close"` (via i18n)
- [ ] Overlay has `role="complementary"` with `aria-label`
- [ ] Minimum touch target: 32px x 32px for all clickable elements

## Chrome API Mock Setup

### Vitest configuration

In `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/mocks/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@providers': resolve(__dirname, 'src/providers'),
      '@content': resolve(__dirname, 'src/content'),
      '@background': resolve(__dirname, 'src/background'),
      '@popup': resolve(__dirname, 'src/popup'),
      '@summarizer': resolve(__dirname, 'src/summarizer'),
      '@versioning': resolve(__dirname, 'src/versioning'),
    },
  },
});
```

### Mock setup file

`tests/mocks/setup.ts`:

```typescript
import { chrome } from './chrome';

// Make chrome available globally in test environment
Object.defineProperty(globalThis, 'chrome', { value: chrome });

// Also mock the browser namespace for webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: chrome,
}));
```

### Resetting mocks between tests

```typescript
import { beforeEach } from 'vitest';
import { mockStorage } from './chrome';

beforeEach(() => {
  // Clear mock storage between tests
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);

  // Reset all mock function call counts
  vi.clearAllMocks();
});
```

## Common Pitfalls

### Shadow DOM event delegation

Events inside Shadow DOM do not bubble to `document`. Attach event listeners inside the shadow root:

```typescript
// WRONG — click will never fire
document.addEventListener('click', handler);

// RIGHT — listen inside shadow root
shadowRoot.addEventListener('click', handler);
```

### Service worker lifecycle (MV3)

MV3 service workers can be terminated after 30 seconds of inactivity. Never rely on module-level variables for persistent state:

```typescript
// WRONG — state lost when worker terminates
let cachedSettings: Settings | null = null;

// RIGHT — always read from storage
async function getSettings(): Promise<Settings> {
  const result = await getStorage('settings');
  return result.ok ? result.data : DEFAULT_SETTINGS;
}
```

### CORS in content scripts

Content scripts run in the page's origin. API calls to LLM providers will fail with CORS errors:

```typescript
// WRONG — in content script, CORS will block this
const response = await fetch('https://api.openai.com/v1/chat/completions', ...);

// RIGHT — route through background service worker
const result = await sendToBackground({ type: 'SUMMARIZE', payload: { text, provider } });
```

### Token estimation accuracy

The `text.length / 4` heuristic is approximate. Err on the side of smaller chunks to avoid exceeding provider context windows:

```typescript
// Conservative estimate — better to have one extra chunk than to exceed limits
const estimatedTokens = Math.ceil(text.length / 3.5);
```

### Storage race conditions

Multiple concurrent calls to `setStorage` can overwrite each other:

```typescript
// WRONG — race condition if called concurrently
const settings = await getStorage('settings');
settings.darkMode = 'dark';
await setStorage('settings', settings);

// RIGHT — read-modify-write in a single async operation
async function updateSettings(update: Partial<Settings>): Promise<void> {
  const current = await getStorage('settings');
  await setStorage('settings', { ...current, ...update });
}
```

### Firefox differences

Always test with both browsers after implementing cross-browser tasks:

- Firefox requires `browser_specific_settings` in manifest with `gecko.id`.
- Firefox service worker module loading differs from Chrome.
- Some `chrome.*` APIs behave slightly differently — the polyfill handles most cases.

### Closed Shadow DOM limitations

`attachShadow({ mode: 'closed' })` means `element.shadowRoot` returns `null` for external code. Keep a reference to the shadow root in module scope:

```typescript
// Store the shadow root reference — it can't be accessed externally
const shadow = host.attachShadow({ mode: 'closed' });
```

## Quality Gates

Before every commit, verify:

- [ ] `pnpm typecheck` — zero TypeScript errors
- [ ] `pnpm lint` — zero ESLint errors (zero warnings preferred)
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm build` — production build succeeds
- [ ] New code follows naming conventions from `STYLE_GUIDE.md`
- [ ] New UI follows tokens from `DESIGN_SYSTEM.md`
- [ ] New user-facing strings are in `_locales/en/messages.json`
- [ ] Functions that can fail return `Result<T, E>`
- [ ] No `innerHTML` with dynamic content
- [ ] No `console.log` with API keys

## Cross-Reference Map

| Document | Relevant For |
|----------|-------------|
| `CLAUDE.md` | All tasks — read first |
| `ARCHITECTURE.md` | Scaffolding (0-3), message passing, storage, all integration points |
| `STYLE_GUIDE.md` | All code tasks — naming, Result pattern, testing, i18n |
| `DESIGN_SYSTEM.md` | UI tasks (32-35), popup tasks (36-41), version timeline (30) |
| `IMPLEMENTATION_GUIDE.md` | Task ordering, TDD workflow, commit conventions |
| `todo.txt` | Primary specification for every task — PURPOSE, WHAT TO DO, DONE WHEN |
