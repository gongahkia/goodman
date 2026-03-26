# CLAUDE.md — Conquest Agent Instructions

## Project Overview

Conquest is a Chrome-first Manifest V3 extension that captures quiz and poll content from any platform using screenshots, routes the image to a local or private-network vision LLM (Ollama or any OpenAI-compatible endpoint), and displays the answer as a floating overlay. It performs zero DOM scraping, zero auto-clicking, and runs inference through the background service worker only. Firefox artifacts remain deferred work and are not part of the supported branch surface.

## Tech Stack

| Layer              | Choice                                           |
|--------------------|--------------------------------------------------|
| Extension manifest | Manifest V3                                      |
| Language           | TypeScript (strict mode)                         |
| Build tooling      | Vite + @crxjs/vite-plugin                        |
| Test runner        | Vitest (jsdom environment)                       |
| Linting            | ESLint flat config + @typescript-eslint           |
| CSS                | Plain CSS, BEM naming, CSS custom properties      |
| Browsers           | Chrome 120+ (Firefox deferred on this branch)    |
| LLM communication  | fetch to local Ollama / OpenAI-compatible servers |

## Build Commands

```bash
npm run dev          # Vite watch mode with CRXJS HMR
npm run build        # Production build to dist/
npm run build:prod   # Alias: production build, minified, no dev-reload
npm run lint         # ESLint across src/
npm run typecheck    # tsc --noEmit
npm test             # vitest run
npm run test:watch   # vitest (watch mode)
npm run package      # Build + zip for Chrome Web Store
npm run clean        # Remove dist/
```

## Project Structure

```
conquest/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── eslint.config.js
├── vitest.config.ts
├── CLAUDE.md
├── STYLE_GUIDE.md
├── DESIGN_SYSTEM.md
├── ARCHITECTURE.md
├── todo.md
├── README.md
├── src/
│   ├── background/
│   │   └── service-worker.ts
│   ├── content/
│   │   ├── index.ts
│   │   └── region-selector.ts
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   ├── popup.css
│   │   └── log-viewer.ts
│   ├── options/
│   │   ├── options.html
│   │   ├── options.ts
│   │   └── options.css
│   ├── capture/
│   │   └── screenshot.ts
│   ├── detect/
│   │   ├── trigger.ts
│   │   └── platform.ts
│   ├── llm/
│   │   ├── provider.ts
│   │   ├── ollama.ts
│   │   ├── openai-compat.ts
│   │   ├── factory.ts
│   │   ├── parser.ts
│   │   └── retry.ts
│   ├── ui/
│   │   ├── overlay.ts
│   │   └── overlay.css
│   ├── core/
│   │   ├── capture-request.ts
│   │   └── orchestrator.ts
│   ├── lib/
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── endpoint.ts
│   │   ├── storage.ts
│   │   ├── messages.ts
│   │   ├── error-handler.ts
│   ├── assets/
│   │   ├── icon-16.png
│   │   ├── icon-48.png
│   │   └── icon-128.png
│   └── __tests__/
│       └── integration.test.ts
├── src/llm/__tests__/
│   └── parser.test.ts
├── src/detect/__tests__/
│   └── platform.test.ts
├── src/lib/__tests__/
│   └── storage.test.ts
└── dist/                          # gitignored
```

## Key Architectural Decisions

### 1. Screenshot-only capture (no DOM scraping)
All quiz content is captured via `chrome.tabs.captureVisibleTab`. There is no DOM parsing, no CSS selector logic, no platform-specific scrapers. The vision LLM interprets the screenshot directly. This makes the extension platform-agnostic.

### 2. All LLM calls happen in the background service worker
Network requests to LLM endpoints (Ollama, OpenAI-compatible) happen ONLY in `src/background/service-worker.ts`. Content scripts and popup NEVER make fetch calls to LLM servers. This is a hard security boundary.

