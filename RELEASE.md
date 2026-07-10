# Release Checklist

Use this checklist for Chrome Web Store, Firefox AMO, and Safari App Store release prep.

## Preflight

1. Start from a clean worktree: `git status --short --branch`.
2. Confirm the release version in `package.json`.
3. Confirm README store copy still matches current behavior.
4. Do not add telemetry, cloud sync, account requirements, OAuth, or remote parsing without a separate privacy decision issue.
5. Confirm store account access before submission:
   - Chrome Web Store developer account: unverified.
   - Firefox AMO account: unverified.
   - Apple Developer account for Safari App Store: unverified.

## Required Commands

Run from the repo root.

```console
$ npm ci
$ npm run lint
$ npm run test -- --run
$ npm run build
$ npm run release
$ npm run release:firefox
$ npm run build:safari-app
```

`npm run build:safari-app` requires macOS with Xcode command line tools and `safari-web-extension-converter`.

## Output Artifacts

| Command | Output | Purpose |
| --- | --- | --- |
| `npm run build` | `dist/chrome/` | Chrome unpacked smoke test and Chrome Web Store ZIP input. |
| `npm run build` | `dist/firefox/` | Firefox unpacked smoke test and AMO XPI input. |
| `npm run build` | `dist/safari-webext/` | Safari Web Extension bundle referenced by the Safari wrapper. |
| `npm run release` | `release/onul-chrome.zip` | Chrome Web Store package. |
| `npm run release` | `release/onul-firefox.xpi` | Firefox add-on package. |
| `npm run release:firefox` | `release/onul-firefox-source.zip` | Firefox source package for AMO review. |
| `npm run release:firefox` | `release/onul-firefox-submission.txt` | AMO upload and reviewer notes. |
| `npm run build:safari-app` | `safari/ONUL/ONUL.xcodeproj` | Safari containing app project for archive/submission. |

Do not upload `dist/` directories directly to stores except for local unpacked testing.

## Manifest Checks

After `npm run build`, inspect all generated manifests.

```console
$ node -e "for (const target of ['chrome','firefox','safari-webext']) { const m = require('./dist/' + target + '/manifest.json'); console.log(target, m.name, m.version, m.permissions, m.optional_host_permissions, m.browser_specific_settings || {}); }"
```

Expected metadata:

| Target | Required metadata |
| --- | --- |
| Chrome | `manifest_version: 3`, `name: ONUL`, current package version, description, icons `16/32/48/128`, `activeTab`, `contextMenus`, `storage`, `scripting`, optional host permissions `http://*/*` and `https://*/*`, service worker background. |
| Firefox | Chrome metadata plus background scripts, Gecko ID `onul@gongahkia.dev`, strict minimum version `128.0`, and `data_collection_permissions.required: ['none']`. |
| Safari Web Extension | Chrome metadata plus Safari strict minimum version `18.0`. |

The generated manifests should not request `tabs`, broad install-time host permissions, clipboard permissions, identity permissions, or network-request permissions unless a later issue explicitly adds and documents them.

## Store Listing Assets

Reuse the README store copy unless the product behavior has changed.

| Field | Current copy/source |
| --- | --- |
| Product name | `Onul` |
| Current title | `Onul - Timezone Converter for Highlighted Text` |
| Post-hover title | `Onul - Timezone Converter for Highlight and Hover` after #6 ships. |
| One-line value prop | `Convert dates and timezones directly on the page without sending selection text off-device.` |
| Short description | README Store Copy Draft. |
| Screenshots | `asset/reference/1.png`, `asset/reference/2.png`, `asset/reference/3.png`, `asset/reference/4.png`. |
| Demo GIF/video | Not ready; tracked by #20. |
| Support URL | `https://github.com/gongahkia/onul/issues` |
| Source URL | `https://github.com/gongahkia/onul` |

## Store Privacy Language

Use this only while the source still has no runtime network, telemetry, identity, OAuth, or backend path.

| Store | Privacy/data statement |
| --- | --- |
| Chrome Web Store | Onul does not collect, sell, transfer, or use browsing data, selected text, or user activity for analytics. Parsing and timezone conversion run locally. |
| Firefox AMO | Data collection: none. Reviewer note: manual conversion is default; live conversion is opt-in per site via runtime host permissions; no remote code, analytics, or outbound data transmission is used. |
| Safari App Store | Data not collected. Onul's Safari Web Extension processes selected page text locally and does not transmit browsing data, selection text, or analytics off-device. |

If any statement becomes false, update this file, README, store copy, and issue #1 guardrails before submission.

## Manual Smoke Matrix

Run on a clean browser profile where possible.

| Browser | Install | Highlight conversion | Right-click conversion | Live selection mode | Settings save | Pinned zones |
| --- | --- | --- | --- | --- | --- | --- |
| Chrome | Load unpacked `dist/chrome`. | Select `2pm PST`, click extension, run conversion. Popup appears on page with target zone. | Select `2pm PST`, use context menu item `Convert timezone with ONUL`. Popup appears. | Enable live conversion for the test site only, select `14:00 UTC`, confirm popup appears, then disable live conversion. | Change theme or 24-hour format, save, close/reopen popup, confirm persistence. | Add up to 4 zones, save, convert `2pm PST`, confirm all pinned zones render. |
| Firefox | Load temporary add-on from `dist/firefox/manifest.json`. | Same as Chrome. | Same as Chrome. | Same as Chrome, allowing Firefox permission prompts. | Same as Chrome. | Same as Chrome. |
| Safari | Build/open Safari containing app, enable extension in Safari settings. | Same as Chrome on a normal webpage. | Context menu availability may vary by Safari extension behavior; record result before submission. | Grant website access in Safari settings if prompted, then test enable/disable. | Same as Chrome. | Same as Chrome. |

Test pages:

```html
<p>Meet at 2pm PST, 14:00 UTC, tomorrow at 5pm, 2023-05-20T10:30:00Z, and 1672531200000.</p>
```

Do not smoke-test on browser-internal pages such as `chrome://`, `about:`, or `safari-extension://`; content scripts cannot run there.

## Submission Notes

### Chrome

1. Run `npm run release`.
2. Upload `release/onul-chrome.zip`.
3. Use README store copy and privacy language.
4. Explain optional host permissions as per-site live conversion only.
5. Include support and source URLs.

### Firefox

1. Run `npm run release:firefox`.
2. Upload `release/onul-firefox.xpi`.
3. Upload `release/onul-firefox-source.zip` if AMO asks for source.
4. Copy reviewer notes from `release/onul-firefox-submission.txt`.
5. Confirm data collection is `none`.

### Safari

1. Run `npm run build`.
2. Run `npm run build:safari-app`.
3. Open `safari/ONUL/ONUL.xcodeproj` in Xcode.
4. Confirm bundle identifiers `dev.gongahkia.onul` and `dev.gongahkia.onul.Extension`.
5. Archive the containing app from Xcode and submit through App Store Connect.
6. Use Safari privacy language above unless source behavior changed.

## Rollback

| Surface | Rollback action |
| --- | --- |
| Git | Keep one commit per release checklist/task. Revert the release commit if the submission is bad. |
| Chrome Web Store | Stop rollout or publish the previous ZIP if the dashboard supports rollback for the item. |
| Firefox AMO | Disable the version or upload the previous XPI. |
| Safari App Store | Remove the version from sale or submit a corrected build in App Store Connect. |
| Repo release assets | Delete or replace bad GitHub release artifacts and document the reason in release notes. |

Record every store submission, rejection, rollback, and reviewer request in a dated issue comment.
