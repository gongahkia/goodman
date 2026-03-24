[![](https://img.shields.io/badge/goodman_1.0.0-passing-green)](https://github.com/gongahkia/goodman/releases/tag/1.0.0) 
![](https://github.com/gongahkia/goodman/actions/workflows/ci.yml/badge.svg)

# `Goodman`

...

Goodman is a Manifest V3 browser extension for understanding Terms and Conditions at the moment a page asks for consent. It detects likely legal surfaces, extracts the relevant text, summarizes it with a user-configured LLM provider, stores the result as shared page state for the overlay and popup, and tracks version changes per domain over time.

## Product Position

Goodman is currently a privacy-first, bring-your-own-provider product aimed at technical users and power users. It is not a zero-config consumer app yet.

- It does automatic detection and persists explicit page-analysis state out of the box.
- It requires provider configuration before remote summarization, version history, and change alerts can succeed.
- Its clearest differentiator once configured is version tracking: first-seen terms are stored silently, and later meaningful changes can trigger notifications.

## What Ships Today

- Automatic detection on page load and relevant DOM changes.
- Consent surface detection for checkboxes, banners/modals, and full-page legal text.
- Extraction routing for inline text, linked legal pages, and PDFs.
- Background analysis pipeline with cache lookup, single-shot summarization, and chunked summarization for long text.
- Persisted `PageAnalysisRecord` state keyed by page URL, plus a tab-to-page index for active-tab lookups.
- Popup states for `idle`, `analyzing`, `no_detection`, `extraction_failed`, `needs_provider`, `error`, and `ready`.
- Per-domain version history, summary diffs, text diffs, and notification gating.
- Per-domain notification preferences plus global notification enable/disable.
- Multiple providers: OpenAI, Claude, Gemini, Ollama, and OpenAI-compatible custom endpoints.

## Runtime Flow

1. The content script auto-runs on page load and after relevant DOM mutations.
2. Detection candidates are scored, then the best candidate is resolved to inline, linked, or PDF text.
3. Deterministic states like `no_detection`, `extraction_failed`, and `needs_provider` are persisted immediately into shared storage; provider-backed analysis is handed to the background worker.
4. The background worker computes a hash, checks cache, calls the configured provider when needed, persists `PageAnalysisRecord`, updates version history, computes summary/text diffs, and decides whether a notification should fire.
5. The page overlay renders when a usable summary exists. The popup reads the persisted page-analysis record for the active page instead of relying on popup-local memory.

More detail lives in [docs/ARCHITECTURE.md](/Users/gongahkia/Desktop/coding/projects/goodman/docs/ARCHITECTURE.md).

## Stack

...

## Usage

## Installation

Goodman is pinned to Node 20.x and `pnpm@10.32.1`.

```bash
nvm use
corepack enable
corepack use pnpm@10.32.1
pnpm install
pnpm build
```

Load the built `dist/` directory as an unpacked extension in Chrome or Chromium.

## Configuration

1. Open the extension popup.
2. Go to `Settings`.
3. Choose a provider.
4. Enter the provider credentials and model settings.
5. Return to the page and re-run analysis if the page was already open.

For Ollama, the extension expects a reachable local endpoint, defaulting to `http://localhost:11434`.

Without provider setup, the extension can still detect likely consent surfaces and persist `no_detection` or `needs_provider` states, but it cannot produce summaries, version history, or change alerts.

## Privacy And Tradeoffs

- No app telemetry or analytics are built into the extension.
- Summaries, page-analysis state, version history, notification state, and settings live in browser local storage.
- Extracted legal text is sent only to the provider you configure. Remote providers receive the text you ask them to summarize.
- API keys are stored in browser-managed local extension storage. Goodman does not add its own encryption layer on top of that storage.

## Interview Notes

If you need to explain this project in an interview, the strongest framing is:

- The product goal is informed consent at the point of agreement, not generic legal research.
- MV3 boundaries are deliberate: content script for detection and extraction, background worker for provider calls and persistent orchestration, popup for reconstructed state and controls.
- The key tradeoff is privacy versus onboarding friction: no hosted backend means users keep control, but they must configure a provider before summaries and change tracking become useful.
- Version tracking is the differentiator because it turns one-off summarization into an ongoing monitoring workflow for domains the user revisits.

## Development

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Architecture

...

## Reference

...