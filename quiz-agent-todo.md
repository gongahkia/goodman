# Quiz Agent — PRD

> Manifest V3 Chrome extension (+ Firefox via webextension-polyfill) that captures quiz/poll content from any platform (Kahoot, Google Forms, Mentimeter, WooClap, Slido, etc.) via screenshot, routes to a local vision LLM (Ollama or OpenAI-compatible endpoint), and displays the answer as a floating overlay. No DOM scraping. No auto-click. Local-only inference.

---

## Scaffolding & Infrastructure

### Task 1 (A) +ext
blockedBy: none

**PURPOSE** — Establishes the Manifest V3 Chrome extension skeleton. Every other task depends on this structure existing.

**WHAT TO DO**
1. Create project root with the following structure:
   ```
   manifest.json
   src/
     background/service-worker.ts
     content/index.ts
     popup/popup.html, popup.ts, popup.css
     options/options.html, options.ts, options.css
     capture/screenshot.ts
     detect/trigger.ts, platform.ts
     llm/provider.ts, ollama.ts, openai-compat.ts, factory.ts
     ui/overlay.ts
     core/orchestrator.ts
     lib/
       types.ts
       constants.ts
       storage.ts
     assets/
       icon-16.png, icon-48.png, icon-128.png
   ```
2. `manifest.json`: Manifest V3, permissions: `activeTab`, `storage`, `tabs` (for captureVisibleTab). No host permissions needed (no DOM injection). Name: "Quiz Agent". Description: "Screenshot-based quiz answering with local AI models." Background service worker at `src/background/service-worker.ts`.
3. `src/lib/types.ts`: Define core TypeScript interfaces:
   - `LLMProviderType`: `'ollama' | 'openai-compatible'`.
   - `CaptureMode`: `'fullpage' | 'region'`.
   - `ExtensionConfig`: `{ captureMode: CaptureMode, llmProvider: LLMProviderType, llmEndpoint: string, llmModel: string, autoCapture: boolean, keyboardShortcut: string }`.
   - `QuizAnswer`: `{ answer: string, confidence: number, reasoning: string, questionType: string }`.
   - `LogEntry`: `{ answer: QuizAnswer, screenshotThumbnail?: string, platform: string, timestamp: number }`.
4. `src/lib/constants.ts`: Default config values — `DEFAULT_LLM_PROVIDER = 'ollama'`, `DEFAULT_LLM_ENDPOINT = 'http://localhost:11434'`, `DEFAULT_LLM_MODEL = 'qwen2.5-vl'`, `DEFAULT_CAPTURE_MODE = 'fullpage'`, `SUPPORTED_PLATFORMS = ['wooclap.com', 'kahoot.it', 'docs.google.com/forms', 'mentimeter.com', 'slido.com', 'menti.com', 'app.sli.do']`.
5. `src/lib/storage.ts`: Thin wrapper around `chrome.storage.local` — `getConfig(): Promise<ExtensionConfig>`, `setConfig(partial: Partial<ExtensionConfig>): Promise<void>`, `getSessionLog(): Promise<LogEntry[]>`, `appendLog(entry: LogEntry): Promise<void>`, `clearSessionLog(): Promise<void>`. Use defaults from `constants.ts` for missing keys.
6. Set up build tooling: `package.json` with `typescript`, `esbuild` (or `vite` with `@crxjs/vite-plugin`), scripts `dev` (watch build), `build` (production build), `clean`. `tsconfig.json` targeting `ES2022`, `moduleResolution: bundler`.

**DONE WHEN**
- [ ] `npm run build` produces a `dist/` folder with valid `manifest.json`, bundled JS for background, content, popup, and options.
- [ ] Extension loads in `chrome://extensions` with developer mode without errors.
- [ ] `chrome.storage.local` round-trip test: calling `setConfig({captureMode: 'region'})` then `getConfig()` returns `captureMode: 'region'` with all other fields populated from defaults.

---

### Task 2 (A) +ext
blockedBy: [1]

**PURPOSE** — Message-passing backbone between content script, background worker, and popup. All inter-component communication depends on this.

**WHAT TO DO**
1. `src/lib/messages.ts`: Define a discriminated union type `Message` with the following variants:
   - `{ type: 'QUESTION_DETECTED', payload: CapturedQuestion }`
   - `{ type: 'ANSWER_READY', payload: LLMAnswer }`
   - `{ type: 'REQUEST_ANSWER', payload: CapturedQuestion }`
   - `{ type: 'AUTO_CLICK_RESULT', payload: { success: boolean, error?: string } }`
   - `{ type: 'CONFIG_UPDATED', payload: Partial<ExtensionConfig> }`
   - `{ type: 'GET_STATUS', payload: null }`
   - `{ type: 'STATUS', payload: { active: boolean, lastQuestion?: CapturedQuestion, lastAnswer?: LLMAnswer } }`
