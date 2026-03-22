# TC-Guard Architecture

High-level system architecture, data flow, module boundaries, and state management for TC-Guard.

## Extension Architecture

A Manifest V3 extension has three isolated execution contexts:

```
+------------------+     chrome.runtime      +---------------------+
|  Content Script  | <------- messages -----> | Background Service  |
|  (per tab)       |                          | Worker              |
|                  |                          |                     |
| - Detectors      |   chrome.tabs.sendMsg    | - Message Router    |
| - Extractors     | <----------------------- | - LLM API calls     |
| - Overlay UI     |                          | - Storage Manager   |
|                  |                          | - Version Tracker   |
+------------------+                          +---------------------+
                                                       ^
                                                       | chrome.runtime
                                                       | messages
                                                       v
                                              +---------------------+
                                              |  Popup              |
                                              | - Summary View      |
                                              | - Settings UI       |
                                              | - Version History   |
                                              +---------------------+
```

1. **Content Script** (`src/content/`) — Runs in every web page's context. Detects T&C elements, extracts text, renders the overlay in Shadow DOM. Cannot make cross-origin requests directly.

2. **Background Service Worker** (`src/background/`) — Runs in the extension's isolated context. Routes messages, makes LLM API calls (bypassing CORS), manages storage, orchestrates version tracking. Note: MV3 service workers can be terminated after 30s of inactivity — never store state in module-level variables.

3. **Popup** (`src/popup/`) — Opens when the extension icon is clicked. Shows current page summary, settings, version history. Reconstructs state on every open by querying background.

## Directory Structure

```
src/
  manifest.ts                    # MV3 manifest (Chrome + Firefox variants)
  content/
    index.ts                     # Content script entry point
    detectors/
      observer.ts                # MutationObserver for dynamic DOM changes
      checkbox.ts                # Checkbox + T&C label proximity detection
      modal.ts                   # Modal/banner/cookie consent detection
      fullpage.ts                # Full-page T&C detection (keyword density)
      scoring.ts                 # Unified scoring, threshold, deduplication
    extractors/
      inline.ts                  # Extract text from DOM containers
      linked.ts                  # Fetch + extract text from linked T&C pages
      pdf.ts                     # PDF text extraction via pdfjs-dist
      chunker.ts                 # Split long text into LLM-sized chunks
      normalizer.ts              # Strip HTML, normalize whitespace, remove boilerplate
    ui/
      overlay.ts                 # Shadow DOM overlay panel component
      positioning.ts             # Viewport-aware smart positioning
      theme.ts                   # Light/dark theme detection and switching
  background/
    index.ts                     # Service worker entry, central message router
  popup/
    index.html                   # Popup HTML shell
    index.ts                     # Popup entry point
    history.ts                   # Version history timeline view
    settings/
      providers.ts               # LLM provider configuration (API keys, models)
      detection.ts               # Detection sensitivity settings
      cache.ts                   # Cache management UI
      notifications.ts           # Notification preferences
  shared/
    messages.ts                  # Discriminated union message types
    messaging.ts                 # Send/receive helpers (polyfilled for Firefox)
    storage.ts                   # Typed storage schema + accessors
    errors.ts                    # Error type hierarchy (TCGuardError base)
    result.ts                    # Result<T, E> type + ok/err helpers
    constants.ts                 # Shared constants (STORAGE_VERSION, thresholds)
  providers/
    types.ts                     # LLMProvider interface, Summary, RedFlag types
    openai.ts                    # OpenAI GPT provider
    claude.ts                    # Anthropic Claude provider
    gemini.ts                    # Google Gemini provider
    ollama.ts                    # Ollama local inference provider
    custom.ts                    # Custom OpenAI-compatible endpoint
    factory.ts                   # Provider factory (reads config, returns active)
    prompts.ts                   # System prompt + red flag taxonomy
  summarizer/
    singleshot.ts                # Single API call summarization (short docs)
    chunked.ts                   # Map-reduce summarization (long docs)
    severity.ts                  # Deterministic severity computation from red flags
    cache.ts                     # SHA-256 keyed summary cache (30-day TTL)
  versioning/
    schema.ts                    # VersionEntry type + storage (20-version limit)
    detector.ts                  # Change detection via hash comparison
    diff.ts                      # Line-level text diffing
    summary-diff.ts              # Summary-level diff (red flag/severity changes)
    notifications.ts             # Badge + popup notification on T&C changes
    ui/
      timeline.ts                # Version timeline component
_locales/
  en/
    messages.json                # English i18n strings
public/
  icons/
    tc-guard-16.png
    tc-guard-48.png
    tc-guard-128.png
tests/
  mocks/
    chrome.ts                    # Chrome API mocks for Vitest
    providers.ts                 # Canned LLM response fixtures
  detectors/
    checkbox.test.ts
    modal.test.ts
    fullpage.test.ts
    scoring.test.ts
  extractors/
    inline.test.ts
    linked.test.ts
    normalizer.test.ts
    chunker.test.ts
  summarizer/
    parsing.test.ts
    severity.test.ts
  versioning/
    tracking.test.ts
    diff.test.ts
    summary-diff.test.ts
  fixtures/
    simple-tc.html
    messy-tc.html
    long-tc.html
    valid-summary.json
    malformed-summary.json
    invalid-json.txt
  e2e/
    extension.spec.ts
```

