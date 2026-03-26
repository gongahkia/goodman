[![](https://img.shields.io/badge/goodman_1.0.0-passing-green)](https://github.com/gongahkia/goodman/releases/tag/1.0.0)
![](https://github.com/gongahkia/goodman/actions/workflows/ci.yml/badge.svg)

# `Goodman`

...

Goodman is a Manifest V3 browser extension that automatically detects, summarizes, and tracks changes to Terms & Conditions on any webpage. It uses a bring-your-own-provider model for AI-powered legal text analysis while keeping all data local.

Goodman is a privacy-first, bring-your-own-provider tool aimed at technical users and power users who want to understand what they're agreeing to.

- Automatic T&C detection and page-analysis state out of the box.
- Provider configuration required before summarization, version history, and change alerts.
- Killer differentiator: **version tracking** — first-seen terms are stored silently, later changes trigger notifications with diffs.

## Stack

* *Script*: [TypeScript](), [Vite](), [Hono](), [pdfjs-dist](), [diff]()
* *Test*: [Vitest]() , [Playwright]()
* *Lint*: [ESLint, Prettier]()

## Screenshots

### `Goodman` browser extension

<div align="center">
    <img src="./asset/reference/1.png" width="22%">
    <img src="./asset/reference/2.png" width="22%">
    <img src="./asset/reference/3.png" width="22%">
    <img src="./asset/reference/4.png" width="22%">
</div>

### `Goodman` on LinkedIn

<div align="center">
    <img src="./asset/reference/5.png" width="48%">
    <img src="./asset/reference/6.png" width="48%">
</div>

### `Goodman` on Substack

<div align="center">
    <img src="./asset/reference/7.png" width="90%">
</div>

## Features

- Automatic detection on page load and relevant DOM mutations.
- Consent surface detection for checkboxes, banners/modals, and full-page legal text.
- Extraction routing for inline text, linked legal pages, and PDFs.
- Background analysis pipeline with cache, single-shot and chunked summarization.
- Persisted `PageAnalysisRecord` state keyed by URL with tab-to-page index.
- Popup/side-panel states: `idle`, `analyzing`, `no_detection`, `extraction_failed`, `needs_provider`, `needs_consent`, `service_unavailable`, `error`, `cancelled`, and `ready`.
- Per-domain version history, summary diffs, text diffs, and notification gating.
- Dark mode support (auto-detects OS preference).
- Full accessibility: ARIA labels, keyboard navigation, screen reader announcements, WCAG AA contrast.
- Explicit error logging on all failure paths — no silent errors.

## Supported models

- 6 production providers: OpenAI, Claude, Gemini, Ollama, Custom (OpenAI-compatible), and Goodman Cloud (hosted).

## Usage

> [!IMPORTANT]  
> Read the [legal disclaimer](#legal-disclaimer) before using `Goodman`.

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

## Legal Disclaimer

...