### 3. Shadow DOM for the overlay
The floating answer overlay is injected into host pages inside a Shadow DOM root. This prevents CSS leakage in both directions. All overlay styles live inside the shadow boundary.

### 4. Single overlay panel (latest answer only)
The overlay shows only the most recent answer. Previous answers are in the session log, accessible from the popup. Do not stack or queue multiple overlay panels.

### 5. Multi-strategy LLM response parsing
LLM text output is parsed via a cascade (see ARCHITECTURE.md for detail):
1. Direct `JSON.parse` of the full response
2. Regex extraction of ```json fenced blocks
3. Regex extraction of bare `{...}` objects
4. Fallback: `{ answer: rawText, confidence: 0, reasoning: '', questionType: 'unknown' }`

### 6. Chrome-first scope
The supported branch surface is Chrome-first. Keep the current implementation focused on Chrome APIs and Chrome packaging until Firefox support is deliberately resumed and validated end-to-end.

### 7. Local storage only
Use `chrome.storage.local` exclusively. Never `chrome.storage.sync`. Configuration must not leak to cloud sync.

### 8. Extension name is "Conquest"
The extension is called "Conquest" everywhere: `manifest.json` name field, popup title, overlay branding, documentation, package scripts. The PRD refers to "Quiz Agent" in some places -- ignore that; the canonical name is Conquest.

## Coding Conventions

- **No semicolons** at line ends
- **Single quotes** for all strings (including imports)
- **2-space indent** (spaces, not tabs)
- **Trailing commas** in multiline arrays, objects, function parameters
- **Explicit return types** on all exported functions
- **No `any`** types. Use `unknown` and narrow. ESLint warns on `any`.
- **`const` by default**, `let` only when reassignment is needed, never `var`
- **Arrow functions** for callbacks and short functions. Named `function` declarations for top-level module exports where hoisting or readability benefits.
- **Async/await** over raw Promises. Never use `.then()` chains.
- **Template literals** over string concatenation
- **BEM naming** for CSS classes: `block__element--modifier`
- **Descriptive error messages**: terse, technical tone. Example: `'LLM endpoint unreachable: connection refused at ${endpoint}'`, not `'Oops! Something went wrong connecting to your AI model.'`

See STYLE_GUIDE.md for the complete coding style reference.

## What NOT To Do

1. **Do NOT scrape the DOM.** No `document.querySelector` calls to extract quiz content. All content comes from screenshots analyzed by the vision LLM.

2. **Do NOT auto-click answers.** The extension displays answers only. It never interacts with page elements to submit or select answers.

3. **Do NOT make LLM network calls outside the background service worker.** Content scripts and popup must use message passing to request LLM analysis.

4. **Do NOT use `chrome.storage.sync`.** All storage is local-only.

5. **Do NOT add host permissions.** The extension uses `activeTab` for capture. No broad host permissions.

6. **Do NOT reintroduce Firefox support claims casually.** Treat Firefox as deferred until packaging, runtime behavior, and QA are verified again.

7. **Do NOT use semicolons, double quotes, or tabs.** Follow the code style strictly.

8. **Do NOT use `any` type.** Use `unknown` and type-narrow instead.

9. **Do NOT stack multiple overlay panels.** Only show the latest answer.

10. **Do NOT add external dependencies without justification.** The project uses minimal dependencies: Vite, CRXJS plugin, Vitest, ESLint, and TypeScript. No UI frameworks, no CSS frameworks, no utility libraries.

11. **Do NOT use `var` or `.then()` chains.**

12. **Do NOT hardcode LLM endpoints.** All endpoints come from user configuration in storage.

13. **Do NOT reference "Quiz Agent" in code or UI.** The extension is called "Conquest".

## Task Execution

The implementing agent has full discretion over task ordering. The PRD (`todo.md`) defines 31 tasks with dependency chains expressed via `blockedBy` fields. Respect those dependencies, but otherwise choose the optimal implementation sequence. Each task has explicit DONE WHEN acceptance criteria -- satisfy all checkboxes before considering a task complete.
