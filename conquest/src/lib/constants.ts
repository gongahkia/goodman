import type { ExtensionConfig } from './types'

export const DEFAULT_CONFIG: ExtensionConfig = {
  captureMode: 'fullpage',
  llmApiKey: '',
  llmProvider: 'ollama',
  llmEndpoint: 'http://localhost:11434',
  llmModel: 'qwen2.5vl:7b',
  autoCapture: false,
  keyboardShortcut: 'Alt+Q',
  llmTimeoutMs: 90_000,
}

export const SUPPORTED_PLATFORMS = [
  'wooclap.com',
  'kahoot.it',
  'docs.google.com/forms',
  'mentimeter.com',
  'slido.com',
  'menti.com',
  'app.sli.do',
] as const

export const MAX_LOG_ENTRIES = 500

export const AUTO_CAPTURE_DEBOUNCE_MS = 250
export const AUTO_CAPTURE_COOLDOWN_MS = 1200

export const LIVE_CAPTURE_RETRY_OPTIONS = {
  maxRetries: 1,
  baseDelayMs: 150,
  backoffMultiplier: 1,
} as const

export const PROVIDER_HEALTH_TIMEOUT_MS = 3_000
export const PROVIDER_STATUS_CACHE_TTL_MS = 5_000

export const OPENAI_COMPAT_PRESETS: Record<string, string> = {
  'lm-studio': 'http://localhost:1234',
  'localai': 'http://localhost:8080',
  'llama-cpp': 'http://localhost:8080',
  'jan': 'http://localhost:1337',
  'vllm': 'http://localhost:8000',
  'openai': 'https://api.openai.com',
  'openrouter': 'https://openrouter.ai/api',
  'together': 'https://api.together.xyz',
  'fireworks': 'https://api.fireworks.ai/inference',
}

export const MODEL_RECOMMENDATIONS = [
  {
    tier: 'High Accuracy',
    model: 'qwen2.5vl:7b',
    vram: '~8GB VRAM',
  },
  {
    tier: 'Balanced',
    model: 'gemma3:4b',
    vram: '~5GB VRAM',
  },
  {
    tier: 'Lightweight',
    model: 'moondream:1.8b',
    vram: '~2GB VRAM',
  },
] as const