2. `src/lib/messages.ts`: Export helper `sendMessage(msg: Message): Promise<Message>` wrapping `chrome.runtime.sendMessage` with typed response. Export `sendToTab(tabId: number, msg: Message): Promise<Message>` wrapping `chrome.tabs.sendMessage`.
3. `src/background/service-worker.ts`: Register `chrome.runtime.onMessage` listener. For now, echo back received messages with `{ type: 'STATUS', payload: { active: true } }` as placeholder.
4. `src/content/index.ts`: Register `chrome.runtime.onMessage` listener. Log received messages to console.
5. `src/popup/popup.ts`: On popup open, send `GET_STATUS` to background, log response.

**DONE WHEN**
- [ ] Popup sends `GET_STATUS` to background and receives `STATUS` response (verify via console logs in background service worker and popup DevTools).
- [ ] Content script receives messages sent via `sendToTab` from background (verify via console log on a quiz page).

---

## Screenshot Capture

### Task 3 (A) +capture
blockedBy: [1]

**PURPOSE** — Captures quiz content from any web page via screenshot. This is the primary and only capture method.

**WHAT TO DO**
1. In `capture/screenshot.ts`, implement `captureFullPage(): Promise<string>` using `chrome.tabs.captureVisibleTab(null, {format: 'png'})`. Returns base64 PNG.
2. Implement `captureRegion(rect: {x, y, w, h}): Promise<string>` that captures full page then crops to region using OffscreenCanvas.
3. Implement region selection UI: user clicks and drags to select a region. Draw a semi-transparent overlay with resize handles.
4. Store last-used region per domain in chrome.storage.local for quick re-capture.
5. Add "Capture Full Page" and "Capture Region" buttons to popup.

**DONE WHEN**
- [ ] Full-page screenshots are captured as valid base64 PNGs.
- [ ] Region selection UI allows click-and-drag with resize handles.
- [ ] Cropped region screenshots match the selected bounding rect.
- [ ] Last-used region persists per domain and restores on revisit.

---

## LLM Integration

### Task 4 (A) +llm
blockedBy: [1]

**PURPOSE** — Defines the contract for local vision LLM providers.

**WHAT TO DO**
1. In `llm/provider.ts`, define:
   ```typescript
   interface VisionLLMProvider {
     name: string;
     isAvailable(): Promise<boolean>;
     analyzeImage(image: string, prompt: string): Promise<QuizAnswer>;
   }
   interface QuizAnswer {
     answer: string;
     confidence: number; // 0-1
     reasoning: string;
     questionType: string; // detected by the model
   }
   ```
2. The `image` parameter is always a base64 PNG string.
3. The `prompt` parameter includes instructions for the model to identify the question type, extract the question, and provide the answer.

**DONE WHEN**
- [ ] Interface is defined in `llm/provider.ts`.
- [ ] Both `OllamaProvider` and `OpenAICompatProvider` implement it.
- [ ] `QuizAnswer` type is exported and used by the orchestrator and overlay.

---

### Task 5 (A) +llm
blockedBy: [4]

**PURPOSE** — Integrates with Ollama's native API for vision model inference.

**WHAT TO DO**
1. In `llm/ollama.ts`, implement `OllamaProvider` class.
2. `isAvailable()`: GET `{baseUrl}/api/tags` and check for vision-capable models.
3. `analyzeImage(image, prompt)`: POST `{baseUrl}/api/generate` with body `{ model, prompt, images: [base64], stream: false }`.
4. Parse response JSON. Extract answer, confidence, reasoning from the model's text output using a structured output prompt.
5. Default baseUrl: `http://localhost:11434`.
6. Support model selection (user picks from available vision models).
7. Implement health check that tests if Ollama is running and has a vision model loaded.

**DONE WHEN**
- [ ] With Ollama running locally, `isAvailable()` returns `true`.
- [ ] Ollama with llava/qwen2.5-vl can analyze a screenshot and return a structured `QuizAnswer`.
- [ ] With Ollama stopped, `isAvailable()` returns `false` (does not throw).
- [ ] Model selection lists only vision-capable models from `/api/tags`.

---

### Task 6 (A) +llm
blockedBy: [4]

**PURPOSE** — Supports any local LLM server that exposes the OpenAI-compatible vision API (LM Studio, LocalAI, llama.cpp server, Jan.ai, vLLM).

**WHAT TO DO**
1. In `llm/openai-compat.ts`, implement `OpenAICompatProvider` class.
2. `isAvailable()`: GET `{baseUrl}/v1/models` and check response.
3. `analyzeImage(image, prompt)`: POST `{baseUrl}/v1/chat/completions` with standard vision message format:
   ```json
   {
     "model": "{model}",
     "messages": [{
       "role": "user",
       "content": [
         {"type": "text", "text": "{prompt}"},
         {"type": "image_url", "image_url": {"url": "data:image/png;base64,{image}"}}
       ]
     }],
     "max_tokens": 1000
   }
   ```
   <!-- WHY max_tokens: 1000: vision model quiz answers rarely exceed 300 tokens; 1000 provides headroom for detailed reasoning without wasting context -->
