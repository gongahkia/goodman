# Pivot Guardrails

These defaults unblock Phase 0 and Phase 1 work until a later issue changes them.

## Phase 1 Defaults

| Question | Default |
| --- | --- |
| Brand | Keep Onul as the product name. Use searchable store copy such as `Onul - Timezone Converter for Highlight and Hover` where titles need keywords. |
| Capacity | Plan as a solo-founder build for the next 8-10 weeks. Do not run Phase 2 spikes in parallel with Phase 1 unless capacity changes. |
| Funding | Treat funding as undecided. Keep the near-term story free, open-source-friendly, and B2B-compatible. |
| Privacy | Treat local-first, no telemetry, and no network calls as Phase 0/1 product constraints. Any cloud, OAuth, sync, or telemetry feature needs a separate decision issue. |
| Engine repo shape | Keep `@onul/engine` in this monorepo under `packages/engine` first. Split only if packaging or adoption data justifies it. |
| Store ownership | No repo evidence confirms Chrome Web Store, Firefox AMO, or Safari App Store account access. Release work must verify accounts before submission. |
| Keyboard shortcuts | Avoid `Cmd+Shift+T` and `Cmd+Shift+Y` as defaults because they are likely to collide with browser/system habits. Pick lower-collision commands in #9. |
| Phase 1 order | Finish Phase 0, then add interaction-mode infrastructure, then hover detection. Range parsing and pinned-zone UX follow the roadmap order unless issue evidence changes it. |

## Implementation Constraints

- README and store copy should describe current behavior as manual-by-default with optional per-site live conversion.
- Future hover copy must stay framed as planned until #5 and #6 ship.
- Browser permissions should remain `activeTab`, `contextMenus`, `storage`, `scripting`, plus optional host permissions where needed.
- Features that read editable fields, clipboard contents, calendar data, Gmail, Slack, or account state need explicit opt-in and issue-level privacy notes.
- Store submission work owns account-access verification; product docs should not imply the stores are already configured.
