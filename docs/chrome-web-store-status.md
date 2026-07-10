# Chrome Web Store status

Last checked: 2026-07-10.

## Status

Public listing: Goodman is not publicly listed on the Chrome Web Store based on public web search for the project name, repository owner, and extension description.

Private review state: no access from this checkout. There is no `CHROME_APP_ID`, Chrome Web Store OAuth client credentials, or developer-console session available here.

Checks used:

* Public web search for `Goodman Terms Conditions Chrome Web Store gongahkia`.
* Public web search for `site:chromewebstore.google.com Goodman Terms Conditions browser extension`.
* Public web search for `gongahkia goodman Chrome Web Store`.
* Environment scan for `CHROME_`, `CWS_`, `WEB_STORE`, and `GOOGLE` variables.
* Repository scan for Chrome Web Store app ID or submission credentials.

## Build metadata

The Chrome package path uses Manifest V3 from `src/manifest.ts`, with `activeTab`, `storage`, `scripting`, `alarms`, and Chrome `sidePanel` permissions. The package no longer includes Goodman-hosted inference code, hosted-provider selection, telemetry hooks, accounts, sync, auto-clicking, or legal-advice claims.

## Next action

The Chrome Web Store account owner needs to open the developer dashboard and record the exact review state here. If the item is blocked, record the blocker, reviewer message, requested change, and resubmission date. If it is approved, update the README Chrome row with the live listing URL and add the `CHROME_APP_ID` to the release operator notes.