4. Parse response from `choices[0].message.content`.
5. Configurable base URL with presets: LM Studio (localhost:1234), LocalAI (localhost:8080), llama.cpp (localhost:8080), Jan.ai (localhost:1337), vLLM (localhost:8000).
6. Configurable model name.

**DONE WHEN**
- [ ] Can analyze screenshots via any OpenAI-compatible local server.
- [ ] Presets auto-fill the correct base URL for each backend.
- [ ] Works without an API key when the server doesn't require one.
- [ ] Custom base URL works for non-preset servers.

---

### Task 7 (A) +llm
blockedBy: [5, 6]

**PURPOSE** — Selects and initializes the active LLM provider.

**WHAT TO DO**
1. In `llm/factory.ts`, implement `createProvider(config): VisionLLMProvider`.
2. Two provider types: `'ollama'` and `'openai-compatible'`.
3. For `'openai-compatible'`, use the preset base URLs or custom URL.
4. Implement `autoDetect()`: try Ollama first (most common), then LM Studio, then others.

**DONE WHEN**
- [ ] `createProvider` returns correct provider type for each `llmProvider` value.
- [ ] `autoDetect()` finds a running Ollama instance and returns a configured provider.
- [ ] `autoDetect()` falls back to LM Studio, then other presets, if Ollama is not running.
- [ ] Calling `createProvider` with the same config returns a cached instance.

---

## Platform Detection & Orchestration

### Task 8 (A) +detect
blockedBy: [1]

**PURPOSE** — Identifies which quiz platform is being used for prompt optimization.

**WHAT TO DO**
1. In `detect/platform.ts`, define platform signatures:
   - WooClap: URL contains `wooclap.com` or `app.wooclap.com`
   - Kahoot: URL contains `kahoot.it` or `play.kahoot.it`
   - Google Forms: URL contains `docs.google.com/forms`
   - Mentimeter: URL contains `menti.com` or `mentimeter.com`
   - Slido: URL contains `slido.com` or `app.sli.do`
   - Generic: no match
2. Return platform name and platform-specific prompt hints.
3. Prompt hints help the vision model understand the visual layout (e.g., "Kahoot shows answers as colored blocks with shapes").

**DONE WHEN**
- [ ] All listed platforms are correctly detected from their URLs.
- [ ] Platform-specific prompt hints are returned for each known platform.
- [ ] Unknown URLs return `'generic'` with a generic prompt hint.
- [ ] Platform detection is case-insensitive.

---

### Task 9 (A) +detect
blockedBy: [1, 2, 8]

**PURPOSE** — Triggers quiz capture either manually or when a known quiz platform is detected.

**WHAT TO DO**
1. In `detect/trigger.ts`, implement manual trigger via keyboard shortcut (Alt+Q default).
2. Implement URL-based platform detection: match against known patterns (wooclap.com, kahoot.it, docs.google.com/forms, mentimeter.com, slido.com, etc.).
3. When a known platform is detected, show a subtle badge on the extension icon.
4. Optional: auto-capture on platform detection (off by default, user enables per-platform).

**DONE WHEN**
- [ ] Manual shortcut (Alt+Q) captures and analyzes the current page.
- [ ] Known quiz platforms are detected from URL and badge is shown.
- [ ] Auto-capture toggle works per-platform when enabled.
- [ ] Badge clears when navigating away from a known platform.

---

### Task 10 (A) +core
blockedBy: [3, 7, 8, 9]

**PURPOSE** — Core pipeline that ties capture, LLM, and display together.

**WHAT TO DO**
1. In `core/orchestrator.ts`:
   a. On trigger: capture screenshot (full page or last-used region).
   b. Build prompt: "Analyze this screenshot of a quiz/poll question. Identify the question type (multiple choice, true/false, open-ended, numerical, etc.). Extract the question text. Provide the correct answer with confidence (0-1) and brief reasoning. Respond in JSON: {answer, confidence, reasoning, questionType}."
   c. Send to active LLM provider.
   d. Parse response.
   e. Display answer overlay.
   f. Log to session history.
2. Add platform-specific prompt hints when a known platform is detected (e.g., "This is from Kahoot, answers are shown as colored blocks").

**DONE WHEN**
- [ ] End-to-end flow works: shortcut triggers screenshot, LLM analyzes, answer is displayed in overlay.
- [ ] Platform-specific prompt hints are appended when on a known platform.
- [ ] Session history is updated after each analysis.
- [ ] Errors in any stage are caught and displayed to the user.

---

### Task 11 (A) +core
blockedBy: [2, 7, 10]

