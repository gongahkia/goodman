# TC Guard

A browser extension that automatically detects Terms & Conditions on any webpage, summarizes them using AI, highlights legally concerning "red flag" clauses, and tracks T&C changes over time per domain.

## Features

- **T&C Detection** — Automatically detects checkboxes, consent banners, modals, and full-page legal text
- **AI Summarization** — Summarizes legal text into plain English using your choice of LLM provider
- **Red Flag Analysis** — Identifies concerning clauses like data selling, arbitration, and class action waivers
- **Version Tracking** — Tracks T&C changes over time per domain with visual timeline and diff comparison
- **Multi-Provider Support** — OpenAI, Claude, Gemini, Ollama (local), and custom OpenAI-compatible endpoints
- **Dark/Light Theme** — Matches your system preference or manual override

## Installation

### Chrome Web Store

*(Coming soon)*

### Firefox Add-ons

*(Coming soon)*

### Manual Build

```bash
git clone https://github.com/your-username/tc-guard.git
cd tc-guard
pnpm install
pnpm build          # Chrome
pnpm build:firefox  # Firefox
```

Then load the `dist/` directory as an unpacked extension in Chrome (`chrome://extensions` > Developer mode > Load unpacked) or Firefox (`about:debugging` > Load Temporary Add-on).

## Configuration

1. Click the TC Guard extension icon
2. Go to **Settings**
3. Select your LLM provider (OpenAI, Claude, Gemini, Ollama, or Custom)
4. Enter your API key
5. Click **Test** to verify the connection
6. Select your preferred model

For **Ollama** (local inference), no API key is needed — just ensure Ollama is running on `localhost:11434`.

## Privacy

- **No telemetry** — Zero analytics, tracking, or crash reporting
- **All data stays local** — Summaries, version history, and settings are stored in browser storage
- **API keys stored securely** — Encrypted at rest via `chrome.storage.local`
- **You control the AI** — Choose a local model via Ollama for complete privacy

## Development

```bash
pnpm dev           # Development with HMR
pnpm build         # Production build (Chrome)
pnpm build:firefox # Production build (Firefox)
pnpm test          # Unit tests
pnpm test:e2e      # E2E tests
pnpm lint          # ESLint
pnpm typecheck     # TypeScript check
```

## License

ISC
