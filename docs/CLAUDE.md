# TC-Guard — Agent Instructions

TC-Guard is a Manifest V3 browser extension that automatically detects Terms & Conditions on any webpage, summarizes them using AI/LLM providers, highlights legally concerning "red flag" clauses, and tracks T&C changes over time per domain.

**Tech stack:** TypeScript, Vite + @crxjs/vite-plugin, Chrome Manifest V3, webextension-polyfill (Firefox), Vitest, Playwright.

**Browser targets:** Chrome 120+, Firefox 120+.

**Status:** Greenfield project. No source code exists yet. Build everything from `todo.txt`.

## Specification

The primary spec is `todo.txt` — 57 tasks (0–57), each with PURPOSE, WHAT TO DO, and DONE WHEN sections.

- **Priority A** (26 tasks) — must-have, critical path.
- **Priority B** (25 tasks) — important, includes version tracking (the killer feature).
- **Priority C** (7 tasks) — nice-to-have (custom endpoints, E2E tests, store submission, docs).
- **Implement all tasks (A+B+C).**
- Each task has a `blockedBy` declaration — respect the dependency order.
- Tags (`+scaffold`, `+detection`, `+extraction`, `+providers`, `+summarizer`, `+versioning`, `+ui`, `+popup`, `+security`, `+testing`, `+cicd`, `+compat`, `+docs`) group related tasks.

## Companion Documents

Read these before writing code:

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | System architecture, data flow, module boundaries, message protocol |
| `STYLE_GUIDE.md` | All code conventions — naming, Result pattern, testing, i18n, linting |
| `DESIGN_SYSTEM.md` | UI design tokens, color palettes, component patterns with diagrams |
| `IMPLEMENTATION_GUIDE.md` | Task execution order, TDD workflow, commit conventions, pitfalls |

## Development Workflow

```bash
pnpm dev           # Vite HMR, loads in Chrome
pnpm build         # Production build (Chrome)
pnpm build:firefox # Production build (Firefox)
pnpm test          # Vitest unit/integration tests
pnpm test:e2e      # Playwright E2E tests
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
```

Package manager is **pnpm**. Never use npm or yarn.

Run `pnpm typecheck && pnpm lint && pnpm test && pnpm build` before every commit.

## Git Conventions

**One commit per task.** 57 tasks = 57 commits.

Format: `<type>(<scope>): Task <N> - <description>`

- **type:** `feat` (new functionality), `test` (test tasks), `fix` (security/error tasks), `ci` (CI/CD), `docs` (documentation), `chore` (scaffolding/config).
- **scope:** the task tag without `+`: `scaffold`, `detection`, `extraction`, `providers`, `summarizer`, `versioning`, `ui`, `popup`, `security`, `testing`, `cicd`, `compat`, `docs`.
- **description:** imperative mood, lowercase, no period, under 60 characters.

Examples:
```
chore(scaffold): Task 0 - initialize project with Vite and crxjs
feat(scaffold): Task 1 - create Manifest V3 configuration
feat(detection): Task 5 - implement checkbox detector
feat(providers): Task 15 - implement OpenAI provider
test(testing): Task 45 - add detection unit tests
fix(security): Task 42 - add typed error handling for providers
ci(cicd): Task 50 - add GitHub Actions CI workflow
docs(docs): Task 55 - create project README
```

## Key Decisions

These are non-negotiable project-wide rules:

- **UI:** Polished & modern. Subtle shadows, rounded corners, smooth transitions (Linear/Raycast feel).
- **i18n:** Use Chrome i18n API with `_locales/en/messages.json`. Ship English only. Structure supports future locales.
- **a11y:** Semantic HTML, keyboard navigation, visible focus indicators. No formal WCAG audit.
- **Naming:** kebab-case files (`checkbox-detector.ts`), camelCase functions (`detectCheckboxes`), PascalCase types (`CheckboxDetector`).
- **Error handling:** Typed Result pattern (`Result<T, E>`). Never throw except for unrecoverable programmer errors. See `STYLE_GUIDE.md`.
- **Testing:** TDD. Write tests first, then implementation. Every DONE WHEN checkbox maps to a test assertion.
- **CSS:** Plain CSS strings in Shadow DOM `<style>` tags. No CSS framework. Design tokens from `DESIGN_SYSTEM.md`.
- **Telemetry:** Zero. No analytics, tracking, or crash reporting. Anywhere. Ever.
- **Browser compat:** Chrome 120+ / Firefox 120+. Use modern APIs freely (ES2022, crypto.subtle, structuredClone).
- **Ambiguity:** When the todo leaves details open, make best-judgment calls and document decisions in brief code comments.
- **Scope:** Implement all 57 tasks including priority C.
- **Commits:** One atomic commit per task.

## Things to Never Do

- Never add telemetry, analytics, or crash reporting.
- Never use `innerHTML` with user-provided or extracted content (XSS risk). Use `textContent` or DOM APIs.
- Never log API keys to console.
- Never throw exceptions for recoverable errors — use the Result pattern.
- Never use `npm` or `yarn` — this project uses `pnpm`.
- Never amend a previous task's commit — each task is atomic.
- Never use `any` type — use `unknown` + type narrowing.
- Never put business logic in `index.ts` barrel files.
- Never create circular module dependencies.