**PURPOSE** — Background service worker orchestration: receives captured questions from content, routes to LLM, returns answers, manages logging.

**WHAT TO DO**
1. `src/background/service-worker.ts`: Refactor the message handler.
   - On `REQUEST_ANSWER`:
     1. Load config.
     2. Get provider via `createProvider(config)`.
     3. Build prompt with platform-specific hints.
     4. Call `provider.analyzeImage(screenshot, prompt)`.
     5. Send `ANSWER_READY` response with the `QuizAnswer`.
     6. Append to session log via `appendLog(...)`.
   - On `GET_STATUS`: Return current state (active, last answer, provider status).
   - On `CONFIG_UPDATED`: Invalidate provider cache. Broadcast to all tabs.
   - On `CAPTURE_SCREENSHOT`: Handle via `captureVisibleTab`.
2. Wrap LLM call in try/catch. On error, return `QuizAnswer` with `answer: 'Error: {message}'`, `confidence: 0`.

**DONE WHEN**
- [ ] Receiving `REQUEST_ANSWER` with a valid screenshot triggers LLM call and returns `ANSWER_READY` with populated `QuizAnswer`.
- [ ] LLM errors are caught and returned as error `QuizAnswer` (no unhandled promise rejections in background).
- [ ] Session log is appended on each question/answer cycle.
- [ ] `GET_STATUS` returns the most recent answer and provider status.

---

## User Interface

### Task 12 (A) +ui
blockedBy: [1]

**PURPOSE** — Displays the LLM's answer as a floating panel on the page.

**WHAT TO DO**
1. In `ui/overlay.ts`, inject a floating panel into the page via content script.
2. Panel shows: question type badge, answer text (large), confidence bar (color-coded: green >0.8, yellow >0.5, red <0.5), reasoning (collapsible).
   <!-- WHY confidence thresholds >0.8 green, >0.5 yellow, <0.5 red: 80%+ represents high model certainty; below 50% means the model is guessing -->
3. Panel is draggable and dismissable (X button or Escape key).
4. Panel auto-positions to not obscure the detected quiz area.
5. Style with Shadow DOM to avoid CSS conflicts with host page.
6. Fade in/out animations.

**DONE WHEN**
- [ ] Answer displays in a clean floating overlay on the page.
- [ ] Confidence bar is color-coded correctly (green/yellow/red).
- [ ] Panel is draggable to any position and dismissable via X or Escape.
- [ ] Shadow DOM isolates styles from the host page.
- [ ] Fade in/out animations are smooth and non-janky.

---

### Task 13 (A) +ui
blockedBy: [1, 2]

**PURPOSE** — Main extension popup showing current state and quick actions.

**WHAT TO DO**
1. Show provider status: connected/disconnected, model name, server URL.
2. Show last answer: question type, answer text, confidence badge, reasoning (collapsible).
3. Quick action buttons: "Capture Full Page", "Capture Region", "Settings".
4. Provider health indicator (green dot = connected, red = disconnected).
5. Model info: name, size, VRAM usage if available.

**DONE WHEN**
- [ ] Popup opens showing current provider status (green/red indicator).
- [ ] Last answer is displayed with question type, answer text, confidence badge, and collapsible reasoning.
- [ ] "Capture Full Page" and "Capture Region" buttons trigger the corresponding capture mode.
- [ ] "Settings" button opens the options page.

---

### Task 14 (B) +ui
blockedBy: [7, 13]

**PURPOSE** — Settings page for configuring LLM providers and behavior.

**WHAT TO DO**
1. Provider selection: Ollama or OpenAI-compatible.
2. For Ollama: base URL, model dropdown (fetched from `/api/tags`, filtered to vision models).
3. For OpenAI-compatible: preset dropdown (LM Studio, LocalAI, llama.cpp, Jan.ai, vLLM, Custom) that auto-fills base URL. Model name text field.
4. Test connection button that runs `isAvailable()`.
5. Capture settings: default mode (full page vs region), auto-capture on known platforms toggle.
6. Keyboard shortcut configuration.
7. Model recommendations section: suggest Qwen2.5-VL 7B for accuracy, Gemma 3 4B for speed, Moondream 2 for low VRAM.

**DONE WHEN**
- [ ] Selecting each provider shows the correct input fields.
- [ ] Ollama model dropdown lists only vision-capable models.
- [ ] OpenAI-compatible presets auto-fill the correct base URL.
- [ ] "Test Connection" shows "Connected" or a descriptive error.
- [ ] All settings persist to `chrome.storage.local` and send `CONFIG_UPDATED`.
- [ ] Model recommendations are displayed with VRAM requirements.

---

### Task 15 (B) +ui
blockedBy: [13, 19]

**PURPOSE** — Session log viewer in popup. Users can review all Q&A pairs from the current session.

