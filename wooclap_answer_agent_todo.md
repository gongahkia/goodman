# WooClap Answer Agent — PRD

> Browser extension that captures WooClap quiz content via screenshot or DOM scraping, routes to a configurable LLM backend (local/WebLLM/API), and auto-clicks or displays the answer.

---

## Scaffolding & Infrastructure

### Task 1 (A) +ext

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
     lib/
       types.ts
       constants.ts
       storage.ts
     assets/
       icon-16.png, icon-48.png, icon-128.png
   ```
2. `manifest.json`: Manifest V3, permissions: `activeTab`, `storage`, `scripting`, `tabs`, `notifications`. Content script matches `https://app.wooclap.com/*` and `https://www.wooclap.com/*`. Background service worker at `src/background/service-worker.ts`.
3. `src/lib/types.ts`: Define core TypeScript interfaces:
   - `QuestionType`: enum with values `MCQ`, `MULTI_SELECT`, `TRUE_FALSE`, `OPEN_ENDED`, `NUMERICAL`, `WORD_CLOUD`, `POLL`, `MATCHING`, `ORDERING`.
   - `CaptureMode`: `'screenshot' | 'dom' | 'auto'`.
   - `LLMProvider`: `'ollama' | 'webllm' | 'openai' | 'anthropic' | 'google' | 'custom'`.
   - `ExtensionConfig`: `{ captureMode: CaptureMode, llmProvider: LLMProvider, llmEndpoint: string, llmModel: string, llmApiKey: string, autoClick: boolean, pollingIntervalMs: number }`.
   - `CapturedQuestion`: `{ type: QuestionType, questionText: string, choices: string[], rawHTML?: string, screenshotBase64?: string, timestamp: number }`.
   - `LLMAnswer`: `{ answer: string, selectedIndices: number[], confidence: number, reasoning: string }`.
   - `LogEntry`: `{ question: CapturedQuestion, answer: LLMAnswer, autoClicked: boolean, timestamp: number }`.
4. `src/lib/constants.ts`: Default config values — `DEFAULT_POLLING_INTERVAL = 2000`, `DEFAULT_LLM_PROVIDER = 'ollama'`, `DEFAULT_LLM_ENDPOINT = 'http://localhost:11434'`, `DEFAULT_LLM_MODEL = 'llama3'`, `DEFAULT_CAPTURE_MODE = 'dom'`, `WOOCLAP_DOMAINS = ['app.wooclap.com', 'www.wooclap.com']`.
5. `src/lib/storage.ts`: Thin wrapper around `chrome.storage.local` — `getConfig(): Promise<ExtensionConfig>`, `setConfig(partial: Partial<ExtensionConfig>): Promise<void>`, `getSessionLog(): Promise<LogEntry[]>`, `appendLog(entry: LogEntry): Promise<void>`, `clearSessionLog(): Promise<void>`. Use defaults from `constants.ts` for missing keys.
6. Set up build tooling: `package.json` with `typescript`, `esbuild` (or `vite` with `@crxjs/vite-plugin`), scripts `dev` (watch build), `build` (production build), `clean`. `tsconfig.json` targeting `ES2022`, `moduleResolution: bundler`.

**DONE WHEN**
- [ ] `npm run build` produces a `dist/` folder with valid `manifest.json`, bundled JS for background, content, popup, and options.
- [ ] Extension loads in `chrome://extensions` with developer mode without errors.
- [ ] `chrome.storage.local` round-trip test: calling `setConfig({autoClick: true})` then `getConfig()` returns `autoClick: true` with all other fields populated from defaults.

---

### Task 2 (A) +ext

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
- [ ] Content script receives messages sent via `sendToTab` from background (verify via console log on a WooClap page).

---

## DOM Capture Pipeline

### Task 3 (A) +capture

**PURPOSE** — Extracts question data from WooClap's live DOM. This is the primary capture path for the MVP and feeds the LLM pipeline.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Export `scrapeQuestion(): CapturedQuestion | null`.
2. WooClap renders questions inside a container. The scraper must:
   - Search for the question text element. Try selectors in order: `[data-testid="question-title"]`, `.question-title`, `h1, h2, h3` within the main content area. Extract `innerText`.
   - Search for answer choices. Try selectors: `[data-testid="answer-choice"]`, `.answer-choice`, `label`, `button` elements within the choices container. Collect `innerText` for each into `choices[]` array.
   - Detect question type heuristically:
     - If exactly 2 choices and both match `/^(true|false|vrai|faux|yes|no)$/i` → `TRUE_FALSE`.
     - If choices have checkboxes (`input[type="checkbox"]`) → `MULTI_SELECT`.
     - If choices have radio buttons or are clickable single-select → `MCQ`.
   - Store `rawHTML` as the `outerHTML` of the question container for fallback parsing.
3. Return `null` if no question container found. Return populated `CapturedQuestion` with `timestamp: Date.now()` otherwise.
4. `src/content/dom-scraper.ts`: Export `getChoiceElements(): HTMLElement[]` — returns the actual clickable DOM elements for each choice, in the same order as `choices[]`. This is used later by the auto-clicker.

**DONE WHEN**
- [ ] On a WooClap MCQ page, `scrapeQuestion()` returns a `CapturedQuestion` with non-empty `questionText`, correct number of `choices`, and `type: 'MCQ'`.
- [ ] On a true/false question, `type` is correctly detected as `TRUE_FALSE`.
- [ ] `getChoiceElements()` returns clickable elements whose `innerText` matches the `choices[]` array in order.
- [ ] Returns `null` on a non-question WooClap page (e.g., waiting screen).

---

### Task 4 (A) +capture

**PURPOSE** — Provides DOM selector resilience. WooClap may change class names across deployments; this makes the scraper self-healing.

**WHAT TO DO**
1. `src/content/selector-engine.ts`: Export `findQuestionContainer(): HTMLElement | null`.
2. Implement a cascade strategy:
   - **Tier 1 — data attributes:** `[data-testid*="question"]`, `[data-cy*="question"]`.
   - **Tier 2 — class/ID heuristics:** Elements with class or ID containing `question`, `prompt`, `statement` (case-insensitive regex on `className` and `id`).
   - **Tier 3 — structural heuristic:** Find the largest `div` or `section` in the main content area that contains both a heading element and multiple sibling button/label elements (likely question + choices).
3. Export `findChoiceElements(container: HTMLElement): HTMLElement[]` — within the given container, find all interactive choice elements using a similar cascade: data-testid → class heuristics (`choice`, `answer`, `option`) → structural (buttons/labels that are siblings).
4. Refactor `dom-scraper.ts` (Task 3) to use `selector-engine.ts` instead of hardcoded selectors.

**DONE WHEN**
- [ ] `findQuestionContainer()` returns the correct container element on a WooClap MCQ page even if the primary `data-testid` selector is removed (simulated by the Tier 2/3 fallback logic).
- [ ] `findChoiceElements()` returns the correct choice elements within the found container.
- [ ] `scrapeQuestion()` still works correctly after the refactor.

