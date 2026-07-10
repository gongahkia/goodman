[![Release](https://img.shields.io/github/v/release/gongahkia/onul)](https://github.com/gongahkia/onul/releases)
![CI](https://github.com/gongahkia/onul/actions/workflows/ci.yml/badge.svg)
![Last commit](https://img.shields.io/github/last-commit/gongahkia/onul)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

# `Onul`

Fast, offline timezone conversion for highlighted text and opt-in live page workflows.

Onul is a browser extension for converting dates, times, timezone abbreviations, ISO strings, and epoch timestamps without sending selection text off-device. The current build is manual-by-default: select text, use the popup or context menu, and optionally enable live conversion for a site.

<p align="center">
  <img src="./asset/reference/1.png" width="85%" alt="Onul popup showing timezone conversion controls">
</p>

Demo GIF/video placeholder: tracked in [#20](https://github.com/gongahkia/onul/issues/20). Current magic moment: highlight `2pm PST`, run Onul, and see the local target zone plus pinned zones.

## Stack

* *Scripting*: [TypeScript](https://www.typescriptlang.org/), [Vite](https://vite.dev/), [Vitest](https://vitest.dev/), [ESLint](https://eslint.org/), [Prettier](https://prettier.io/), [Preact](https://preactjs.com/)
* *Parsing*: [chrono-node](https://github.com/wanasit/chrono), [Luxon](https://moment.github.io/luxon/)
* *Platform*: [Chrome Extensions Manifest V3](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3), Firefox WebExtensions, Safari Web Extensions

## Why Onul

* Converts selected page text without a hosted service.
* Uses optional per-site host permissions instead of broad install-time access.
* Supports target timezone, 12/24-hour output, ignored domains, and up to 4 pinned zones.
* Builds Chrome, Firefox, and Safari Web Extension artifacts from one codebase.
* Keeps hover detection, editable-field support, and calendar actions as tracked follow-up work instead of overclaiming shipped behavior.

## Privacy

Onul's Phase 0/1 posture is local-first: no telemetry, no analytics SDK, no OAuth, and no app backend. A source scan found no `fetch`, `XMLHttpRequest`, `sendBeacon`, analytics, or identity API usage in runtime code. Browser permissions are limited to `activeTab`, `contextMenus`, `storage`, `scripting`, and optional host permissions for explicit per-site live conversion. [Chrome documents optional host permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions) as runtime-granted access rather than install-time access.

Future clipboard, editable-field, calendar, Slack, Gmail, sync, or account features need separate opt-in and privacy notes.

## Comparison

Source links checked on 2026-07-10.

| Product | Primary surface | Page-text workflow | Privacy/source status | Onul positioning |
| --- | --- | --- | --- | --- |
| Onul | Browser extension for selected page text | Manual selection and context menu today; hover detection is planned in [#6](https://github.com/gongahkia/onul/issues/6). | Runtime code is local-only by current source scan. | Fast conversion where the date/time appears, with per-site permission control. |
| Convert Time | Direct comp named in [#2](https://github.com/gongahkia/onul/issues/2). | Exact current listing was not verified from public search results. | Unknown until launch research verifies the listing. | Do not make feature claims against it until a source is confirmed. |
| [Savvy Time](https://savvytime.com/converter) | Web converter plus [Chrome extension](https://chromewebstore.google.com/detail/time-zone-converter-savvy/plhnjpnbkmdmooideifhkonobdkgbbof). | Converter focuses on adding locations and comparing many cities/timezones. | Chrome Web Store listing says the developer discloses no data collection. | Onul should lead with in-page selection, optional permissions, and offline workflow. |
| [World Time Buddy](https://www.worldtimebuddy.com/) | Web world clock, timezone converter, and meeting scheduler. | Mouse over hour rows and click tiles to schedule/share. | Account sign-in exists for saved settings. | Onul should not compete as a full scheduler before calendar issues ship. |

## Why not just use chrono-node?

`chrono-node` is the natural-language parser; Onul adds the browser product layer around it:

* Strict military-time and epoch handling.
* Timezone normalization and conversion display.
* Target and pinned-zone output.
* Shadow DOM popup UI on the original page.
* Per-site optional host permission flow.
* Browser-specific manifests and release packaging.

## Architecture Decisions

* Manifest V3 keeps background work in the extension service worker where supported.
* Content scripts inject only when the user runs a conversion or grants live site access.
* The in-page UI is isolated with Shadow DOM to avoid page CSS conflicts.
* Luxon handles timezone formatting and IANA zone conversion.
* Optional host permissions preserve user control over page scanning.
* No remote code, analytics, or outbound data path is part of the current runtime.

## Store Copy Draft

* Current title: `Onul - Timezone Converter for Highlighted Text`
* Post-[#6](https://github.com/gongahkia/onul/issues/6) title: `Onul - Timezone Converter for Highlight and Hover`
* One-line value prop: `Convert dates and timezones directly on the page without sending selection text off-device.`
* Short description: `Onul turns selected times like 2pm PST, 14:00 UTC, ISO strings, and Unix timestamps into your local timezone and pinned zones. Use it manually by default, or enable live conversion for trusted sites only.`
* Privacy line: `Runs locally; no telemetry, account, backend, or selection-text upload in the current build.`
* Permission line: `Uses activeTab, contextMenus, storage, scripting, and optional host permissions for per-site live conversion.`
* Support URL: `https://github.com/gongahkia/onul/issues`
* Source URL: `https://github.com/gongahkia/onul`

## Screenshots

<table>
<tr>
<td width="50%" valign="top">
<img src="./asset/reference/1.png" width="100%">
<br>
<br>
<img src="./asset/reference/2.png" width="100%">
<br>
<br>
<img src="./asset/reference/3.png" width="100%">
</td>
<td width="50%" valign="top">
<img src="./asset/reference/4.png" width="100%">
</td>
</tr>
</table>

## Usage

1. Clone the repo and build from source.

```console
$ git clone https://github.com/gongahkia/onul && cd onul
$ npm install && npm run build
$ npm run release
```

2. Load the extension in your browser.

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click *Load Temporary Add-on*.
3. Select `dist/firefox/manifest.json`.
4. Highlight a time or date.

### Chrome

1. Open `chrome://extensions/`.
2. Toggle *Developer mode* on.
3. Click *Load unpacked*.
4. Select `dist/chrome`.
5. Highlight a time or date.

### Safari

1. Run `npm run build:safari-app` on macOS.
2. Open the generated Safari containing app in Xcode.
3. Enable the extension in Safari settings.

Support for other Chromium browsers such as Edge, Brave, Opera, and Vivaldi has not been extensively tested. Open an [issue](https://github.com/gongahkia/onul/issues) for support.

## Contributor Setup

```console
$ npm install
$ npm run build
$ npm run test -- --run
$ npm run lint
```

## Architecture

<div align="center">
    <img src="./asset/reference/architecture.png" width="50%">
</div>

## Reference

The name `Onul` is in reference to the Korean word *오늘*, which roughly translates to "today".

<div align="center">
    <img src="./asset/logo/han.avif" width="75%">
</div>

## License

MIT. See [LICENSE](./LICENSE).