**WHAT TO DO**
1. `src/popup/log-viewer.ts`: Export `renderLogPanel(container: HTMLElement): void`.
   - Call `getSessionLog()` to retrieve all `LogEntry` items.
   - For each entry, render:
     ```
     <div class="log-entry">
       <div class="log-time">{HH:MM:SS}</div>
       <div class="log-question">{questionType}</div>
       <div class="log-answer">{answer}</div>
       <div class="log-meta">Confidence: {confidence}% | Platform: {platform}</div>
     </div>
     ```
   - Newest entries on top.
   - Add "Clear Log" button at bottom — calls `clearSessionLog()` and re-renders.
   - Add "Export Log" button — generates JSON file and triggers download via `URL.createObjectURL` + temporary `<a>` element.
2. `src/popup/popup.ts`: `#logs-btn` click toggles between answer panel and log panel.

**DONE WHEN**
- [ ] After 3 question/answer cycles, log viewer shows 3 entries in reverse chronological order.
- [ ] "Clear Log" empties the log and re-renders an empty state.
- [ ] "Export Log" downloads a `.json` file containing the `LogEntry[]` array.
- [ ] Toggling between answer panel and log panel works without losing state.

---

### Task 16 (B) +llm
blockedBy: [5, 14]

**PURPOSE** — Helps users choose the right vision model for their hardware.

**WHAT TO DO**
1. In options page, show a "Recommended Models" section.
2. Display three tiers:
   - High accuracy: Qwen2.5-VL 7B (~8GB VRAM)
   - Balanced: Gemma 3 4B (~5GB VRAM)
   - Lightweight: Moondream 2 1.8B (~2GB VRAM)
3. For Ollama users, check which models are already downloaded via `/api/tags` and highlight them.
4. Provide one-click "Pull Model" button that sends `POST /api/pull` to Ollama.

**DONE WHEN**
- [ ] Recommendations display with VRAM requirements for each tier.
- [ ] Already-downloaded models are visually highlighted.
- [ ] "Pull Model" button triggers Ollama model download and shows progress.
- [ ] Non-Ollama providers show recommendations without the pull button.

---

## Error Handling & Resilience

### Task 17 (A) +core
blockedBy: [2, 10]

**PURPOSE** — Graceful error handling throughout the pipeline. Prevents silent failures and gives users actionable feedback.

**WHAT TO DO**
1. `src/lib/error-handler.ts`: Export:
   - `enum ErrorCode { CAPTURE_FAILED, LLM_UNAVAILABLE, LLM_ERROR, LLM_TIMEOUT, PARSE_FAILED, STORAGE_ERROR }`.
   - `class AgentError extends Error { code: ErrorCode; userMessage: string; }`.
   - `handleError(error: unknown): AgentError` — normalizes any thrown value into `AgentError`.
2. `src/core/orchestrator.ts`: Wrap the pipeline in try/catch. On error:
   - Send `{ type: 'ERROR', payload: { code, userMessage } }` to popup.
   - Log to console with full stack trace.
   - Do not crash the trigger listener — continue listening for next trigger.
3. `src/background/service-worker.ts`: Wrap LLM call with timeout — if no response in 30s, reject with `LLM_TIMEOUT`. Configurable via `llmTimeoutMs` in config (add to `ExtensionConfig`, default 30000).
   <!-- WHY 30s LLM timeout: local vision models on consumer hardware (llava 7B) typically respond in 5-15s; 30s accommodates slow machines without hanging forever -->
4. Add `ERROR` message type to `messages.ts`.
5. `src/popup/popup.ts`: On `ERROR` message, display red banner with `userMessage` that auto-dismisses after 5s.
   <!-- WHY 5s auto-dismiss: long enough to read a short error message, short enough not to obscure the quiz -->

**DONE WHEN**
- [ ] LLM timeout after 30s triggers `LLM_TIMEOUT` error shown in popup.
- [ ] Capture failure shows `CAPTURE_FAILED` in popup.
- [ ] After an error, the trigger listener continues to work (no crash).
- [ ] Errors include both developer-facing (code + stack) and user-facing (message) info.

---

### Task 18 (B) +core
blockedBy: [5, 6]

**PURPOSE** — Retry logic for transient LLM failures. Network blips shouldn't require manual intervention.

**WHAT TO DO**
1. `src/lib/llm/retry.ts`: Export `withRetry<T>(fn: () => Promise<T>, options: { maxRetries: number, baseDelayMs: number, backoffMultiplier: number }): Promise<T>`.
   - On failure, retry up to `maxRetries` times with exponential backoff: `delay = baseDelayMs * (backoffMultiplier ^ attempt)`.
   - Only retry on network errors and 5xx status codes. Do NOT retry on 4xx client errors.
   - Return the first successful result.
   - On final failure, throw the last error.