---

### Task 5 (A) +capture

**PURPOSE** — Screenshot capture path for vision-capable LLMs. Required when DOM scraping fails or user prefers screenshot mode.

**WHAT TO DO**
1. `src/background/screenshot.ts`: Export `captureTab(tabId: number): Promise<string>` — calls `chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 })`, returns base64 data URL string.
2. `src/content/screenshot-capture.ts`: Export `requestScreenshot(): Promise<string>` — sends message `{ type: 'CAPTURE_SCREENSHOT' }` to background, receives base64 string back.
3. Add `CAPTURE_SCREENSHOT` and `SCREENSHOT_RESULT` message types to `messages.ts`.
4. In background service worker, handle `CAPTURE_SCREENSHOT`: call `captureTab` with sender's `tab.id`, respond with base64 string.
5. `src/content/screenshot-capture.ts`: Export `cropToQuestion(fullScreenshot: string, questionContainer: HTMLElement): Promise<string>` — uses an OffscreenCanvas to crop the screenshot to the bounding rect of `questionContainer` (obtained via `getBoundingClientRect()` + `window.devicePixelRatio` scaling). Returns cropped base64 PNG.

**DONE WHEN**
- [ ] `captureTab` returns a valid base64 PNG data URL when called from the background worker.
- [ ] `cropToQuestion` returns a cropped image that matches the bounding rect of the question container (verify dimensions match `getBoundingClientRect()` scaled by `devicePixelRatio`).
- [ ] End-to-end: content script calls `requestScreenshot()`, receives a base64 string, crops it, result is a valid PNG of the question area only.

---

### Task 6 (A) +capture

**PURPOSE** — Unified capture interface that selects DOM or screenshot based on user config and handles fallback.

**WHAT TO DO**
1. `src/content/capture-manager.ts`: Export `captureQuestion(mode: CaptureMode): Promise<CapturedQuestion | null>`.
2. Logic:
   - If `mode === 'dom'`: call `scrapeQuestion()`. If result is `null`, return `null`.
   - If `mode === 'screenshot'`: call `requestScreenshot()`, attempt `cropToQuestion` if `findQuestionContainer()` returns a container, otherwise use full screenshot. Return `CapturedQuestion` with `screenshotBase64` set, `questionText` and `choices` empty (LLM will extract from image).
   - If `mode === 'auto'`: try DOM first. If `scrapeQuestion()` returns non-null with non-empty `questionText`, use it. Otherwise fall back to screenshot path. If DOM succeeded, also attach screenshot as supplementary data (`screenshotBase64` field populated alongside text fields).
3. Always set `timestamp: Date.now()` on returned object.

**DONE WHEN**
- [ ] `captureQuestion('dom')` returns DOM-scraped data with no `screenshotBase64`.
- [ ] `captureQuestion('screenshot')` returns data with `screenshotBase64` populated and empty text fields.
- [ ] `captureQuestion('auto')` returns DOM data plus `screenshotBase64` when DOM succeeds; returns screenshot-only data when DOM fails.

---

## LLM Integration

### Task 7 (A) +llm

**PURPOSE** — Abstract LLM provider interface. All providers implement this contract so the rest of the system is provider-agnostic.

**WHAT TO DO**
1. `src/lib/llm/provider.ts`: Define interface:
   ```
   interface LLMProviderInterface {
     name: string;
     supportsVision: boolean;
     isAvailable(): Promise<boolean>;
     ask(question: CapturedQuestion, systemPrompt: string): Promise<LLMAnswer>;
   }
   ```
2. `src/lib/llm/prompt-builder.ts`: Export `buildPrompt(question: CapturedQuestion): string`.
   - For DOM-captured (has `questionText` + `choices`): Generate a prompt:
     ```
     You are answering a quiz question. Respond ONLY with valid JSON.
     Question: {questionText}
     Type: {type}
     Choices (0-indexed):
     0: {choice0}
     1: {choice1}
     ...
     Respond with: {"answer": "<text>", "selectedIndices": [<indices>], "confidence": <0-1>, "reasoning": "<brief>"}
     For MCQ: selectedIndices has exactly 1 element.
     For MULTI_SELECT: selectedIndices has 1+ elements.
     For TRUE_FALSE: selectedIndices has exactly 1 element (0 or 1).
     ```
   - For screenshot-only (no `questionText`): Prompt includes: "Look at this image of a quiz question. Identify the question, the choices, and the correct answer(s). Respond with the same JSON format."
3. `src/lib/llm/response-parser.ts`: Export `parseResponse(raw: string): LLMAnswer`.
   - Try `JSON.parse(raw)` first.
   - If that fails, try to extract JSON from markdown code blocks (regex: `` ```json?\s*([\s\S]*?)``` ``).
   - If that fails, try to find `{...}` substring and parse.
   - If all fail, return `{ answer: raw, selectedIndices: [], confidence: 0, reasoning: 'Failed to parse structured response' }`.

**DONE WHEN**
- [ ] `buildPrompt` with a DOM-captured MCQ question returns a string containing the question text, all choices with indices, and the JSON schema instruction.
- [ ] `parseResponse('{"answer":"B","selectedIndices":[1],"confidence":0.9,"reasoning":"..."}')` returns correct `LLMAnswer`.
- [ ] `parseResponse('Some text ```json\n{"answer":"A","selectedIndices":[0],"confidence":0.8,"reasoning":"x"}\n```')` extracts and parses the JSON.
- [ ] `parseResponse('garbage')` returns a fallback `LLMAnswer` with `confidence: 0`.

---

### Task 8 (A) +llm

**PURPOSE** — Ollama integration for local LLM inference. Primary local provider for privacy-conscious users.

**WHAT TO DO**
1. `src/lib/llm/providers/ollama.ts`: Implement `LLMProviderInterface`.
   - `name = 'ollama'`.
   - `supportsVision`: check dynamically — call `GET {endpoint}/api/tags`, parse model list, check if configured model name contains known vision model identifiers (`llava`, `bakllava`, `moondream`, `minicpm-v`). Cache result.
   - `isAvailable()`: `fetch(endpoint + '/api/tags')` with 3s timeout. Return `true` if 200.
   - `ask(question, systemPrompt)`: POST to `{endpoint}/api/chat` with body:
     ```
     { model, messages: [{role:'system', content: systemPrompt}, {role:'user', content: promptText, images?: [base64]}], stream: false }
     ```
     If question has `screenshotBase64` and `supportsVision`, include stripped base64 (remove `data:image/png;base64,` prefix) in `images` array.
   - Parse response: extract `message.content` from response JSON, pass to `parseResponse()`.
2. Constructor takes `endpoint: string` and `model: string` from config.

**DONE WHEN**
- [ ] With Ollama running locally, `isAvailable()` returns `true`.
- [ ] `ask()` with a DOM-captured MCQ question returns an `LLMAnswer` with populated `selectedIndices`.
- [ ] With Ollama stopped, `isAvailable()` returns `false` (does not throw).

