# WORKON-PIVOT-ASAP

Living strategy doc. Captures the eval, market reality, agreed directions, Googlebook context, multi-phase roadmap, and untapped virality/adoption levers. Status: brainstorming — not committed engineering plan. Last updated: 2026-05-15.

---

## 1. Where Onul stands today

### 1.1 Technical state (v1.0)
- MV3 extension, Chrome + Firefox + Safari builds.
- Stack: TypeScript, Vite, Preact, chrono-node, Luxon, webextension-polyfill.
- Parser: chrono-node (8 locales — en, en-GB, ja, de, fr, pt, es, nl, ru) + custom regex (military `1400`, colon `14:00`, Unix epoch 10/13 digit).
- Conversion: Luxon, IANA zones, deprecated-zone normalization map.
- Permissions: `activeTab` + `contextMenus` + `storage` + `scripting`; live mode via `optional_host_permissions` per-origin.
- UI: Shadow DOM popup (theme-aware, click-to-copy), Preact settings popup (target zone, up to 4 pinned zones, 24h toggle, ignored domains, theme).
- Tests: parser, timezone, storage, site-access (Vitest).
- Builds three browser bundles from one common artifact (`scripts/build.mjs`), Safari Xcode wrapper present.
- Offline-only, no network calls, no telemetry.

### 1.2 Honest weaknesses
- **Selection-based UX** — user must highlight first. Direct comp ("Convert Time") uses hover-detect; strictly less friction.
- Skips editable fields entirely → blocks Gmail compose, Notion, Linear, Slack composer.
- 100-char selection cap → misses ranges and most natural phrasings.
- No range/duration parsing (`2-4pm PST`, `Mon-Wed 9-11am ET`).
- Pinned-zone picker is a 400+ option `<select>` — bad UX past zone #2.
- No keyboard shortcut, no clipboard-watch, no history.
- README points to broken issue link; "Onul" name is poetic but un-searchable in Chrome Web Store.

---

## 2. Market reality (cold read)

### 2.1 Direct comps
| Extension | Approach | Users | Signal |
|---|---|---|---|
| Convert Time (Daeda) | hover-detect, same niche | ~10 | 5 mo old; 1-2 installs/day |
| Timezone Converter (Rameja) | popup-only | 82 | Ghost town despite same name |
| Savvy Time | popup converter | dominant, 4.9★ | Generic incumbent, free |
| World Time Buddy | web app + ext | category leader | $30/yr ad-free freemium |
| TimeTwister / Spoof | dev/QA spoofing | 4.6–4.8★ | Different problem |
| Slack: Team TimeZone, Time Bot ($1/user/mo), Meridian, Zonebot | in-channel B2B | growing | Real revenue is here |

### 2.2 Implications
- Niche is small *and* crowded with free incumbents.
- No moat — chrono-node + luxon is the standard toolchain; anyone ships this in a weekend.
- Standalone consumer extension monetization math: 0.5–2% free→paid at $5–15/mo. **~10k DAU** needed for ~$1k/mo. Closest direct comp has 10 users.
- [Inference] As standalone paid consumer: ceiling ~$100–500/mo on donations/lifetime. Real money is one pivot away.

### 2.3 Googlebook / Magic Pointer adjacency (2026-05-12)
- Google announced Googlebook (replaces Chromebook, fall 2026), running **Aluminium OS** (Android + ChromeOS merge).
- Headline: **Magic Pointer** — Gemini-powered cursor agent. Marketing example: *"wiggle the cursor over a date in an email and Gemini offers to schedule a meeting."* Exact Onul territory.
- Threat: Magic Pointer makes Onul redundant on Googlebook hardware.
- Opportunity: validates the cursor-context tooltip UX paradigm. 99% of installed base (Win/macOS/Linux/non-Googlebook) will not have Magic Pointer for 3–5+ years. Onul can be the local-first, cross-browser, privacy-respecting alternative.