2. `src/background/service-worker.ts`: Wrap the `provider.analyzeImage()` call with `withRetry({ maxRetries: 2, baseDelayMs: 1000, backoffMultiplier: 2 })`.
   <!-- WHY maxRetries: 2, baseDelayMs: 1000, backoffMultiplier: 2: 3 total attempts (1 + 2 retries) with 1s->2s delays; fast enough for interactive use while covering transient network issues -->

**DONE WHEN**
- [ ] A transient network error on first attempt succeeds on retry (verify with mock/spy).
- [ ] 4xx errors are NOT retried — fail immediately.
- [ ] After `maxRetries` exhausted, the original error propagates.
- [ ] Backoff delays are correct: 1000ms first retry, 2000ms second retry.

---

## Logging

### Task 19 (A) +log
blockedBy: [1, 2]

**PURPOSE** — Session-scoped answer logging. Persists Q&A history for the current browser session for user review and export.

**WHAT TO DO**
1. `src/lib/storage.ts`: Ensure `getSessionLog`, `appendLog`, `clearSessionLog` use key `'session_log'` in `chrome.storage.local`.
2. `src/background/service-worker.ts`: On extension startup (service worker activation), clear the session log (`clearSessionLog()`). This ensures logs are per-session (ephemeral across browser restarts).
3. `appendLog` in the background worker: called after every successful `ANSWER_READY` response. Include full `QuizAnswer` and platform name.
4. `src/lib/storage.ts`: Add `exportSessionLog(): Promise<string>` — returns pretty-printed JSON of `LogEntry[]`.
5. Enforce max log size: if `session_log` array exceeds 500 entries, trim oldest entries to keep 500.
   <!-- WHY 500 max log entries: at ~1KB per entry, 500 entries ~ 500KB in chrome.storage.local (limit is 10MB); covers a full exam session -->

**DONE WHEN**
- [ ] After answering 3 questions, `getSessionLog()` returns 3 `LogEntry` items.
- [ ] On browser restart, session log is empty.
- [ ] `exportSessionLog()` returns valid JSON string.
- [ ] 501st entry causes the oldest entry to be removed (array stays at 500).

---

## Security

### Task 20 (A) +security
blockedBy: [1, 5, 6]

**PURPOSE** — Endpoint security. Local server URLs and configuration must be stored securely and never leak to content scripts.

**WHAT TO DO**
1. All LLM API calls must happen exclusively in the background service worker (never in content script or popup). Verify no `fetch` calls to LLM endpoints exist outside `src/background/` and `src/llm/`.
2. `src/lib/storage.ts`: Endpoint URLs stored in `chrome.storage.local` (not `sync` — avoid cloud sync of configuration). Export `getMaskedConfig(): Promise<ExtensionConfig>` that returns config with endpoints showing only the host portion for display.
3. Content Security Policy in `manifest.json`: `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none'" }`.

**DONE WHEN**
- [ ] No LLM API fetch calls exist in content script code.
- [ ] `getMaskedConfig()` returns a safe display version of the config.
- [ ] CSP header is set in manifest.

---

## Build & Dev Tooling

### Task 21 (A) +build
blockedBy: [1]

**PURPOSE** — Hot-reload development workflow. Extension development without hot reload is prohibitively slow.

**WHAT TO DO**
1. `package.json`: Add `dev` script that runs the bundler in watch mode.
   - If using Vite + CRXJS: `vite build --watch` with CRXJS plugin handles HMR.
   - If using esbuild: custom watch script that rebuilds on file change and triggers extension reload via `chrome.runtime.reload()` in a dev-only background script.
2. Add `dev-reload.ts` (only included in dev builds): uses `WebSocket` connection to a tiny dev server that sends reload signals. On signal, calls `chrome.runtime.reload()`.
3. `package.json`: Add `build:prod` script that builds without dev-reload code, with minification.
4. `.gitignore`: Add `dist/`, `node_modules/`.

**DONE WHEN**
- [ ] `npm run dev` starts a watch process; editing a `.ts` file triggers rebuild within 2s.
  <!-- WHY 2s rebuild: acceptable developer feedback loop; most esbuild/vite rebuilds complete in <500ms -->
- [ ] Extension auto-reloads in Chrome after rebuild (verify via console log timestamp).
- [ ] `npm run build:prod` outputs minified bundle without dev-reload code.
- [ ] `dist/` is in `.gitignore`.

---

### Task 22 (B) +build
blockedBy: [1]

**PURPOSE** — Linting and type checking for code quality. Catches bugs before they reach the browser.

**WHAT TO DO**
1. `package.json`: Add `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.
2. `eslint.config.js` (flat config): TypeScript rules, no-unused-vars as error, no-explicit-any as warn. Browser globals enabled.
3. `package.json` scripts: `lint` → `eslint src/`, `typecheck` → `tsc --noEmit`.
4. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["chrome"]`. Install `@types/chrome`.

**DONE WHEN**
- [ ] `npm run lint` passes with no errors on the codebase.
- [ ] `npm run typecheck` passes with no TypeScript errors.
- [ ] Introducing `let x: any` triggers a lint warning.