---

### Task 9 (B) +llm

**PURPOSE** — WebLLM integration for fully in-browser local inference with no external server dependency.

**WHAT TO DO**
1. `src/lib/llm/providers/webllm.ts`: Implement `LLMProviderInterface`.
   - `name = 'webllm'`.
   - `supportsVision = false` (WebLLM vision support is limited; revisit later).
   - Use `@anthropic-ai/sdk` is NOT needed. Use `@mlc-ai/web-llm` npm package.
   - `isAvailable()`: Check if `navigator.gpu` exists (WebGPU required). Return `false` if not.
   - Maintain a module-level `engine: MLCEngine | null`. On first `ask()` call, initialize: `const engine = await CreateMLCEngine(model, { initProgressCallback })`. Store progress state for UI reporting.
   - `ask(question, systemPrompt)`: Call `engine.chat.completions.create({ messages: [{role:'system', content: systemPrompt}, {role:'user', content: promptText}], temperature: 0.1 })`. Extract `choices[0].message.content`, pass to `parseResponse()`.
2. Expose model download progress via a callback: `onProgress?: (progress: { text: string, progress: number }) => void`.
3. Export `disposeWebLLM(): Promise<void>` to clean up the engine when switching providers.

**DONE WHEN**
- [ ] In a browser with WebGPU support, `isAvailable()` returns `true`.
- [ ] In a browser without WebGPU, `isAvailable()` returns `false`.
- [ ] After engine initialization, `ask()` with a text-based MCQ question returns a valid `LLMAnswer`.
- [ ] `disposeWebLLM()` releases the engine without errors.

---

### Task 10 (A) +llm

**PURPOSE** — OpenAI API provider. Most widely used cloud LLM API, supports vision via GPT-4o.

**WHAT TO DO**
1. `src/lib/llm/providers/openai.ts`: Implement `LLMProviderInterface`.
   - `name = 'openai'`.
   - `supportsVision = true`.
   - `isAvailable()`: Return `true` if `apiKey` is non-empty string. No network check (avoid burning tokens).
   - `ask(question, systemPrompt)`: POST to `https://api.openai.com/v1/chat/completions`.
     - Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`.
     - Body: `{ model, messages: [{role:'system', content: systemPrompt}, userMessage], temperature: 0.1, response_format: { type: 'json_object' } }`.
     - `userMessage`: if `screenshotBase64` present, use multimodal format: `{ role: 'user', content: [{ type: 'text', text: promptText }, { type: 'image_url', url: screenshotBase64 }] }`. Otherwise plain text content.
   - Parse `choices[0].message.content` via `parseResponse()`.
   - On HTTP error, throw with status code and error message from response body.
2. Constructor: `(apiKey: string, model: string = 'gpt-4o', endpoint: string = 'https://api.openai.com/v1')`. Custom endpoint supports OpenAI-compatible APIs (e.g., local proxies, Azure).

**DONE WHEN**
- [ ] With a valid API key, `ask()` returns an `LLMAnswer` with non-empty `answer` and valid `selectedIndices` for an MCQ question.
- [ ] With an invalid API key, `ask()` throws an error containing `401`.
- [ ] Vision path: when `screenshotBase64` is provided, the request body contains the multimodal content format.

---

### Task 11 (B) +llm

**PURPOSE** — Anthropic API provider. Supports vision natively via Claude models.

**WHAT TO DO**
1. `src/lib/llm/providers/anthropic.ts`: Implement `LLMProviderInterface`.
   - `name = 'anthropic'`.
   - `supportsVision = true`.
   - `isAvailable()`: Return `true` if `apiKey` is non-empty.
   - `ask(question, systemPrompt)`: POST to `https://api.anthropic.com/v1/messages`.
     - Headers: `x-api-key: {apiKey}`, `anthropic-version: 2023-06-01`, `Content-Type: application/json`.
     - Body: `{ model, max_tokens: 1024, system: systemPrompt, messages: [{role:'user', content: contentArray}] }`.
     - `contentArray`: if screenshot present, include `{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64WithoutPrefix } }` followed by `{ type: 'text', text: promptText }`. Otherwise just text block.
   - Parse `content[0].text` via `parseResponse()`.
2. Constructor: `(apiKey: string, model: string = 'claude-sonnet-4-20250514')`.

**DONE WHEN**
- [ ] With valid API key, `ask()` returns a valid `LLMAnswer` for an MCQ question.
- [ ] Vision path sends correct multimodal content format per Anthropic API spec.
- [ ] Errors from API (401, 429) are thrown with descriptive messages.

---

### Task 12 (B) +llm

**PURPOSE** — Google Gemini API provider. Completes the major cloud LLM trifecta.