## Data Flow: Detection to Summary

```
Page Load / DOM Mutation
  |
  v
MutationObserver (observer.ts)
  |  debounce 500ms
  v
Detectors run (parallel):
  checkbox.ts  --> DetectedElement[]
  modal.ts     --> DetectedElement[]
  fullpage.ts  --> DetectedElement | null
  |
  v
scoring.ts: apply sensitivity threshold, weight by type, deduplicate
  |
  v  ScoredDetection[]
For each scored detection:
  |
  +-- inline.ts: extract text from DOM container
  |
  +-- If detection.nearestLink exists:
  |     Content Script --FETCH_URL--> Background --> fetch(url) --> HTML
  |     linked.ts: parse HTML, extract main content
  |
  +-- If URL ends in .pdf:
  |     pdf.ts: extract text via pdfjs-dist
  |
  v  raw text
normalizer.ts: strip HTML, collapse whitespace, remove boilerplate
  |
  v  clean text
chunker.ts: split if > 4000 tokens (with 200-token overlap)
  |
  v  string[]
Content Script --SUMMARIZE--> Background Service Worker
  |
  v
factory.ts: get active LLM provider from settings
  |
  v
If single chunk:
  singleshot.ts: one API call --> Summary
If multiple chunks:
  chunked.ts: map (3 concurrent) --> partial Summaries --> reduce --> Summary
  |
  v
severity.ts: recompute severity from red flags (deterministic)
  |
  v
cache.ts: store summary keyed by SHA-256 text hash (30-day TTL)
  |
  v
Background --response--> Content Script
  |
  v
overlay.ts: render Summary in Shadow DOM panel
positioning.ts: place near detection anchor, viewport-aware
theme.ts: apply light/dark theme
```

## Data Flow: Version Tracking

```
After summarization completes for a domain:
  |
  v
detector.ts: SHA-256 hash current text, compare with stored latest hash
  |
  +-- Hashes match: no action (T&C unchanged)
  |
  +-- No previous version: store as version 1, no notification
  |
  +-- Hashes differ (T&C changed):
        |
        v
      diff.ts: compute line-level text diff (additions, removals, changes)
        |
        v
      summary-diff.ts: compare old/new summaries
        - Added red flags
        - Removed red flags
        - Changed red flags
        - Severity change
        - Key point changes
        |
        v
      schema.ts: store new VersionEntry (auto-increment version number)
        - Drop oldest if > 20 versions for this domain
        |
        v
      notifications.ts: if settings.notifyOnChange:
        - Set badge "!" with red background
        - Store pending notification
        - Show banner in popup on next open
```

## Message Protocol

All inter-context communication uses typed messages defined in `src/shared/messages.ts` as a discriminated union:

| Message Type | Direction | Payload | Response |
|-------------|-----------|---------|----------|
| `DETECT_TC` | Popup → Content | `{ tabId: number }` | `ScoredDetection[]` |
| `EXTRACT_TEXT` | Content → Background | `{ selector: string; url: string }` | `string` |
| `FETCH_URL` | Content → Background | `{ url: string }` | `string` (HTML) |
| `SUMMARIZE` | Content → Background | `{ text: string; provider: string }` | `Result<Summary, TCGuardError>` |
| `GET_SETTINGS` | Any → Background | none | `StorageSchema['settings']` |
| `SAVE_SETTINGS` | Popup → Background | `Settings` | `void` |
| `TC_CHANGED` | Background → Popup | `{ domain: string; diff: SummaryDiff }` | `void` |

