export type LLMProviderType = 'ollama' | 'openai-compatible'

export type CaptureMode = 'fullpage' | 'region'

export type CaptureTriggerMode = CaptureMode | 'default'

export type TriggerSource = 'keyboard' | 'platform-auto' | 'popup'

export type ParseStrategy =
  | 'fallback-empty'
  | 'fallback-text'
  | 'json'
  | 'json-fenced'
  | 'json-object'
  | 'labeled-text'

export type ProviderStatus = 'connected' | 'misconfigured' | 'timed_out' | 'unavailable'

export interface ExtensionConfig {
  captureMode: CaptureMode
  llmApiKey: string
  llmProvider: LLMProviderType
  llmEndpoint: string
  llmModel: string
  autoCapture: boolean
  keyboardShortcut: string
  llmTimeoutMs: number
}

export interface QuizAnswer {
  answer: string
  confidence: number
  reasoning: string
  questionType: string
}

export interface QuizAnalysisResult {
  answer: QuizAnswer
  model: string
  parseStrategy: ParseStrategy
  provider: LLMProviderType
  rawResponse: string
}

export interface CapturedImage {
  base64: string
  mimeType: string
}

export interface BadgeState {
  color: string
  text: string
  variant: 'error' | 'success'
}

export interface LogEntry {
  answer?: QuizAnswer
  captureMode?: CaptureMode
  errorCode?: string
  latencyMs?: number
  model?: string
  parseStrategy?: ParseStrategy
  provider?: LLMProviderType
  status?: 'error' | 'success'
  screenshotThumbnail?: string
  platform: string
  timestamp: number
  triggerSource?: TriggerSource
  userMessage?: string
}

export interface TabAnalysisState {
  answer?: QuizAnswer
  badge: BadgeState
  captureMode?: CaptureMode
  errorCode?: string
  latencyMs?: number
  model?: string
  parseStrategy?: ParseStrategy
  platform?: string
  provider?: LLMProviderType
  tabUrl: string
  triggerSource?: TriggerSource
  updatedAt: number
}

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export interface StatusPayload {
  captureInProgress: boolean
  lastCaptureMode?: CaptureMode
  lastErrorCode?: string
  lastLatencyMs?: number
  lastParseStrategy?: ParseStrategy
  lastTriggerSource?: TriggerSource
  providerConnected: boolean
  providerEndpoint: string
  providerErrorMessage?: string
  providerName: string
  providerStatus: ProviderStatus
  lastPlatform?: string
  modelName: string
  lastAnswer?: QuizAnswer
  pendingCaptureMode?: CaptureMode
  lastUpdatedAt?: number
  statusCheckedAt: number
}

export interface ProviderConnectionResult {
  available: boolean
  checkedAt: number
  errorMessage?: string
  providerStatus: ProviderStatus
}