**WHAT TO DO**
1. `src/lib/llm/providers/google.ts`: Implement `LLMProviderInterface`.
   - `name = 'google'`.
   - `supportsVision = true`.
   - `isAvailable()`: Return `true` if `apiKey` is non-empty.
   - `ask(question, systemPrompt)`: POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`.
     - Body: `{ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ parts }] }`.
     - `parts`: `[{ text: promptText }]`. If screenshot present, prepend `{ inline_data: { mime_type: 'image/png', data: base64WithoutPrefix } }`.
   - Parse `candidates[0].content.parts[0].text` via `parseResponse()`.
2. Constructor: `(apiKey: string, model: string = 'gemini-2.0-flash')`.

**DONE WHEN**
- [ ] With valid API key, `ask()` returns a valid `LLMAnswer`.
- [ ] Screenshot is sent as `inline_data` when present.
- [ ] API errors propagate with status and message.

---

### Task 13 (B) +llm

**PURPOSE** — Custom/generic OpenAI-compatible provider. Supports any API that implements the OpenAI chat completions spec (LM Studio, text-generation-webui, vLLM, etc.).

**WHAT TO DO**
1. `src/lib/llm/providers/custom.ts`: Implement `LLMProviderInterface`.
   - Reuse OpenAI provider logic but with configurable `endpoint` base URL.
   - `name = 'custom'`.
   - `supportsVision`: default `false`, user-configurable via a `supportsVision` field in config.
   - `isAvailable()`: HEAD request to `{endpoint}/v1/models` with 3s timeout. Return `true` if any 2xx response.
   - `ask()`: Same as OpenAI provider, but omit `response_format` (not all compatible APIs support it). Rely on prompt-based JSON extraction.
2. Constructor: `(endpoint: string, model: string, apiKey?: string, vision?: boolean)`.

**DONE WHEN**
- [ ] With a running OpenAI-compatible server (e.g., LM Studio), `isAvailable()` returns `true`.
- [ ] `ask()` returns a valid `LLMAnswer` from the custom endpoint.
- [ ] Works without an API key when the server doesn't require one.

---

### Task 14 (A) +llm

**PURPOSE** — Provider factory and router. Single entry point to get the correct LLM provider instance based on user config.

**WHAT TO DO**
1. `src/lib/llm/provider-factory.ts`: Export `getProvider(config: ExtensionConfig): LLMProviderInterface`.
   - Switch on `config.llmProvider`:
     - `'ollama'` → `new OllamaProvider(config.llmEndpoint, config.llmModel)`
     - `'webllm'` → `new WebLLMProvider(config.llmModel)`
     - `'openai'` → `new OpenAIProvider(config.llmApiKey, config.llmModel, config.llmEndpoint)`
     - `'anthropic'` → `new AnthropicProvider(config.llmApiKey, config.llmModel)`
     - `'google'` → `new GoogleProvider(config.llmApiKey, config.llmModel)`
     - `'custom'` → `new CustomProvider(config.llmEndpoint, config.llmModel, config.llmApiKey)`
2. Export `checkProviderHealth(config: ExtensionConfig): Promise<{ available: boolean, error?: string }>` — instantiate provider, call `isAvailable()`, catch errors, return status object.
3. Cache provider instances by a key derived from `(provider, endpoint, model)`. Invalidate cache when config changes (listen for `CONFIG_UPDATED` message in background).

**DONE WHEN**
- [ ] `getProvider` returns correct provider type for each `llmProvider` value.
- [ ] `checkProviderHealth` returns `{ available: true }` for a running Ollama and `{ available: false, error: '...' }` for an unreachable endpoint.
- [ ] Calling `getProvider` twice with same config returns the same cached instance.
- [ ] Calling `getProvider` after config change returns a new instance.

---

## Question Detection & Orchestration

### Task 15 (A) +detect

**PURPOSE** — Detects new questions appearing on the WooClap page using MutationObserver. Primary trigger mechanism for the capture→LLM→answer pipeline.

**WHAT TO DO**
1. `src/content/question-detector.ts`: Export class `QuestionDetector`.
   - `constructor(onDetected: (question: CapturedQuestion) => void)`.
   - `start()`: Create a `MutationObserver` on `document.body` with `{ childList: true, subtree: true }`.
   - On mutation callback: call `findQuestionContainer()`. If a container is found and its `innerText` hash (simple string hash or just the text itself) differs from `lastQuestionHash`, trigger a debounced capture (300ms debounce to let DOM settle). Call `scrapeQuestion()`, if non-null and different from last, invoke `onDetected(question)`.
   - Track `lastQuestionHash: string` to avoid duplicate triggers.
   - `stop()`: Disconnect the observer.
2. `src/content/question-detector.ts`: Export `startPolling(onDetected, intervalMs)` as fallback. Uses `setInterval` with the same detection logic. Returns a `stop()` function.

**DONE WHEN**
- [ ] When a new WooClap question loads (DOM change), `onDetected` fires exactly once with the new question.
- [ ] Rapid DOM mutations (e.g., animation frames) do not cause multiple triggers for the same question (debounce works).
- [ ] When the same question remains on screen, `onDetected` does not re-fire.
- [ ] `startPolling` detects new questions at the configured interval.

---

### Task 16 (A) +core

**PURPOSE** — Main orchestrator in the content script that wires detection → capture → message to background → receive answer → display/click. This is the central nervous system.

**WHAT TO DO**
1. `src/content/orchestrator.ts`: Export class `Orchestrator`.
   - `constructor()`: Load config from storage. Initialize `QuestionDetector` with `this.handleNewQuestion` as callback.
   - `start()`: Start the detector. If config has polling enabled (or as fallback), also start polling.
   - `handleNewQuestion(question: CapturedQuestion)`:
     1. Call `captureQuestion(config.captureMode)` to get full capture (may add screenshot).
     2. Send `REQUEST_ANSWER` message to background with the captured question.
     3. Listen for `ANSWER_READY` response.
     4. If `config.autoClick` → call auto-clicker (Task 18). Send `AUTO_CLICK_RESULT` to background.
     5. Always send `ANSWER_READY` to popup for display.
   - `stop()`: Stop detector and polling.
2. `src/content/index.ts`: On load, instantiate `Orchestrator` and call `start()`. Listen for `CONFIG_UPDATED` messages to restart with new config.

**DONE WHEN**
- [ ] When a new question appears on WooClap, the full pipeline fires: detection → capture → message sent to background.
- [ ] When background responds with `ANSWER_READY`, the popup receives the answer (verify via message logging).
- [ ] Config changes (e.g., switching capture mode) take effect without page reload.

---

### Task 17 (A) +core

**PURPOSE** — Background service worker orchestration: receives captured questions from content, routes to LLM, returns answers, manages logging.

**WHAT TO DO**
1. `src/background/service-worker.ts`: Refactor the message handler.
   - On `REQUEST_ANSWER`:
     1. Load config.
     2. Get provider via `getProvider(config)`.
     3. Build prompt via `buildPrompt(question)`.
     4. Call `provider.ask(question, systemPrompt)`.
     5. Send `ANSWER_READY` response with the `LLMAnswer`.
     6. Append to session log via `appendLog({ question, answer, autoClicked: false, timestamp: Date.now() })`.
   - On `AUTO_CLICK_RESULT`: Update the most recent log entry's `autoClicked` field.
   - On `GET_STATUS`: Return current state (active, last question, last answer).
   - On `CONFIG_UPDATED`: Invalidate provider cache. Broadcast to all WooClap tabs.
   - On `CAPTURE_SCREENSHOT`: Handle via `captureTab`.
2. Wrap LLM call in try/catch. On error, return `LLMAnswer` with `answer: 'Error: {message}'`, `confidence: 0`, empty `selectedIndices`.

**DONE WHEN**
- [ ] Receiving `REQUEST_ANSWER` with a valid `CapturedQuestion` triggers LLM call and returns `ANSWER_READY` with populated `LLMAnswer`.
- [ ] LLM errors are caught and returned as error `LLMAnswer` (no unhandled promise rejections in background).
- [ ] Session log is appended on each question/answer cycle.
- [ ] `GET_STATUS` returns the most recent question and answer.

---

## Auto-Click

### Task 18 (A) +autoclick

**PURPOSE** — Programmatically clicks the correct answer choices on the WooClap page based on LLM response.

**WHAT TO DO**
1. `src/content/auto-clicker.ts`: Export `autoClick(answer: LLMAnswer, question: CapturedQuestion): Promise<{ success: boolean, error?: string }>`.
2. Logic:
   - Get choice elements via `getChoiceElements()`.
   - Validate: if `answer.selectedIndices` is empty or any index is out of bounds for the choices array, return `{ success: false, error: 'Invalid selection indices' }`.
   - For each index in `answer.selectedIndices`:
     - Get the element at that index.
     - Dispatch a realistic click sequence: `mousedown` → `mouseup` → `click` events (using `new MouseEvent` with `bubbles: true, cancelable: true`).
     - Add a small random delay between clicks (50-150ms) for multi-select.
   - After clicking, wait 200ms and verify: check if the clicked elements now have an "active"/"selected" visual state (check for classes containing `selected`, `active`, `checked`, or `aria-checked="true"`).
   - Return `{ success: true }` if at least one verification passes.
3. If `question.type === 'TRUE_FALSE'` or `'MCQ'`, assert exactly one index. If `'MULTI_SELECT'`, allow multiple.

**DONE WHEN**
- [ ] For an MCQ with `selectedIndices: [2]`, the third choice element receives click events.
- [ ] For a multi-select with `selectedIndices: [0, 2]`, both elements are clicked with a delay between them.
- [ ] Out-of-bounds indices return `{ success: false }` without throwing.
- [ ] Click events include proper `MouseEvent` properties (`bubbles`, `cancelable`).

---

### Task 19 (B) +autoclick

**PURPOSE** — Submit button handling. Some WooClap question types require clicking a submit/confirm button after selecting answers.

**WHAT TO DO**
1. `src/content/auto-clicker.ts`: Export `clickSubmit(): Promise<boolean>`.
2. Search for submit button using selector cascade:
   - `[data-testid="submit-answer"]`, `[data-testid="validate"]`
   - `button` elements whose `innerText` matches `/^(submit|send|validate|confirmer|envoyer)/i`
   - `button[type="submit"]` within the question container
3. If found, click it with the same `MouseEvent` sequence. Wait 300ms. Return `true`.
4. If not found, return `false` (some question types auto-submit on selection).
5. In `autoClick()`, call `clickSubmit()` after the answer selection phase. Log whether submit was found and clicked.

**DONE WHEN**
- [ ] On a WooClap page with a visible submit button, `clickSubmit()` finds and clicks it, returns `true`.
- [ ] On a page without a submit button, returns `false` without error.
- [ ] After `autoClick()` selects answers, `clickSubmit()` is called automatically.

---

## Popup UI

### Task 20 (A) +ui

**PURPOSE** — Main popup interface showing current status, last answer, and mode toggle. Primary user interaction surface.

**WHAT TO DO**
1. `src/popup/popup.html`: Structure:
   ```
   <div id="app">
     <header>
       <h1>WooClap Agent</h1>
       <span id="status-indicator"></span>
     </header>
     <section id="answer-panel">
       <div id="question-text"></div>
       <div id="answer-text"></div>
       <div id="confidence-bar"></div>
       <div id="reasoning"></div>
     </section>
     <section id="controls">
       <label>Mode: <select id="capture-mode">
         <option value="dom">DOM</option>
         <option value="screenshot">Screenshot</option>
         <option value="auto">Auto</option>
       </select></label>
       <label><input type="checkbox" id="auto-click-toggle"> Auto-click</label>
     </section>
     <footer>
       <button id="settings-btn">Settings</button>
       <button id="logs-btn">View Logs</button>
     </footer>
   </div>
   ```
2. `src/popup/popup.css`: Minimal dark theme. Width: 360px. Colors: `#1a1a2e` background, `#e0e0e0` text, `#00d4aa` accent for confidence/active states. Font: system monospace. Compact layout with 8px padding.
3. `src/popup/popup.ts`:
   - On open: send `GET_STATUS` to background. Populate `#question-text`, `#answer-text`, `#confidence-bar` (width = confidence%), `#reasoning` from response.
   - `#status-indicator`: green dot if on a WooClap page and provider is available, yellow if provider unavailable, grey if not on WooClap.
   - Bind `#capture-mode` change and `#auto-click-toggle` to `setConfig()` + send `CONFIG_UPDATED`.
   - Listen for `ANSWER_READY` messages to update the panel in real-time without reopening popup.

