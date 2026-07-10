# Goodman Watch Architecture

Status: design only. Do not build the crawler, API, dataset drop, or public Watch page until Tier B has enough opt-in corpus signal and the cost ceiling below is accepted.

## Gates

- Tier B signal gate: at least 1,000 opt-in corpus records from at least 100 distinct hostnames over a 30-day window, with no unresolved takedown/privacy incidents.
- Legal gate: written approval for crawling, storing, and redistributing public legal-page text.
- Cost gate: recurring spend must remain $0/month unless explicitly approved; approved recurring spend is capped at $20/month. Paid LLM inference is capped at $0 for automated cron.

## Architecture

Inputs:

- Seed list: latest standard Tranco list, pinned by permanent list ID per run.
- Initial crawl set: top 200 domains, with manual denylist for sensitive, unreachable, or legally risky hosts.
- Discovery: homepage plus same-origin links matching terms/privacy/legal/service/subscription/cookie patterns.

Crawler:

- Scheduled GitHub Actions job, initially weekly.
- Fetch only public legal pages; no login, cookies, user agents that imply a user account, or browser profile state.
- Respect `robots.txt`, 10 second request timeout, 5 second per-host delay, max 3 legal URLs per host.
- Persist fetch metadata: hostname, source URL stripped to origin+path, status, content hash, captured timestamp, content type.

Extraction:

- Reuse Goodman normalizers/extractors where practical through a server adapter.
- Keep raw HTML/PDF out of public output by default; publish normalized legal text only after legal approval.
- Store text hash and normalized text snapshot for diffing.

Diff and summary:

- Rolling per-host snapshots keyed by text hash.
- Generate text diffs and summary-diff metadata from local snapshots.
- Automated cron does not call paid hosted LLMs. If summaries are needed, use local Ollama/manual BYOK runs behind a separate budget approval.
- Flag contradictions and material clause changes after the red-flag taxonomy exists.

Storage:

- Repository artifact during dry runs: private CI artifact with 7 day retention.
- Public dataset after gates: JSONL batches plus manifest, compatible with the Phase 3B corpus format.
- Hugging Face dataset drop is optional after legal approval; keep file counts low and prefer merged JSONL/Parquet batches.

Read-only API:

- Static files only, published from generated JSON:
  - `/api/latest.json`
  - `/api/domains/{hostname}.json`
  - `/api/runs/{run_id}.json`
- No dynamic server, database, accounts, telemetry, or extension-client writes.

Goodman Watch page:

- Static GitHub Pages site reading the generated API files.
- Views: recent material diffs, domain history, severity trend, source link, capture timestamp.
- No user-specific state; no analytics.

## Public Output Rules

- Include only public crawled legal text/diffs and derived metadata.
- Never mix extension-user corpus records into Goodman Watch.
- Never publish cookies, headers, IPs, account IDs, full query strings, browser identifiers, or extension identifiers.
- Keep takedown contact and replacement-batch process from `docs/anonymous-corpus-contribution.md`.

## Cost Assumptions

As of 2026-07-10, GitHub documents standard GitHub-hosted Actions runners as free for public repositories, and GitHub Pages as available for public repositories on GitHub Free. Hugging Face documents best-effort public storage for free accounts and paid public storage add-ons starting at $12/TB/month.

[Inference] A weekly top-200 crawl with 3 legal pages per host should fit within public-runner and best-effort public-storage assumptions if normalized snapshots are batched and compressed. This must be measured in a dry run before launch.

Blocking thresholds:

- Any required payment method for crawler execution blocks launch.
- Any storage estimate above 2 GB/year blocks launch until storage is redesigned or approved.
- Any automated inference spend above $0 blocks launch.
- Any need for a dynamic hosted API blocks launch.

## Sources

- GitHub Actions billing: <https://docs.github.com/en/billing/concepts/product-billing/github-actions>
- GitHub Pages overview: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- Hugging Face storage limits: <https://huggingface.co/docs/hub/en/storage-limits>
- Tranco ranking: <https://tranco-list.eu/>