---

### Task 23 (B) +build
blockedBy: [5, 6, 8]

**PURPOSE** — Automated testing setup for critical paths (LLM response parsing, platform detection).

**WHAT TO DO**
1. `package.json`: Add `vitest` as test runner.
2. `vitest.config.ts`: Configure with `environment: 'jsdom'` for DOM tests.
3. `src/llm/__tests__/provider.test.ts`: Tests for response parsing:
   - Valid JSON output from LLM → correct `QuizAnswer`.
   - JSON in markdown code block → extracted and parsed.
   - Raw `{...}` in text → extracted and parsed.
   - Garbage input → fallback with `confidence: 0`.
4. `src/detect/__tests__/platform.test.ts`: Tests for platform detection:
   - WooClap URL → detected with correct prompt hints.
   - Kahoot URL → detected with correct prompt hints.
   - Unknown URL → returns `'generic'`.
5. `package.json` scripts: `test` → `vitest run`, `test:watch` → `vitest`.

**DONE WHEN**
- [ ] `npm test` runs all test files and passes.
- [ ] Response parsing tests cover all parsing strategies.
- [ ] Platform detection tests verify all supported platforms.

---

## Final Integration

### Task 24a (A) +core
blockedBy: [2, 9, 12, 17]

**PURPOSE** — Content script final wiring. Connects all content-side modules into the running extension.

**WHAT TO DO**
1. `src/content/index.ts`: Final wiring:
   - Import overlay, trigger listener.
   - Register keyboard shortcut listener.
   - On trigger: capture → send to background → receive answer → display overlay.
   - Listen for `CONFIG_UPDATED` → update behavior without page reload.
   - Listen for `ANSWER_READY` from background → show overlay.

**DONE WHEN**
- [ ] Content script loads without console errors on any page.
- [ ] Keyboard shortcut triggers capture → background → overlay display pipeline.
- [ ] `CONFIG_UPDATED` messages update content script behavior without requiring page reload.
- [ ] `ANSWER_READY` messages from background are rendered in the overlay.

---

### Task 24b (A) +core
blockedBy: [7, 11, 17, 18, 19]

**PURPOSE** — Background service worker final wiring. Connects all background-side modules into the running extension.

**WHAT TO DO**
1. `src/background/service-worker.ts`: Final wiring:
   - Import all providers, factory, retry, storage, error handler.
   - Register all message handlers.
   - On install/activate: `clearSessionLog()`.

**DONE WHEN**
- [ ] Background service worker starts without errors.
- [ ] All message types are handled (`REQUEST_ANSWER`, `GET_STATUS`, `CONFIG_UPDATED`, `CAPTURE_SCREENSHOT`).
- [ ] LLM calls are wrapped in retry logic.
- [ ] Session log is cleared on extension install/activate.

---

### Task 24c (A) +core
blockedBy: [13, 15, 19]

**PURPOSE** — Popup final wiring. Connects all popup-side modules into the running extension.

**WHAT TO DO**
1. `src/popup/popup.ts`: Final wiring:
   - Import log-viewer, storage.
   - Initialize UI state from background status.
   - Real-time updates via message listener.
2. Verify the full flow manually:
   - Load extension → navigate to any quiz platform → press Alt+Q → answer appears in overlay and popup.

**DONE WHEN**
- [ ] Popup opens and displays current status from background.
- [ ] Real-time updates: answering a question while popup is open updates the display.
- [ ] Log viewer toggle works and shows session history.
- [ ] On any quiz platform with a local LLM running: shortcut pressed → screenshot captured → answer appears in overlay within 10s.
- [ ] Switching providers in options takes effect on next capture without page reload.
- [ ] Session log contains the Q&A entry after the cycle.
- [ ] Errors (e.g., Ollama down) display in popup and overlay with actionable message.

---

### Task 25 (B) +ui
blockedBy: [2, 10]

**PURPOSE** — Keyboard shortcut for manual trigger. Primary user interaction for triggering quiz analysis.

**WHAT TO DO**
1. `manifest.json`: Add `commands` section:
   ```
   "commands": {
     "trigger-capture": {
       "suggested_key": { "default": "Alt+Q" },
       "description": "Capture and analyze quiz screenshot"
     }
   }
   ```
2. `src/background/service-worker.ts`: Listen for `chrome.commands.onCommand`. On `'trigger-capture'`:
   - Get active tab.
   - Capture screenshot via `chrome.tabs.captureVisibleTab`.
   - Send to LLM pipeline.
   - Send result to content script for overlay display.
3. Add `MANUAL_TRIGGER` to message types.
4. `src/core/orchestrator.ts`: On `MANUAL_TRIGGER`, immediately run the capture-analyze-display pipeline.