**DONE WHEN**
- [ ] Popup opens showing current status (green/yellow/grey indicator).
- [ ] When an answer is received, question text, answer, confidence bar, and reasoning are displayed.
- [ ] Changing capture mode dropdown updates stored config and sends `CONFIG_UPDATED`.
- [ ] Auto-click checkbox toggles the config value.

---

### Task 21 (B) +ui

**PURPOSE** — Options page for LLM provider configuration. Users need a dedicated UI to enter API keys, select models, and test connections.

**WHAT TO DO**
1. `src/options/options.html`: Structure:
   ```
   <div id="options-app">
     <h1>WooClap Agent Settings</h1>
     <section id="provider-section">
       <label>LLM Provider: <select id="llm-provider">
         <option value="ollama">Ollama (Local)</option>
         <option value="webllm">WebLLM (In-Browser)</option>
         <option value="openai">OpenAI</option>
         <option value="anthropic">Anthropic</option>
         <option value="google">Google Gemini</option>
         <option value="custom">Custom (OpenAI-compatible)</option>
       </select></label>
       <div id="provider-fields"></div>
       <button id="test-connection">Test Connection</button>
       <span id="test-result"></span>
     </section>
     <section id="behavior-section">
       <label>Polling Interval (ms): <input type="number" id="polling-interval" min="500" max="10000" step="500"></label>
       <label>Capture Mode: <select id="capture-mode-opt">...</select></label>
       <label><input type="checkbox" id="auto-click-opt"> Auto-click answers</label>
     </section>
     <button id="save-btn">Save</button>
   </div>
   ```
2. `src/options/options.ts`:
   - On provider select change, dynamically show/hide relevant fields:
     - `ollama`: endpoint (text input), model (text input).
     - `webllm`: model (dropdown of supported models: `Llama-3.1-8B-Instruct-q4f32_1-MLC`, `Phi-3.5-mini-instruct-q4f16_1-MLC`, etc.).
     - `openai`: API key (password input), model (text input, default `gpt-4o`), custom endpoint (text, optional).
     - `anthropic`: API key (password input), model (text, default `claude-sonnet-4-20250514`).
     - `google`: API key (password input), model (text, default `gemini-2.0-flash`).
     - `custom`: endpoint (text), model (text), API key (text, optional), supports vision (checkbox).
   - `#test-connection`: call `checkProviderHealth` via message to background. Show green "Connected" or red error.
   - `#save-btn`: validate inputs, call `setConfig()`, send `CONFIG_UPDATED`, show "Saved" toast.
3. `src/options/options.css`: Same dark theme as popup. Max-width 600px, centered.

**DONE WHEN**
- [ ] Selecting each provider shows the correct input fields.
- [ ] "Test Connection" shows "Connected" for a reachable Ollama instance.
- [ ] Saving persists all values to `chrome.storage.local` and sends `CONFIG_UPDATED`.
- [ ] Reopening the options page loads previously saved values.

---

### Task 22 (B) +ui

**PURPOSE** — Session log viewer in popup. Users can review all Q&A pairs from the current session.

**WHAT TO DO**
1. `src/popup/log-viewer.ts`: Export `renderLogPanel(container: HTMLElement): void`.
   - Call `getSessionLog()` to retrieve all `LogEntry` items.
   - For each entry, render:
     ```
     <div class="log-entry">
       <div class="log-time">{HH:MM:SS}</div>
       <div class="log-question">{questionText (truncated to 80 chars)}</div>
       <div class="log-answer">{answer}</div>
       <div class="log-meta">Confidence: {confidence}% | Auto-clicked: {yes/no}</div>
     </div>
     ```
   - Newest entries on top.
   - Add "Clear Log" button at bottom → calls `clearSessionLog()` and re-renders.
   - Add "Export Log" button → generates JSON file and triggers download via `URL.createObjectURL` + temporary `<a>` element.