---

## 3. Agreed pivot directions

Three non-exclusive directions; current consensus = pursue 1 first, refactor for 2/3 in parallel.

### Direction 1 — Consumer UX leap-frog
Kill Convert Time's edge, then surpass it. Same scope, much better UX.

### Direction 2 — B2B pivot (Slack / Gmail / Outlook)
Port engine to in-channel converter. Per-user $1–2/mo. Same parser engine, ~80% code reuse.

### Direction 3 — Vertical SaaS (recruiting / SDR / CS)
"Every entity in your inbox is one-click-actionable." Calendly-adjacent. Highest WTP per seat.

---

## 4. Strategic anchor: cursor + lens framework

[Speculation] If directions 1–3 work, the long-arc thesis is: Onul evolves from "timezone parser" into a **universal entity tooltip framework** — a cross-browser, local-first Magic Pointer for non-Googlebook hardware.

Architecture sketch:
- `@onul/engine` — DOM-free entity detector + converter core.
- `@onul/lens-time` — current Onul (lens #1).
- `@onul/lens-currency`, `@onul/lens-units`, `@onul/lens-address`, `@onul/lens-phone`, `@onul/lens-color`, `@onul/lens-code`, `@onul/lens-ticker`, `@onul/lens-package` — future lenses.
- Plugin contract: detect → enrich → render → action.
- Trap to avoid: don't start here. Earn the right to platform via traction on direction 1.

---

## 5. Multi-phase roadmap

### Phase 0 — Foundation (1 week)
Tighten the existing thing before pivoting.

- [ ] Rename in Chrome Web Store listing: keep "Onul" as brand but title = `Onul — Timezone Converter on Highlight/Hover`.
- [ ] Add animated GIF / 30-sec demo video to README + store listing.
- [ ] Fix broken issue link in README.
- [ ] Ship to all three stores (Chrome Web Store, Firefox AMO, Safari App Store) — most comps don't do all three.
- [ ] Add `KEYBOARD.md` and surface Cmd+Shift+T (or similar) for "convert clipboard / cursor selection."
- [ ] Onboarding flow on first install: auto-detect TZ, show one example, done.

### Phase 1 — Consumer UX leap-frog (2–4 weeks)
Direction 1. Match then beat hover-based comps.

- [ ] **Hover-detect mode** alongside existing highlight mode. Setting toggle (highlight / hover / both). Underline detected entities subtly; popup on hover.
- [ ] **Range parsing**: `2-4pm PST`, `Mon-Wed 9-11am ET`, `9am–5pm UTC`. Extend `parser.ts` to return `{start, end}` ranges.
- [ ] **Inline subtle highlight**: a 1px dotted underline on detected times across the page (toggleable, debounced, MutationObserver-aware).
- [ ] **Editable-field support** (opt-in per-site): Gmail compose, Notion, Linear, Slack composer. Use floating popover positioned at caret, not at selection rect.
- [ ] **Keyboard shortcuts**: `Cmd+Shift+T` to convert clipboard. `Cmd+Shift+Y` to convert current selection. Configurable.
- [ ] **Clipboard-watch (opt-in)**: when you copy a date/time, popup offers converted version in pinned zones.
- [ ] **Pinned-zone UX rebuild**: searchable combobox (type "tokyo" → `Asia/Tokyo`), not 400-row `<select>`. Show current UTC offset per zone in the dropdown.
- [ ] **History panel** in extension popup: last 20 conversions, click to re-copy.
- [ ] **Calendar drop**: from popup, "Add to Google Calendar" / "Copy as ICS." This single feature shifts perception from "utility" to "workflow."
- [ ] Performance budget: <5ms parser per selection event on average page. Verify with synthetic benchmark.
- [ ] Telemetry-free analytics: count opens, not text — locally aggregated, no exfil.

### Phase 2 — Engine extraction + B2B spike (parallel, 3–6 weeks)
Direction 2 prep, no commitment yet.

- [ ] Refactor `parser.ts` + `timezone.ts` into `packages/engine/` — zero DOM imports, pure functions, publishable as `@onul/engine`.
- [ ] Public npm release of `@onul/engine`. Devs star tools they can `npm install`.
- [ ] Build **Slack app spike** (1 week timebox): bot rewrites times in messages to viewer's TZ via slash command `/onul`. Auto-pull TZ from Slack profile (zero-config per teammate is decisive — see Meridian's adoption thesis).
- [ ] Build **Gmail add-in spike** (1 week timebox): annotates times in incoming threads. Same engine.
- [ ] Decision gate: if either spike gets organic interest from 3+ teams, lock in B2B path. Pricing target: $1–2/user/mo (parity with Time Bot) or $99/team flat for ≤25 seats (parity with Meridian's anti-headcount stance).

### Phase 3 — Decide based on signal (gate review, week 8–10)
Use real numbers from Phases 1 + 2 to pick a primary lane.

- Consumer extension hits **≥2k installs and >40% W2 retention** → double down on Direction 1, slow-roll Direction 2.
- Slack/Gmail spike has **≥3 teams using daily** → flip primary to Direction 2; consumer ext becomes funnel.
- Both flat → pivot to Direction 3 (vertical SaaS). Pick one ICP — recruiters most likely, SDRs second.
- Neither flat nor obviously winning → choose by founder energy. Don't run all three.

### Phase 4 — Platform or vertical scale (3–6 months out)
Conditional on Phase 3 signal.

- **If consumer wins**: build the lens framework (Section 4). Open-source the lens SDK. Lens marketplace. Onul becomes the "Magic Pointer for the rest of us."
- **If B2B wins**: deepen Slack/Gmail. Add: scheduling assistant (next slot finder across TZ), holiday-aware OOO, working-hours overlap heatmap. Targets $2–5k MRR within 6 mo of paid launch.
- **If vertical wins**: pick recruiter ICP. Build the inbox add-in that turns every candidate email into a one-click slot. Integrate with Gem, Greenhouse, Ashby.

---

## 6. Adoption + virality plan (Hacker News, GitHub stars, organic)

### 6.1 Hacker News strategy
- **Don't** post `Show HN: Onul, a timezone converter`. That post dies.
- **Do** post with a thesis that triggers debate. Candidate hooks (rank by likely engagement):
  1. *"Show HN: We built a Magic Pointer for non-Googlebook laptops"* — rides current news cycle, frames Onul as principled alternative to Google's closed ecosystem.
  2. *"Show HN: Onul — Chrome's right-click menu should detect entities; here's a 50KB extension that does"* — engages "why doesn't [big-co] do X" instinct.
  3. *"Show HN: I open-sourced a timezone parser engine and made it the first lens in a universal tooltip framework"* — appeals to platform/extensibility crowd.
  4. *"Show HN: Offline timezone conversion that respects your privacy (no API, no telemetry, no LLM)"* — counter-positions against AI-everywhere fatigue.
- Launch timing: Tuesday or Wednesday, 7–9am Pacific. Avoid Mondays and weekends.
- First-comment seeded with: technical decision log (why chrono-node, why shadow DOM, why per-site permissions). HN rewards transparency about choices.
- Cross-post: lobste.rs (tagged `web`, `release`), r/programming, r/chrome_extensions, dev.to, console.dev newsletter, TLDR newsletter, Hacker Newsletter, BetaList.

### 6.2 GitHub stars playbook
- README is the conversion funnel. Currently functional but understated.
- Add **demo GIF as first visual** (priority: above the badges). Animated, ≤3 MB, shows the magic moment in <5 sec.
- Add **comparison table** in README (Onul vs Convert Time vs Savvy Time vs World Time Buddy) — biased but factual.
- Add **"Why not just use chrono-node?"** section. Devs ask this. Answer: it doesn't handle military time, epoch, normalization, conversion, UI, or per-site permissions.
- Add **"Architecture decisions"** section. Why MV3 not MV2, why Shadow DOM, why Luxon over date-fns-tz. Stars love technical honesty.
- Tag GitHub releases properly: semver, changelog, signed.
- Open ~5 well-scoped **good-first-issues** before launch — contributors star repos they can contribute to.
- Add **CONTRIBUTING.md** with low-friction setup (`npm i && npm run dev`).
- Add `npm install @onul/engine` story to README — "use our parser in your own project" doubles addressable interest.
- License: MIT (already implicit, make explicit).
- Add **GitHub Sponsors** + ko-fi/buy-me-a-coffee. Cheap optionality.
- Add badges that signal liveness: latest release, downloads/week, contributors, last commit. Avoid badge-spam.

### 6.3 Asymmetric distribution bets
- **One viral demo**: 30-sec video — split-screen of "manually doing timezone math in your head" vs "highlight and done." Post to X/Bluesky/LinkedIn. [Speculation] Best ROI per minute spent on marketing.
- **Reverse traction via integrations**: get listed on Linear / Notion / Slack / Raycast directories. Each is a separate funnel with ranking algorithm.
- **Niche communities to seed**:
  - r/remotework, r/digitalnomad, r/cscareerquestions, r/recruiting, r/sysadmin.
  - Indie Hackers, Hacker News Who's Hiring, Lobsters.
  - Twitter/X: distributed-work commentators, Calendly/Cron/Notion power users, devtools influencers.
  - Slack groups: Online Geniuses, MKBHD's Discord-adjacent communities, RemoteOK Discord.
- **Sponsor 1–2 niche dev newsletters** ($200–500 each): TLDR, Bytes, console.dev. Cheaper and more qualified than Twitter ads.
- **Comparison blog posts** on own domain (`onul.dev`): "I tried every timezone Chrome extension so you don't have to." SEO-friendly, link-bait, dogfoods Onul itself.
- **Live web demo page** (`onul.dev/try`): embed engine in a sandbox so visitors test without installing. Conversion funnel: try → install. [Inference] Higher conversion than store listing alone.
- **Daily.dev playbook**: multi-launch on Product Hunt. v1.0 → "Hover mode" → "Slack version" → "Lens framework." Each new launch resets the relevance clock.

### 6.4 Power-user features that become memes
- **Epoch paste**: paste `1715817600` anywhere → instant readable timestamp tooltip. Niche but devs tweet about niche delights.
- **Cron expression hover**: hover `0 9 * * 1-5` → "every weekday at 9am in `Asia/Singapore`." Pure dev catnip.
- **`Cmd+Shift+T` as superpower**: market the keyboard shortcut as a single concept. "The shortcut that converts anything." Memorable, tweetable.
- **iMessage/Notion paste-rewrite** (vertical SaaS extension): paste availability and Onul rewrites in recipient's TZ.

### 6.5 Onboarding that converts visitors → daily users
- First install: auto-detect TZ. Show one inline example on the active tab (manufactured). Hand-hold the magic moment within 5 seconds.
- Day 1 email (if collected): "Did the popup work on Gmail? Try `Cmd+Shift+T` next." Re-engages.
- Day 7 in-extension nudge: "Pin your team's timezones." Activates pinned-zone feature, which is the retention hook.
- [Inference] Retention hook is **pinned zones + clipboard-watch**, not the basic conversion. Get users to configure once, they stay.

---

## 7. Risks and what would kill this

| Risk | Likelihood | Mitigation |
|---|---|---|
| Magic Pointer becomes default on macOS (Apple Intelligence) and Win11 (Copilot) | High, 2–3 yr horizon | Bet on cross-platform, open-source, local-first as durable wedge |
| Chrome adds native entity detection in URL bar / right-click | Medium | Ship lens framework before Chrome does; own the long tail of entity types |
| Arc / Brave / Edge ship similar | Medium | Same; also distribute via their extension stores |
| Privacy regression in MV3 (Google forces broad host perms) | Low–medium | Stay on `optional_host_permissions` model; advocate publicly |
| chrono-node bus-factor / abandonment | Low | Engine wraps chrono; can swap or fork |
| Burnout — three directions, one founder | High if all pursued in parallel | Phase 3 gate enforces single primary lane |
| AI summarizer extensions absorb the use case ("ChatGPT, what's 2pm PST in Singapore?") | Medium | Speed + offline + zero-friction > LLM round-trip; lean into that |

---

## 8. Pricing experiments (deferred, not Phase 1)

- **Free forever, OSS, no paid tier**: consumer ext stays free; revenue is B2B side. Cleanest narrative for HN/GitHub.
- **Onul Pro consumer**: $3/mo or $29 lifetime. Power features: calendar integration, range math, custom lenses, unlimited pinned zones, sync across browsers via passwordless account. [Inference] Realistic ceiling $200–1000/mo.
- **Onul for Teams** (Slack/Gmail): $1/user/mo with 5-user min. Or $99/team flat. Free tier: 100 conversions/mo per team. Free trial 14 days no card.
- **Onul Vertical** (recruiter SaaS): $20–40/seat/mo. Requires integration depth (Greenhouse, Gem, Ashby) — earned via Phase 4 if Phase 3 picks Direction 3.

---

## 9. Decision log (where we are right now)

- 2026-05-15: Evaluated repo. Confirmed standalone consumer paid model is unviable. Agreed Directions 1–3.
- 2026-05-15: Googlebook (announced 3 days ago) provides strategic anchor. Cursor-tooltip paradigm now validated by Google.
- 2026-05-15: Agreed brainstorm mode — no code commits yet. This doc is the artifact.
- Next action (proposed, not committed): Phase 0 in the coming week. Phase 1 hover-detect spike as the single highest-leverage feature. Re-decide at Phase 3 gate.

---

## 10. Open questions (answer before Phase 1 starts)

1. Is "Onul" the long-term brand or a placeholder? Korean-rooted name has zero CWS-search value but is distinctive. Rename now or commit?
2. Solo or team? Phases 1+2 in parallel needs ≥1.5 FTE-equivalent of focus.
3. Funding posture? Bootstrap-only changes the calculus (lean toward consumer free + B2B paid). Open to seed changes it (lean toward platform/lens framework).
4. Privacy stance — is local-first a marketing pillar or just a default? If pillar, never add cloud features; if default, calendar sync etc. become OK.
5. Where does development happen — keep monorepo as-is or split `@onul/engine` into a separate repo for clearer OSS narrative?

---

## 11. Appendix: source-of-truth references

- Googlebook announcement: https://blog.google/products-and-platforms/platforms/android/meet-googlebook/
- Magic Pointer / cursor agent: https://www.theregister.com/software/2026/05/13/googles-ai-enabled-mouse-pointer-understands-this-and-that/5240005
- Convert Time (comp): https://chromewebstore.google.com/detail/convert-time/gfgafgnbjambinnibhlhjpmcoiamehej
- World Time Buddy reviews: https://www.g2.com/products/world-time-buddy/reviews
- Time Bot Slack pricing: https://help.timebot.chat/
- Meridian (anti-headcount Slack pricing): https://meridian-tz.app/
- Chrome ext monetization 2025: https://www.extensionradar.com/blog/how-to-monetize-chrome-extension
- Freemium real numbers: https://dev.to/_350df62777eb55e1/real-numbers-freemium-chrome-extension-monetization-after-6-months-5hga
- Marketing browser extensions 2026: https://extensionbooster.com/blog/marketing-browser-extension-complete-guide/
- Product Hunt multi-launch playbook: https://founderpath.com/blog/launch-on-product-hunt
