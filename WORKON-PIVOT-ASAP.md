# WORKON-PIVOT-ASAP

Decisions and roadmap from the 2026-05-16 viability review. Not a pivot — additive layering on the existing extension.

## TL;DR

- *Direction:* keep current detection/extraction/summary/diff core. Layer in (1) passive dark-pattern warnings and (2) a dataset/corpus play in phases.
- *Goal:* ship/maintain. Viability is secondary. No monetization.
- *Monetization:* free forever, OSS only. Remove Goodman Cloud from README + manifest scope.
- *Effort budget:* month+ extension, no rewrites.

## Market context (snapshot, 2026-05-16)

- *ToS;DR* — incumbent, ~30K Chrome users, 4.6★, community-curated grades, not AI. Trust moat. [Unverified] exact current numbers may have shifted.
- *TOSTracker* — research/journalism, 120K+ docs, diff + citable URLs, browser ext. Direct competitor on diff/versioning, owns the corpus angle. [Inference]
- *TermsAi / Polirizer / Simple-Terms / Privee / Polisis* — commodity AI summarizers, low traction (e.g. simple-terms: 1★). Goodman is better engineered but functionally similar.
- *Osano Privacy Monitor* — trust-score plugin, B2B-funded.

[Inference] Goodman's defensible surface is consent-surface detection + diff engine + multi-provider BYOK. Its weakness is no corpus and no novelty hook for HN. The two additive layers below address both without abandoning current scope.

## What stays (current core, do not touch beyond polish)

- Consent surface detection (checkboxes, banners/modals, full-page legal).
- Extraction routing: inline, linked pages, PDFs.
- Background pipeline: cache, single-shot, chunked summarization.
- `PageAnalysisRecord` persistence, per-domain version history, summary + text diffs, notification gating.
- Providers: OpenAI, Claude, Gemini, Ollama, custom OpenAI-compatible.
- Firefox AMO listing, Chrome pending.

## Remove / deprecate

- *Goodman Cloud* provider row in README + any code path. Free-forever OSS posture; do not host inference. [Inference] this also reduces legal/abuse exposure.

## Phase 1 — Polish + Chrome (target: week 1)

Goal: tighten the existing product before adding surface.

- README: drop Goodman Cloud row. Add a "What it does NOT do" section (no legal advice, no auto-decline, no data exfil).
- Screenshots: one short GIF showing detect → summarize → diff. Existing assets look fine.
- Chrome submission: chase the pending review. If blocked, document blocker here.
- Telemetry: stay zero-telemetry. Document explicitly in README.
- Accessibility/perf pass on popup.

## Phase 2 — Passive dark-pattern warnings (target: weeks 2–3)

Scope: warn + summarize before user clicks. No automated clicking. No allowlist required.

- *Detect risky consent UI on banners/modals already surfaced:*
  - presence of "accept all" without a same-prominence "reject all"
  - pre-checked opt-ins for marketing / analytics / data sharing
  - hidden/scrolled-off reject path
  - dark-pattern phrasing ("agree to continue", no decline)
- *Inline badge on the consent surface* with severity (low/med/high) and a one-line "what you're agreeing to" lifted from the summary pipeline.
- *No click interception.* User clicks whatever they want. Goodman only annotates.
- *Severity heuristics live in* `src/content/` near existing modal detection. Reuse `MIN_MODAL_TEXT_LENGTH` and category extraction.
- *Tests:* unit tests for each heuristic + a fixture set of real banner snapshots (curated, public). Playwright for the inline badge render.

Risks:
- False positives annoy users → start conservative, log nothing, surface a "dismiss for this site" with local storage only.
- Banner DOMs change → keep detection rules data-driven (JSON in `src/shared/`).

## Phase 3 — Dataset/corpus, three tiers documented (target: weeks 3–4+)

Pick a tier when starting Phase 3. Documented in order of effort.

### Tier A — Local-only (lowest effort, fully private)

- Already exists in spirit via per-domain version history.
- Ship a "Your T&C history" view in the popup: list of domains the user has visited, last summary, last diff date, severity trend.
- Export button: download user's own history as JSON.
- *No backend.* No central anything.

### Tier B — Opt-in anonymous contribution (mid effort)

- Add a setting (default OFF, prominent disclosure): "Contribute anonymized T&C text + diffs to a public dataset."
- Server endpoint in existing `server/` accepts uploads. Server strips: cookies, headers, user identifiers, URL query params, anything but the legal text + hostname + timestamp.
- Publish snapshots to GitHub releases or HuggingFace as flat files. No PII review pipeline → text-only intake, no upload of arbitrary fields.
- *Legal review needed before launch.* [Speculation] depending on jurisdiction, redistribution of T&C text is fair use, but a takedown policy is required regardless.

### Tier C — Server-side crawler of top N sites (highest effort, highest HN angle)

- Cron crawler hits a list of top sites (start with top 200, expand).
- Reuses extraction + summary pipeline server-side.
- Stores rolling diffs; exposes a read-only public API and a HuggingFace dataset drop.
- "Goodman Watch" — public web page showing recent diffs across major sites. This is the HN-front-page artifact.
- *Operational cost:* nontrivial. Single-VPS for crawler is fine; inference is the cost driver. [Inference] using Ollama on cheap GPU rental or batching to cheapest provider keeps it sustainable.

Recommendation: ship Tier A in Phase 3. Treat B and C as later increments; do not build until A is live and stable.

## Non-goals (explicitly out of scope)

- Auto-clicking reject buttons.
- Legal advice or actionable rights claims.
- Cross-device sync.
- Hosted inference (Goodman Cloud).
- Account system, telemetry, analytics.
- Paid tier of any kind.

## Open questions to revisit before each phase

- Phase 2: are heuristics good enough on real banners or do we need a small classifier? Defer until fixture set exists.
- Phase 3 Tier B: legal counsel for redistribution. Defer until Tier A ships.
- Phase 3 Tier C: hosting + inference cost ceiling. Defer until Tier B has volume signal.

## Status tracker

- [ ] Phase 1.1 — README cleanup (drop Cloud row, add "does NOT do")
- [ ] Phase 1.2 — Chrome submission unblock
- [ ] Phase 1.3 — popup a11y + perf pass
- [ ] Phase 2.1 — heuristic catalog in `src/shared/`
- [ ] Phase 2.2 — inline badge + severity render
- [ ] Phase 2.3 — fixtures + unit + Playwright tests
- [ ] Phase 3.A — "Your T&C history" popup view + JSON export
- [ ] Phase 3.B — opt-in upload + server intake (gated on legal review)
- [ ] Phase 3.C — crawler + Goodman Watch page (gated on B traction)