2. `src/popup/popup.ts`: `#logs-btn` click toggles between answer panel and log panel.

**DONE WHEN**
- [ ] After 3 question/answer cycles, log viewer shows 3 entries in reverse chronological order.
- [ ] "Clear Log" empties the log and re-renders an empty state.
- [ ] "Export Log" downloads a `.json` file containing the `LogEntry[]` array.
- [ ] Toggling between answer panel and log panel works without losing state.

---

## Extended Question Types (Post-MVP)

### Task 23 (B) +capture

**PURPOSE** — Open-ended (free text) question support. Extends capture and answer pipeline beyond selection-based questions.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Extend `scrapeQuestion()` type detection:
   - If the question container contains a `textarea` or `input[type="text"]` and no radio/checkbox choice elements → `OPEN_ENDED`.
   - Set `choices: []` for open-ended.
2. `src/lib/llm/prompt-builder.ts`: Extend `buildPrompt` for `OPEN_ENDED`:
   ```
   Question: {questionText}
   Type: OPEN_ENDED (free text response)
   Respond with: {"answer": "<your answer text>", "selectedIndices": [], "confidence": <0-1>, "reasoning": "<brief>"}
   Keep the answer concise (1-3 sentences max).
   ```
3. `src/content/auto-clicker.ts`: Extend `autoClick` for `OPEN_ENDED`:
   - Find the `textarea` or `input[type="text"]` in the question container.
   - Focus the element.
   - Set its value via `element.value = answer.answer`.
   - Dispatch `input` and `change` events to trigger any framework reactivity (React, Vue, etc.).
   - Call `clickSubmit()`.

**DONE WHEN**
- [ ] `scrapeQuestion()` on an open-ended WooClap question returns `type: 'OPEN_ENDED'` with empty `choices`.
- [ ] LLM receives correct prompt format and returns a text answer.
- [ ] `autoClick` types the answer into the text input and triggers submit.
- [ ] Framework event listeners are triggered (dispatching `input` event with `bubbles: true`).

---

### Task 24 (B) +capture

**PURPOSE** — Numerical question support. WooClap has dedicated numerical answer inputs.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Extend type detection:
   - If question container has `input[type="number"]` or an input with `pattern="[0-9]*"` → `NUMERICAL`.
   - Set `choices: []`.
2. `src/lib/llm/prompt-builder.ts`: For `NUMERICAL`:
   ```
   Question: {questionText}
   Type: NUMERICAL (respond with a number)
   Respond with: {"answer": "<number>", "selectedIndices": [], "confidence": <0-1>, "reasoning": "<brief>"}
   The answer MUST be a valid number (integer or decimal).
   ```
3. `src/content/auto-clicker.ts`: For `NUMERICAL`:
   - Find the number input.
   - Set `element.value = answer.answer`.
   - Dispatch `input` + `change` events.
   - Call `clickSubmit()`.
4. `src/lib/llm/response-parser.ts`: For numerical answers, validate that `answer` is parseable as a number. If not, set `confidence: 0`.

**DONE WHEN**
- [ ] Numerical WooClap questions are detected as `NUMERICAL`.
- [ ] LLM returns a numeric answer string.
- [ ] Auto-clicker enters the number into the input field.
- [ ] Non-numeric LLM responses get `confidence: 0`.

---

### Task 25 (C) +capture

**PURPOSE** — Word cloud question support. WooClap word clouds accept single word or short phrase inputs.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Detect word cloud — typically a text input with a short maxlength or specific container styling. If container has word cloud indicators (class/data-attr containing `wordcloud`, `word-cloud`, `nuage`) → `WORD_CLOUD`. Set `choices: []`.
2. `src/lib/llm/prompt-builder.ts`: For `WORD_CLOUD`:
   ```
   Question: {questionText}
   Type: WORD_CLOUD (respond with 1-3 words)
   Respond with: {"answer": "<1-3 words>", "selectedIndices": [], "confidence": <0-1>, "reasoning": "<brief>"}
   ```
3. Auto-clicker: Same as open-ended — find text input, set value, dispatch events, submit.

**DONE WHEN**
- [ ] Word cloud questions detected as `WORD_CLOUD`.
- [ ] LLM returns a short answer (1-3 words).
- [ ] Answer is entered and submitted.

---

### Task 26 (C) +capture

**PURPOSE** — Poll question support. Polls are structurally similar to MCQ but semantically different (no "correct" answer).

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Detect polls — look for indicators: container class/data-attr containing `poll`, `sondage`, `survey`. If detected → `POLL`. Choices are captured as usual.
2. `src/lib/llm/prompt-builder.ts`: For `POLL`:
   ```
   Question: {questionText}
   Type: POLL (opinion-based, no objectively correct answer)
   Choices: {choices}
   Pick the most reasonable/popular answer.
   Respond with: {"answer": "<text>", "selectedIndices": [<index>], "confidence": <0-1>, "reasoning": "<brief>"}
   ```
3. Auto-clicker: Same as MCQ — click the selected choice.

**DONE WHEN**
- [ ] Poll questions detected as `POLL`.
- [ ] LLM picks a reasonable choice.
- [ ] Auto-click works same as MCQ.

---

### Task 27 (C) +capture

**PURPOSE** — Matching question support. WooClap matching questions ask users to pair items from two columns.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Detect matching — look for two-column layout, drag-drop zones, or data attributes with `matching`, `association`. Type → `MATCHING`. Capture left column items as `questionText` (or structured in `rawHTML`), right column items as `choices`.
2. `src/lib/llm/prompt-builder.ts`: For `MATCHING`:
   ```
   Question: {questionText}
   Type: MATCHING (pair items from left to right)
   Left items: {leftItems}
   Right items: {rightItems}
   Respond with: {"answer": "<description>", "selectedIndices": [<rightIndex for each leftItem in order>], "confidence": <0-1>, "reasoning": "<brief>"}
   Example: selectedIndices [2,0,1] means left[0]→right[2], left[1]→right[0], left[2]→right[1]
   ```
3. Auto-click for matching is complex (drag-drop or click-to-pair). **For MVP, skip auto-click for matching** — display the answer only.

**DONE WHEN**
- [ ] Matching questions detected with both columns captured.
- [ ] LLM returns paired indices.
- [ ] Answer displayed in popup (auto-click skipped with message "Auto-click not supported for matching").

---

### Task 28 (C) +capture

**PURPOSE** — Ordering/ranking question support. Users must arrange items in correct sequence.

