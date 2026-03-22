# TC Guard Architecture

This document describes the runtime that actually ships in the repository today.

## Product Intent

TC Guard is trying to solve a narrow problem well: when a page asks the user to agree to terms, explain what that agreement means right now, then remember that domain so later term changes can be surfaced.

That means the product is built around three linked jobs:

1. Detect likely consent surfaces automatically.
2. Produce a trustworthy summary with explicit analysis state.
3. Persist enough state to compare future visits to the same domain.

The current scope is still privacy-first and bring-your-own-provider. There is no hosted inference backend, no account system, and no server-side monitoring loop.

## MV3 Execution Model

TC Guard is a Manifest V3 extension with three important contexts:

```text
+------------------+        runtime messages        +----------------------+
| Content Script   | <----------------------------> | Background Worker    |
| per page/tab     |                                | persistent orchestration
|                  |                                | provider calls
| - detect         |                                | cache
| - extract        |                                | versioning
| - overlay        |                                | storage
+------------------+                                +----------------------+
         ^                                                      ^
         |                                                      |
         +---------------- active-tab state --------------------+
                                |
                                v
                       +----------------------+
                       | Popup                |
                       | - reads page state   |
                       | - settings           |
                       | - history            |
                       +----------------------+
```

- `src/content/`
  Detects consent UI, resolves text sources, and renders the overlay when a summary is available.
- `src/background/`
  Owns persistent analysis state, provider execution, cache lookups, version tracking, and notification decisions.
- `src/popup/`
  Rehydrates from persisted page-analysis state for the active tab and exposes settings/history controls.

MV3 matters here because the service worker can be suspended. For that reason, persistent state must live in `chrome.storage.local`, not in background module globals.

## Truthful Runtime Flow

### 1. Detection and extraction

The content script starts automatically on load and also watches for relevant DOM changes.

- `observer.ts` schedules re-analysis for dynamic consent UIs.
- `checkbox.ts`, `modal.ts`, and `fullpage.ts` generate detection candidates.
- `scoring.ts` picks the highest-confidence candidate.
- `source.ts` resolves where to read from:
  - inline text first
  - linked legal page if inline text is too small
  - PDF extraction when the nearest legal link points to a PDF

### 2. Shared page-analysis state

The content script and background worker communicate through typed messages.

- If nothing relevant is found, the content script persists `no_detection`.
- If a legal surface is found but usable text is not extracted, it persists `extraction_failed`.
- If text is extracted, the content script sends `PROCESS_PAGE_ANALYSIS` to the background worker.

The background worker stores a `PageAnalysisRecord` keyed by tab id so overlay, popup, and later manual refreshes can converge on the same state.

### 3. Background analysis pipeline

`src/background/process-analysis.ts` is the runtime orchestration entry point.

For a valid extracted text input it:

1. Computes a text hash.
2. Persists `analyzing`.
3. Checks the summary cache.
4. Validates the configured provider.
5. Runs either:
   - single-shot summarization for shorter text
   - chunked map-reduce summarization for longer text
6. Persists either `ready`, `needs_provider`, or `error`.
7. On successful summaries, forwards the result into version tracking.

### 4. Version tracking

`src/background/version-tracking.ts` bridges runtime analysis into long-lived history.

- The first version seen for a domain is stored silently.
- Later versions compare text hashes against the previous version.
- When a change exists, the extension computes:
  - text diff
  - summary diff
  - red-flag additions/removals/changes
  - severity changes
- Notifications only fire for meaningful summary changes and only when both:
  - global notifications are enabled
  - the domain-level preference is enabled

### 5. Popup behavior

The popup no longer treats itself as the source of truth.

- On open, it queries the active tab and then requests `GET_PAGE_ANALYSIS`.
- It renders explicit UI for:
  - `idle`
  - `analyzing`
  - `no_detection`
  - `extraction_failed`
  - `needs_provider`
  - `error`
  - `ready`