**DONE WHEN**
- [ ] Pressing `Alt+Q` on any page triggers the capture and analysis pipeline.
- [ ] Works on any website, not just known quiz platforms.
- [ ] Shortcut is visible in `chrome://extensions/shortcuts`.

---

### Task 26 (C) +ui
blockedBy: [11]

**PURPOSE** — Badge indicator on extension icon. Quick visual feedback without opening popup.

**WHAT TO DO**
1. `src/background/service-worker.ts`: After receiving `ANSWER_READY`:
   - Set badge text to the confidence percentage: `chrome.action.setBadgeText({ text: Math.round(answer.confidence * 100) + '%' })`.
   - Set badge color: green (`#00d4aa`) if confidence > 0.7, yellow (`#f0c040`) if 0.4-0.7, red (`#e04040`) if < 0.4. Use `chrome.action.setBadgeBackgroundColor`.
   <!-- WHY badge thresholds >0.7 green, 0.4-0.7 yellow, <0.4 red: slightly lower than overlay since badge is a quick glance, not detailed view -->
2. On `ERROR` message: set badge text to `'!'`, color red.
3. When navigating away from a known quiz platform: clear badge. Listen for `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` to detect tab changes.

**DONE WHEN**
- [ ] After answering a question with 90% confidence, badge shows "90%" in green.
- [ ] After an error, badge shows "!" in red.
- [ ] Navigating away from a quiz platform clears the badge.

---

### Task 27 (C) +ext
blockedBy: [24a, 24b, 24c]

**PURPOSE** — Firefox compatibility via WebExtension polyfill. Extends reach beyond Chrome.

**WHAT TO DO**
1. `package.json`: Add `webextension-polyfill` dependency.
2. Import `browser` from `webextension-polyfill` as a wrapper in a new `src/lib/browser-api.ts`. Export it. Replace all direct `chrome.*` calls across the codebase with imports from `browser-api.ts`.
3. Create `manifest.firefox.json`: Copy `manifest.json` but adjust for Firefox:
   - Remove `"background": { "service_worker": ... }`, replace with `"background": { "scripts": ["background.js"] }`.
   - Add `"browser_specific_settings": { "gecko": { "id": "quiz-agent@extension" } }`.
4. `package.json`: Add `build:firefox` script that copies `manifest.firefox.json` to `dist/manifest.json` after build.

**DONE WHEN**
- [ ] `npm run build:firefox` produces a `dist/` loadable in Firefox as temporary add-on.
- [ ] Core flow (capture → LLM → overlay display) works in Firefox.
- [ ] No direct `chrome.*` API calls remain in source (all go through `browser-api.ts`).

---

## CI, Packaging & Documentation

### Task 28 (B) +build
blockedBy: [21, 22, 23]

**PURPOSE** — Automated build, lint, and test on every push and PR.

**WHAT TO DO**
1. Create `.github/workflows/ci.yml`.
2. Steps: checkout, setup Node 20, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build:prod`.
3. Run on push to main and all PRs.

**DONE WHEN**
- [ ] CI passes on push and PR.
- [ ] Failing lint/typecheck/test blocks merge.

---

### Task 29 (B) +build
blockedBy: [21, 27]

**PURPOSE** — Produces installable extension packages for Chrome and Firefox.

**WHAT TO DO**
1. Add `package` script to package.json: `npm run build:prod && cd dist && zip -r ../quiz-agent-chrome.zip .`
2. Add `package:firefox` script: `npm run build:firefox && cd dist && zip -r ../quiz-agent-firefox.xpi .`
3. Include in CI as artifacts.

**DONE WHEN**
- [ ] `npm run package` produces a valid .zip loadable in Chrome.
- [ ] `npm run package:firefox` produces a valid .xpi loadable in Firefox.

---

### Task 30 (B) +docs
blockedBy: [14, 16, 25]

**PURPOSE** — First thing users see; explains what the extension does and how to set it up.

**WHAT TO DO**
1. Create `README.md` with: project description, feature list, screenshot, installation guide (load from source or install from store), Ollama setup instructions, model recommendations, keyboard shortcuts, contributing guide.

**DONE WHEN**
- [ ] README renders correctly on GitHub.
- [ ] Installation instructions work on a clean Chrome + Ollama setup.

---

### Task 31 (B) +test
blockedBy: [10, 17, 23]

**PURPOSE** — Verifies the capture → LLM → overlay pipeline end-to-end with mocked LLM.

**WHAT TO DO**
1. Create `src/__tests__/integration.test.ts`.
2. Mock `chrome.tabs.captureVisibleTab` to return a test screenshot.
3. Mock Ollama API to return a known `QuizAnswer` JSON.
4. Verify that the orchestrator produces the correct answer from the mocked inputs.
5. Verify that errors in the LLM mock produce appropriate error handling.

**DONE WHEN**
- [ ] Integration test passes with mocked Chrome APIs and LLM.
- [ ] Error path test verifies error handling works.