**WHAT TO DO**
1. `src/content/dom-scraper.ts`: Detect ordering — look for sortable lists, drag handles, data attributes with `ordering`, `ranking`, `sort`. Type → `ORDERING`. Items captured in their current (shuffled) order as `choices`.
2. `src/lib/llm/prompt-builder.ts`: For `ORDERING`:
   ```
   Question: {questionText}
   Type: ORDERING (arrange in correct order)
   Items (current order): {choices}
   Respond with: {"answer": "<description of correct order>", "selectedIndices": [<correct order as indices of current positions>], "confidence": <0-1>, "reasoning": "<brief>"}
   Example: if items are ["C","A","B"] and correct order is A,B,C, respond with selectedIndices [1,2,0]
   ```
3. Auto-click: **Skip auto-click for ordering** (requires drag-drop simulation). Display only.

**DONE WHEN**
- [ ] Ordering questions detected with items in current order.
- [ ] LLM returns correct ordering as index permutation.
- [ ] Answer displayed in popup with clear ordering description.

---

## Error Handling & Resilience

### Task 29 (A) +core

**PURPOSE** — Graceful error handling throughout the pipeline. Prevents silent failures and gives users actionable feedback.

**WHAT TO DO**
1. `src/lib/error-handler.ts`: Export:
   - `enum ErrorCode { CAPTURE_FAILED, LLM_UNAVAILABLE, LLM_ERROR, LLM_TIMEOUT, PARSE_FAILED, AUTOCLICK_FAILED, STORAGE_ERROR }`.
   - `class AgentError extends Error { code: ErrorCode; userMessage: string; }`.
   - `handleError(error: unknown): AgentError` — normalizes any thrown value into `AgentError`.
2. `src/content/orchestrator.ts`: Wrap `handleNewQuestion` in try/catch. On error:
   - Send `{ type: 'ERROR', payload: { code, userMessage } }` to popup.
   - Log to console with full stack trace.
   - Do not crash the detector — continue listening for next question.
3. `src/background/service-worker.ts`: Wrap LLM call with timeout — if no response in 30s, reject with `LLM_TIMEOUT`. Configurable via `llmTimeoutMs` in config (add to `ExtensionConfig`, default 30000).
4. Add `ERROR` message type to `messages.ts`.
5. `src/popup/popup.ts`: On `ERROR` message, display red banner with `userMessage` that auto-dismisses after 5s.

**DONE WHEN**
- [ ] LLM timeout after 30s triggers `LLM_TIMEOUT` error shown in popup.
- [ ] Capture failure (no question on page) shows `CAPTURE_FAILED` in popup.
- [ ] After an error, the detector continues to monitor for new questions (no crash).
- [ ] Errors include both developer-facing (code + stack) and user-facing (message) info.

---

### Task 30 (B) +core

**PURPOSE** — Retry logic for transient LLM failures. Network blips shouldn't require manual intervention.

**WHAT TO DO**
1. `src/lib/llm/retry.ts`: Export `withRetry<T>(fn: () => Promise<T>, options: { maxRetries: number, baseDelayMs: number, backoffMultiplier: number }): Promise<T>`.
   - On failure, retry up to `maxRetries` times with exponential backoff: `delay = baseDelayMs * (backoffMultiplier ^ attempt)`.
   - Only retry on network errors and 5xx status codes. Do NOT retry on 401, 403, 429 (rate limit — respect it).
   - Return the first successful result.
   - On final failure, throw the last error.
2. `src/background/service-worker.ts`: Wrap the `provider.ask()` call with `withRetry({ maxRetries: 2, baseDelayMs: 1000, backoffMultiplier: 2 })`.

**DONE WHEN**
- [ ] A transient network error on first attempt succeeds on retry (verify with mock/spy).
- [ ] 401 errors are NOT retried — fail immediately.
- [ ] After `maxRetries` exhausted, the original error propagates.
- [ ] Backoff delays are correct: 1000ms first retry, 2000ms second retry.

---

## Logging

### Task 31 (A) +log

**PURPOSE** — Session-scoped answer logging. Persists Q&A history for the current browser session for user review and export.

**WHAT TO DO**
1. `src/lib/storage.ts`: Ensure `getSessionLog`, `appendLog`, `clearSessionLog` use key `'session_log'` in `chrome.storage.local`.
2. `src/background/service-worker.ts`: On extension startup (service worker activation), clear the session log (`clearSessionLog()`). This ensures logs are per-session (ephemeral across browser restarts).
3. `appendLog` in the background worker: called after every successful `ANSWER_READY` response. Include full `CapturedQuestion` (minus `screenshotBase64` to save storage — set to empty string) and `LLMAnswer`.
4. `src/lib/storage.ts`: Add `exportSessionLog(): Promise<string>` — returns pretty-printed JSON of `LogEntry[]`.
5. Enforce max log size: if `session_log` array exceeds 500 entries, trim oldest entries to keep 500.

**DONE WHEN**
- [ ] After answering 3 questions, `getSessionLog()` returns 3 `LogEntry` items.
- [ ] `screenshotBase64` is empty string in stored entries (storage optimization).
- [ ] On browser restart, session log is empty.
- [ ] `exportSessionLog()` returns valid JSON string.
- [ ] 501st entry causes the oldest entry to be removed (array stays at 500).

---

## Security & Privacy

### Task 32 (A) +security

**PURPOSE** — API key security. Keys must never leak to content scripts or be exposed in the DOM.

**WHAT TO DO**
1. All LLM API calls must happen exclusively in the background service worker (never in content script or popup). Verify no `fetch` calls to LLM endpoints exist outside `src/background/` and `src/lib/llm/providers/`.
2. `src/lib/storage.ts`: API keys stored in `chrome.storage.local` (not `sync` — avoid cloud sync of secrets). Add `getConfig` masking: export `getMaskedConfig(): Promise<ExtensionConfig>` that returns config with `llmApiKey` showing only last 4 chars (e.g., `****abcd`). Popup and options page should use masked version for display.
3. Content Security Policy in `manifest.json`: `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'none'" }`.
4. `src/options/options.ts`: API key input field uses `type="password"`. On save, only send the key to storage if it's not a masked value (user didn't change it).

**DONE WHEN**
- [ ] No LLM API fetch calls exist in content script code.
- [ ] `getMaskedConfig()` returns `****abcd` for a key `sk-proj-1234abcd`.
- [ ] API key input in options is a password field.
- [ ] CSP header is set in manifest.

---

### Task 33 (B) +security

**PURPOSE** — Request timing randomization to reduce detection fingerprint from automated clicking patterns.

**WHAT TO DO**
1. `src/lib/timing.ts`: Export `randomDelay(minMs: number, maxMs: number): Promise<void>` — resolves after a random duration in `[min, max]` using `crypto.getRandomValues` for randomness.
2. `src/content/auto-clicker.ts`: Before clicking, add `await randomDelay(500, 2000)`. Between multi-select clicks, use `await randomDelay(100, 400)`. Before submit, use `await randomDelay(300, 800)`.
3. `src/content/orchestrator.ts`: After receiving answer and before auto-click, add `await randomDelay(1000, 3000)` to simulate "thinking time."

**DONE WHEN**
- [ ] `randomDelay(100, 200)` resolves between 100-200ms (verify with timing measurement).
- [ ] Auto-click sequence has variable delays between actions.
- [ ] Total time from question detection to answer submission is at least 1.5s (minimum sum of delays).

