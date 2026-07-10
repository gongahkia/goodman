# Anonymous Corpus Contribution

Goodman corpus contribution is gated and must remain default-off until legal review clears redistribution of T&C text and the takedown process below.

## Current State

- Popup setting: default off, stores only a local opt-in preference.
- Extension upload path: not implemented.
- Server intake: pure whitelist sanitizer only; no running backend.
- Public release: blocked until legal review.

## Intake Contract

Accepted fields:

- `legalText`: extracted legal text only.
- `hostname`: registrable or host name; full URLs are reduced to hostnames.
- `capturedAt`: ISO timestamp.
- `summary`: optional severity, key points, and red-flag categories/severities.
- `diff`: optional red-flag counts, changed-section labels, and summary-change marker.

Rejected or stripped fields:

- cookies, headers, IPs, account identifiers, extension IDs, browser IDs, emails, and arbitrary client fields.
- full URLs, paths, fragments, and query params.
- non-legal text payloads.

## Publishing Format

Use JSON Lines batches:

```json
{"schemaVersion":1,"hostname":"example.com","capturedAt":"2026-07-10T00:00:00.000Z","legalText":"...","summary":{"severity":"medium"},"diff":{"summaryChanged":true}}
```

Each release should include:

- `goodman-corpus-YYYY-MM-DD.jsonl`
- `manifest.json` with schema version, record count, SHA-256 digest, source commit, and legal-review reference.
- `README.md`/Dataset Card covering data source, limitations, ethical considerations, removal process, and non-legal-advice disclaimer.

Hugging Face supports JSONL/JSON dataset files and Dataset Cards for use, limitation, source, and ethical-context documentation. GitHub Releases can host versioned batch assets via release uploads.

Sources:

- Hugging Face dataset upload docs: <https://huggingface.co/docs/hub/en/datasets-adding>
- GitHub release asset docs: <https://docs.github.com/en/rest/releases/assets>
- GitHub DMCA policy: <https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy>

## Takedown Policy

Before public release, publish a contact path in the dataset card and repository README.

Minimum process:

1. Accept removal requests from rightsholders, site operators, or affected users.
2. Match records by hostname plus text hash or quoted text.
3. Remove matching records from the next batch and publish a replacement manifest.
4. If hosted on GitHub Releases or Hugging Face, replace or supersede the affected public artifact and record the action in the changelog.
5. Preserve only the minimum audit metadata needed to prove the request was handled.

GitHub documents DMCA takedown and counter-notice flows, but Goodman should still get project-specific legal review before distributing scraped or user-contributed T&C text.