- Manual analyze still exists, but it refreshes from persisted state after triggering content-script analysis.
- History clears pending notifications for the domain being viewed.

## Core Data Model

The most important runtime model is `PageAnalysisRecord` in `src/shared/page-analysis.ts`.

```ts
interface PageAnalysisRecord {
  tabId: number;
  url: string;
  domain: string;
  status:
    | 'idle'
    | 'analyzing'
    | 'no_detection'
    | 'extraction_failed'
    | 'needs_provider'
    | 'error'
    | 'ready';
  sourceType: 'inline' | 'linked' | 'pdf' | null;
  detectionType: 'checkbox' | 'modal' | 'banner' | 'fullpage' | null;
  confidence: number | null;
  textHash: string | null;
  summary: Summary | null;
  error: string | null;
  updatedAt: number;
}
```

This record is what makes the popup truthful. Without it, the popup only knows what happened during its own current session.

## Storage Schema

The live storage schema in `src/shared/storage.ts` contains:

```ts
interface StorageSchema {
  settings: Settings;
  cache: Record<string, CachedSummary>;
  pageAnalysis: Record<string, PageAnalysisRecord>;
  versionHistory: Record<string, VersionEntry[]>;
  domainNotificationPreferences: Record<string, boolean>;
  pendingNotifications: PendingNotification[];
  storageVersion: number;
}
```

Important notes:

- `pageAnalysis` is keyed by tab id string.
- `versionHistory` is keyed by domain.
- `domainNotificationPreferences` defaults to enabled per domain unless explicitly disabled.
- `pendingNotifications` drives badge/banner behavior.

## Message Contracts That Matter

The runtime now depends most heavily on these message types from `src/shared/messages.ts`:

- `DETECT_TC`
  Popup to content script. Manual re-run trigger for the active tab.
- `SAVE_PAGE_ANALYSIS`
  Content script to background. Persists `no_detection` and `extraction_failed` states.
- `PROCESS_PAGE_ANALYSIS`
  Content script to background. Runs the real analysis pipeline and persists final state.
- `GET_PAGE_ANALYSIS`
  Popup to background. Rehydrates the latest known result for the active tab.
- `GET_SETTINGS` and `SAVE_SETTINGS`
  Shared settings contract.
- `FETCH_URL`
  Background fetch proxy for linked legal pages.

The older `SUMMARIZE` contract still exists, but the primary user flow now runs through `PROCESS_PAGE_ANALYSIS`.

## Engineering Boundaries

The intended dependency direction is:

```text
shared
  ^
  |
providers
  ^
  |
summarizer
  ^
  |
versioning
  ^
  |
background / content / popup
```

In practice, the most important engineering convention to defend is not the diagram itself but the ownership boundary:

- `shared/` defines types, storage helpers, and messaging primitives.
- `content/` owns page-local detection and extraction only.
- `background/` owns durable state transitions.
- `popup/` reads and controls state; it should not invent its own parallel truth.

## Privacy Model

The privacy story is deliberate but not cost-free.

- No product telemetry is built in.
- Persistent state is stored locally in browser extension storage.
- API keys are stored in browser-managed extension storage.
- Extracted legal text is sent to the configured provider when a remote provider is used.
- Choosing Ollama keeps inference local, but increases setup friction.

This is why the product is honest today as a privacy-first power-user tool rather than a frictionless mainstream consumer app.

## Interview Framing

If you are asked to explain the design in an interview, the strongest story is:

- The project uses MV3 boundaries for a reason: content scripts cannot safely own provider calls or durable state.
- The meaningful architecture change was introducing persisted per-tab analysis state so popup and page UI stop drifting apart.
- The real product moat is not summarization alone; it is turning summaries into longitudinal domain history with meaningful change alerts.
- The main tradeoff left unresolved is onboarding: privacy-first BYO-provider setup versus a future hosted default path.