---

## Build & Dev Tooling

### Task 34 (A) +build

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
- [ ] Extension auto-reloads in Chrome after rebuild (verify via console log timestamp).
- [ ] `npm run build:prod` outputs minified bundle without dev-reload code.
- [ ] `dist/` is in `.gitignore`.

---

### Task 35 (B) +build

**PURPOSE** — Linting and type checking for code quality. Catches bugs before they reach the browser.

**WHAT TO DO**
1. `package.json`: Add `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`.
2. `eslint.config.js` (flat config): TypeScript rules, no-unused-vars as error, no-explicit-any as warn. Browser globals enabled.
3. `package.json` scripts: `lint` → `eslint src/`, `typecheck` → `tsc --noEmit`.
4. `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `types: ["chrome"]`. Install `@anthropic-ai/sdk` is NOT needed but `@types/chrome` IS.

**DONE WHEN**
- [ ] `npm run lint` passes with no errors on the codebase.
- [ ] `npm run typecheck` passes with no TypeScript errors.
- [ ] Introducing `let x: any` triggers a lint warning.

---

### Task 36 (C) +build

**PURPOSE** — Automated testing setup for critical paths (LLM response parsing, DOM scraping logic).

**WHAT TO DO**
1. `package.json`: Add `vitest` as test runner.
2. `vitest.config.ts`: Configure with `environment: 'jsdom'` for DOM tests.
3. `src/lib/llm/__tests__/response-parser.test.ts`: Tests for `parseResponse`:
   - Valid JSON input → correct `LLMAnswer`.
   - JSON in markdown code block → extracted and parsed.
   - Raw `{...}` in text → extracted and parsed.
   - Garbage input → fallback with `confidence: 0`.
4. `src/lib/llm/__tests__/prompt-builder.test.ts`: Tests for `buildPrompt`:
   - MCQ question → prompt includes choices with indices.
   - Screenshot-only → prompt includes image instruction.
   - Open-ended → prompt includes free-text instruction.
5. `package.json` scripts: `test` → `vitest run`, `test:watch` → `vitest`.

**DONE WHEN**
- [ ] `npm test` runs all test files and passes.
- [ ] `response-parser` tests cover all 4 parsing strategies.
- [ ] `prompt-builder` tests verify prompt content for each question type.

---

## Final Integration

### Task 37 (A) +core

**PURPOSE** — End-to-end integration wiring. Ensures all modules are correctly imported and the full pipeline works when the extension loads.

**WHAT TO DO**
1. `src/content/index.ts`: Final wiring:
   - Import and instantiate `Orchestrator`.
   - Call `orchestrator.start()`.
   - Listen for `CONFIG_UPDATED` → `orchestrator.stop()` then `orchestrator.start()` with new config.
   - Listen for `ANSWER_READY` from background → if auto-click disabled, no action (popup handles display).
2. `src/background/service-worker.ts`: Final wiring:
   - Import all providers, factory, retry, storage, error handler.
   - Register all message handlers.
   - On install/activate: `clearSessionLog()`.
3. `src/popup/popup.ts`: Final wiring:
   - Import log-viewer, storage.
   - Initialize UI state from background status.
   - Real-time updates via message listener.
4. Verify the full flow manually:
   - Load extension → navigate to WooClap MCQ → answer appears in popup → auto-click works.

**DONE WHEN**
- [ ] Extension loads without console errors.
- [ ] On a WooClap MCQ page with Ollama running: question detected → answer appears in popup within 10s → if auto-click enabled, correct choice is selected.
- [ ] Switching providers in options takes effect on next question without page reload.
- [ ] Session log contains the Q&A entry after the cycle.
- [ ] Errors (e.g., Ollama down) display in popup with actionable message.

---

### Task 38 (B) +ui

**PURPOSE** — Keyboard shortcut for manual trigger. Backup for when MutationObserver misses a question change.

**WHAT TO DO**
1. `manifest.json`: Add `commands` section:
   ```
   "commands": {
     "trigger-capture": {
       "suggested_key": { "default": "Alt+W" },
       "description": "Manually trigger question capture"
     }
   }
   ```
2. `src/background/service-worker.ts`: Listen for `chrome.commands.onCommand`. On `'trigger-capture'`:
   - Get active tab.
   - Send `{ type: 'MANUAL_TRIGGER' }` to the tab's content script.
3. Add `MANUAL_TRIGGER` to message types.
4. `src/content/orchestrator.ts`: On `MANUAL_TRIGGER`, immediately run `handleNewQuestion` regardless of whether the detector has fired.

**DONE WHEN**
- [ ] Pressing `Alt+W` on a WooClap page triggers the capture→LLM→answer pipeline.
- [ ] Works even if MutationObserver hasn't detected a change.
- [ ] Shortcut is visible in `chrome://extensions/shortcuts`.

---

### Task 39 (C) +ui

**PURPOSE** — Badge indicator on extension icon. Quick visual feedback without opening popup.

**WHAT TO DO**
1. `src/background/service-worker.ts`: After receiving `ANSWER_READY`:
   - Set badge text to the confidence percentage: `chrome.action.setBadgeText({ text: Math.round(answer.confidence * 100) + '%' })`.
   - Set badge color: green (`#00d4aa`) if confidence > 0.7, yellow (`#f0c040`) if 0.4-0.7, red (`#e04040`) if < 0.4. Use `chrome.action.setBadgeBackgroundColor`.
2. On `ERROR` message: set badge text to `'!'`, color red.
3. When not on WooClap page: clear badge. Listen for `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` to detect tab changes.

**DONE WHEN**
- [ ] After answering a question with 90% confidence, badge shows "90%" in green.
- [ ] After an error, badge shows "!" in red.
- [ ] Navigating away from WooClap clears the badge.

---

### Task 40 (C) +ext

**PURPOSE** — Firefox compatibility via WebExtension polyfill. Extends reach beyond Chrome.

**WHAT TO DO**
1. `package.json`: Add `webextension-polyfill` dependency.
2. Import `browser` from `webextension-polyfill` as a wrapper in a new `src/lib/browser-api.ts`. Export it. Replace all direct `chrome.*` calls across the codebase with imports from `browser-api.ts`.
3. Create `manifest.firefox.json`: Copy `manifest.json` but adjust for Firefox:
   - Remove `"background": { "service_worker": ... }`, replace with `"background": { "scripts": ["background.js"] }`.
   - Add `"browser_specific_settings": { "gecko": { "id": "wooclap-agent@extension" } }`.
4. `package.json`: Add `build:firefox` script that copies `manifest.firefox.json` to `dist/manifest.json` after build.

**DONE WHEN**
- [ ] `npm run build:firefox` produces a `dist/` loadable in Firefox as temporary add-on.
- [ ] Core flow (capture → LLM → display) works in Firefox.
- [ ] No direct `chrome.*` API calls remain in source (all go through `browser-api.ts`).
