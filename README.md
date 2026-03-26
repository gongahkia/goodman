[![](https://img.shields.io/badge/goodman_1.0.0-passing-green)](https://github.com/gongahkia/goodman/releases/tag/1.0.0)
![](https://github.com/gongahkia/goodman/actions/workflows/ci.yml/badge.svg)

# `Goodman`

Goodman is a Manifest V3 browser extension that automatically detects, summarizes, and tracks changes to Terms & Conditions on any webpage. It uses a bring-your-own-provider model for AI-powered legal text analysis while keeping all data local.

## Stack

## Screenshots

## Usage

## Product Position

Goodman is a privacy-first, bring-your-own-provider tool aimed at technical users and power users who want to understand what they're agreeing to.

- Automatic T&C detection and page-analysis state out of the box.
- Provider configuration required before summarization, version history, and change alerts.
- Killer differentiator: **version tracking** — first-seen terms are stored silently, later changes trigger notifications with diffs.

## What Ships Today

- Automatic detection on page load and relevant DOM mutations.
- Consent surface detection for checkboxes, banners/modals, and full-page legal text.
- Extraction routing for inline text, linked legal pages, and PDFs.
- Background analysis pipeline with cache, single-shot and chunked summarization.
- Persisted `PageAnalysisRecord` state keyed by URL with tab-to-page index.
- Popup/side-panel states: `idle`, `analyzing`, `no_detection`, `extraction_failed`, `needs_provider`, `needs_consent`, `service_unavailable`, `error`, `cancelled`, and `ready`.
- Per-domain version history, summary diffs, text diffs, and notification gating.
- 6 production providers: OpenAI, Claude, Gemini, Ollama, Custom (OpenAI-compatible), and Goodman Cloud (hosted).
- Dark mode support (auto-detects OS preference).
- Full accessibility: ARIA labels, keyboard navigation, screen reader announcements, WCAG AA contrast.
- Explicit error logging on all failure paths — no silent errors.

## Runtime Flow

1. The content script auto-runs on page load and after relevant DOM mutations.
2. Detection candidates are scored, then the best candidate is resolved to inline, linked, or PDF text.
3. Deterministic states (`no_detection`, `extraction_failed`, `needs_provider`) are persisted immediately; provider-backed analysis is handed to the background worker.
4. The background worker computes a hash, checks cache, calls the configured provider when needed, persists state, updates version history, computes diffs, and decides whether to fire notifications.
5. The page overlay renders when a usable summary exists. The popup reads persisted state for the active page.

More detail in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5.9+ |
| Build | Vite 8 + @crxjs/vite-plugin |
| Targets | Chrome 120+, Firefox 120+ (MV3) |
| Server | Hono (optional hosted backend) |
| PDF | pdfjs-dist |
| Diffs | diff |
| Tests | Vitest, Playwright |
| Lint | ESLint, Prettier |
| Package Manager | pnpm |

## Usage

1. Install and build:

```console
$ git clone https://github.com/gongahkia/goodman && cd goodman
$ nvm use
$ corepack enable && corepack use pnpm@10.32.1
$ pnpm install && pnpm build
```

2. Load `dist/` as an unpacked extension in Chrome (`chrome://extensions`) or Firefox (`about:debugging`).

3. Click the Goodman icon, configure a provider in Settings, and browse to any page with Terms & Conditions.

4. Run tests:

```console
$ pnpm typecheck
$ pnpm lint
$ pnpm test
$ pnpm build
$ pnpm exec playwright install chromium
$ pnpm test:e2e
```

## Architecture

![](./asset/reference/architecture.png)

## Reference

The name `Goodman` is in reference to the American criminal defense lawyer [Saul Goodman](https://en.wikipedia.org/wiki/Saul_Goodman) *(the professional alias of [James Morgan "Jimmy" McGill](https://breakingbad.fandom.com/wiki/Jimmy_McGill))* who also acts as the titular protagonist of the acclaimed television series [*Breaking Bad*](https://breakingbad.fandom.com/wiki/Breaking_Bad_Wiki).

![](./asset/logo/saul_goodman.png)