The background service worker's `onMessage` handler is the central router — it pattern-matches on `message.type` and dispatches to the appropriate handler.

## Storage Schema

All persistent state lives in `chrome.storage.local`, accessed through typed helpers in `src/shared/storage.ts`:

```typescript
interface StorageSchema {
  settings: {
    activeProvider: 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom';
    providers: Record<string, ProviderConfig>;
    detectionSensitivity: 'aggressive' | 'normal' | 'conservative';
    darkMode: 'auto' | 'light' | 'dark';
    notifyOnChange: boolean;
  };
  cache: Record<string, CachedSummary>;       // keyed by SHA-256 text hash
  versionHistory: Record<string, VersionEntry[]>; // keyed by domain
  pendingNotifications: PendingNotification[];
}
```

- `STORAGE_VERSION` constant (start at 1) for future migration support.
- `getStorage<K>(key: K)` and `setStorage<K>(key, value)` enforce types at compile time.
- Default values provided for all settings so first-run works without configuration.
- Cache TTL: 30 days. Version history: max 20 entries per domain.

## Module Dependency Boundaries

Dependencies flow in one direction. No circular imports allowed.

```
shared (leaf — imported by all, imports nothing)
  ^
  |
providers (imports shared)
  ^
  |
summarizer (imports shared, providers)
  ^
  |
versioning (imports shared, summarizer)
  ^
  |
content / popup / background (imports all above)
```

| Module | May Import From | Must NOT Import From |
|--------|----------------|---------------------|
| `shared/` | (nothing) | Everything else |
| `providers/` | `shared/` | `content/`, `popup/`, `background/`, `summarizer/`, `versioning/` |
| `summarizer/` | `shared/`, `providers/` | `content/`, `popup/`, `background/`, `versioning/` |
| `versioning/` | `shared/`, `summarizer/` | `content/`, `popup/`, `background/`, `providers/` (except via summarizer) |
| `content/` | `shared/`, `providers/`, `summarizer/`, `versioning/` | `popup/`, `background/` |
| `popup/` | `shared/`, `providers/`, `versioning/` | `content/`, `background/` |
| `background/` | `shared/`, `providers/`, `summarizer/`, `versioning/` | `content/`, `popup/` |

## State Management

- **No framework-level state management** (no Redux, Zustand, etc.).
- All persistent state lives in `chrome.storage.local`.
- **Content script:** Holds ephemeral UI state (overlay open/closed, cached summary for current page) in module-level variables. This state is lost on page navigation — that's fine.
- **Popup:** Reconstructs state on every open by querying the background. Popup has no persistent local state.
- **Background:** Single source of truth for all persistent state. Reads/writes go through typed `storage.ts` accessors.
- **Race conditions:** Multiple concurrent calls to `setStorage` can race. Read-modify-write operations should happen within a single JS event loop tick.

## Security Model

1. **XSS prevention:** Never use `innerHTML` with extracted text or LLM responses. Use `textContent` or DOM APIs (`createElement`, `appendChild`).
2. **Shadow DOM isolation:** Overlay uses `attachShadow({ mode: 'closed' })`. Host page CSS cannot affect the overlay and vice versa.
3. **Content Security Policy:** `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }` — no inline scripts or external sources on extension pages.
4. **API key storage:** Keys stored in `chrome.storage.local` (encrypted at rest on most platforms). Masked in UI (`sk-...xxxx`). Never logged to console.
5. **LLM response sanitization:** Strip HTML tags from all LLM output before rendering.
6. **CORS bypass:** Content scripts cannot make cross-origin API requests. All API calls route through the background service worker via messages.

## Browser Compatibility

- **Chrome 120+** — Primary target. Manifest V3, full API support.
- **Firefox 120+** — Via `webextension-polyfill`. Uses `browser.*` namespace instead of `chrome.*`.
- **Manifest:** `src/manifest.ts` exports `getChromeManifest()` and `getFirefoxManifest()`. Firefox adds `browser_specific_settings` with `gecko.id` and `strict_min_version`.
- **Build:** `pnpm build` (Chrome), `pnpm build:firefox` (Firefox). Controlled by `BUILD_TARGET` env var.
- **Modern APIs used freely:** `crypto.subtle`, `structuredClone`, ES2022 features, top-level await.
