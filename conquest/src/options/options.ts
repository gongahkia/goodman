import { MODEL_RECOMMENDATIONS, OPENAI_COMPAT_PRESETS } from '../lib/constants'
import { sendMessage } from '../lib/messages'
import { getConfig, setConfig } from '../lib/storage'
import { renderLogPanel } from './log-viewer'

import type { ExtensionConfig, LLMProviderType } from '../lib/types'

const providerSelect = document.getElementById('provider-select') as HTMLSelectElement
const presetField = document.getElementById('openai-preset-field') as HTMLDivElement
const presetSelect = document.getElementById('preset-select') as HTMLSelectElement
const apiKeyField = document.getElementById('api-key-field') as HTMLDivElement
const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement
const endpointInput = document.getElementById('endpoint-input') as HTMLInputElement
const modelInput = document.getElementById('model-input') as HTMLInputElement
const modelSuggestions = document.getElementById('model-suggestions') as HTMLDataListElement
const modelSelect = document.getElementById('model-select') as HTMLSelectElement
const modelHelp = document.getElementById('model-help') as HTMLParagraphElement
const testConnectionBtn = document.getElementById('test-connection-btn') as HTMLButtonElement
const testResult = document.getElementById('test-result') as HTMLDivElement
const captureModeSelect = document.getElementById('capture-mode-select') as HTMLSelectElement
const autoCaptureToggle = document.getElementById('auto-capture-toggle') as HTMLDivElement
const autoCaptureTrack = document.getElementById('auto-capture-track') as HTMLDivElement
const timeoutInput = document.getElementById('timeout-input') as HTMLInputElement
const modelRecommendations = document.getElementById('model-recommendations') as HTMLDivElement
const logContainer = document.getElementById('log-container') as HTMLDivElement

let currentConfig: ExtensionConfig
const LOCAL_MODEL_DEFAULTS = new Set([
  'qwen2.5-vl',
  'qwen2.5-vl:7b',
  ...MODEL_RECOMMENDATIONS.map((rec) => rec.model),
])

async function init(): Promise<void> {
  currentConfig = await getConfig()
  populateForm(currentConfig)
  renderModelRecommendations()
  void renderLogPanel(logContainer)
}

function populateForm(config: ExtensionConfig): void {
  providerSelect.value = config.llmProvider
  apiKeyInput.value = config.llmApiKey
  endpointInput.value = config.llmEndpoint
  modelInput.value = config.llmModel
  captureModeSelect.value = config.captureMode
  timeoutInput.value = String(config.llmTimeoutMs)

  updateProviderUI(config.llmProvider)
  syncPresetSelection(config.llmEndpoint)
  updateAutoCaptureToggle(config.autoCapture)

  fetchVisionModels()
}

function updateProviderUI(provider: LLMProviderType): void {
  if (provider === 'openai-compatible') {
    presetField.hidden = false
    apiKeyField.hidden = false
    modelInput.hidden = false
    modelSelect.hidden = true
    modelInput.placeholder = 'Model ID'
    clearModelHelp()
  } else {
    presetField.hidden = true
    apiKeyField.hidden = true
    modelInput.hidden = true
    modelSelect.hidden = false
    modelInput.placeholder = 'qwen2.5vl:7b'
    clearModelHelp()
  }
}

function updateAutoCaptureToggle(enabled: boolean): void {
  if (enabled) {
    autoCaptureTrack.classList.add('cq-toggle__track--on')
  } else {
    autoCaptureTrack.classList.remove('cq-toggle__track--on')
  }
}

async function saveConfig(partial: Partial<ExtensionConfig>): Promise<boolean> {
  try {
    await setConfig(partial)
    currentConfig = { ...currentConfig, ...partial }
    await sendMessage({ type: 'CONFIG_UPDATED', payload: partial })
    hideConfigError()
    return true
  } catch (err) {
    showConfigError(err instanceof Error ? err.message : 'Unknown error')
    populateForm(currentConfig)
    return false
  }
}

// Provider change
providerSelect.addEventListener('change', async () => {
  const provider = providerSelect.value as LLMProviderType
  updateProviderUI(provider)

  const defaults: Record<LLMProviderType, string> = {
    'ollama': 'http://localhost:11434',
    'openai-compatible': 'http://localhost:1234',
  }
  endpointInput.value = defaults[provider] ?? ''

  const saved = await saveConfig({
    llmProvider: provider,
    llmEndpoint: endpointInput.value,
  })

  if (saved) {
    syncPresetSelection(endpointInput.value)
    void fetchVisionModels()
  }
})

apiKeyInput.addEventListener('change', async () => {
  await saveConfig({ llmApiKey: apiKeyInput.value.trim() })
})

// Preset change
presetSelect.addEventListener('change', async () => {
  const preset = presetSelect.value
  if (preset && OPENAI_COMPAT_PRESETS[preset]) {
    endpointInput.value = OPENAI_COMPAT_PRESETS[preset]!
    const nextConfig: Partial<ExtensionConfig> = {
      llmEndpoint: endpointInput.value,
    }

    if (isCloudPreset(preset) && isLikelyLocalModel(currentConfig.llmModel)) {
      modelInput.value = ''
      nextConfig.llmModel = ''
      setModelHelp('Set a model ID.', 'error')
    }

    await saveConfig(nextConfig)
  } else if (!preset) {
    endpointInput.focus()
  }
})

// Endpoint change
endpointInput.addEventListener('change', async () => {
  syncPresetSelection(endpointInput.value)
  await saveConfig({ llmEndpoint: endpointInput.value })
})

// Model change (text input)
modelInput.addEventListener('change', async () => {
  await saveConfig({ llmModel: modelInput.value })
  if (currentConfig.llmProvider === 'openai-compatible') {
    updateOpenAICompatibleModelHelp(getSuggestedModels(), modelInput.value)
  }
})

// Model change (select for Ollama)
modelSelect.addEventListener('change', async () => {
  await saveConfig({ llmModel: modelSelect.value })
})

// Capture mode
captureModeSelect.addEventListener('change', async () => {
  await saveConfig({ captureMode: captureModeSelect.value as 'fullpage' | 'region' })
})

// Auto-capture toggle
autoCaptureToggle.addEventListener('click', async () => {
  const newValue = !currentConfig.autoCapture
  updateAutoCaptureToggle(newValue)
  await saveConfig({ autoCapture: newValue })
})

// Timeout
timeoutInput.addEventListener('change', async () => {
  const val = parseInt(timeoutInput.value, 10)
  if (val >= 5000 && val <= 120000) {
    await saveConfig({ llmTimeoutMs: val })
  }
})

// Test connection
testConnectionBtn.addEventListener('click', async () => {
  testConnectionBtn.textContent = 'Checking...'
  testConnectionBtn.className = 'cq-btn--secondary'
  testResult.hidden = true

  try {
    const response = await sendMessage({
      type: 'TEST_PROVIDER_CONNECTION',
      payload: null,
    })

    if (response.type === 'PROVIDER_CONNECTION_RESULT' && response.payload.available) {
      testConnectionBtn.textContent = 'Connected'
      testConnectionBtn.className = 'cq-btn--secondary cq-btn--secondary--success'
      testResult.textContent = 'Ready'
      testResult.className = 'cq-options__test-result cq-options__test-result--success'
    } else {
      testConnectionBtn.textContent = 'Unavailable'
      testConnectionBtn.className = 'cq-btn--secondary cq-btn--secondary--error'
      testResult.textContent = response.type === 'PROVIDER_CONNECTION_RESULT'
        ? (response.payload.errorMessage ?? 'Not available')
        : 'Unavailable'
      testResult.className = 'cq-options__test-result cq-options__test-result--error'
    }
  } catch (err) {
    testConnectionBtn.textContent = 'Unavailable'
    testConnectionBtn.className = 'cq-btn--secondary cq-btn--secondary--error'
    testResult.textContent = err instanceof Error ? err.message : 'Unknown error'
    testResult.className = 'cq-options__test-result cq-options__test-result--error'
  }

  testResult.hidden = false

  // Reset button after 3s
  setTimeout(() => {
    testConnectionBtn.textContent = 'Check'
    testConnectionBtn.className = 'cq-btn--secondary'
  }, 3000)
})

async function fetchVisionModels(): Promise<void> {
  try {
    const response = await sendMessage({
      type: 'LIST_VISION_MODELS',
      payload: null,
    })
    const models = response.type === 'VISION_MODELS_RESULT'
      ? response.payload.models
      : []
    populateModelSuggestions(models)

    modelSelect.innerHTML = ''
    if (models.length === 0) {
      const opt = document.createElement('option')
      opt.value = currentConfig.llmModel
      opt.textContent = `${currentConfig.llmModel} (manual)`
      modelSelect.appendChild(opt)
    } else {
      for (const model of models) {
        const opt = document.createElement('option')
        opt.value = model
        opt.textContent = model
        if (model === currentConfig.llmModel) opt.selected = true
        modelSelect.appendChild(opt)
      }
    }

    if (currentConfig.llmProvider === 'openai-compatible') {
      updateOpenAICompatibleModelHelp(models, currentConfig.llmModel)
    }
  } catch {
    populateModelSuggestions([])
    const opt = document.createElement('option')
    opt.value = currentConfig.llmModel
    opt.textContent = `${currentConfig.llmModel} (offline)`
    modelSelect.innerHTML = ''
    modelSelect.appendChild(opt)

    if (currentConfig.llmProvider === 'openai-compatible') {
      setModelHelp('Enter a model ID.')
    }
  }
}

async function renderModelRecommendations(): Promise<void> {
  let installedModels: string[] = []
  try {
    const response = await sendMessage({
      type: 'LIST_VISION_MODELS',
      payload: null,
    })
    if (response.type === 'VISION_MODELS_RESULT') {
      installedModels = response.payload.models
    }
  } catch {
    // offline
  }

  modelRecommendations.innerHTML = ''
  for (const rec of MODEL_RECOMMENDATIONS) {
    const isInstalled = installedModels.some((m) =>
      m.toLowerCase().includes(rec.model.split(':')[0]!.toLowerCase()),
    )

    const card = document.createElement('div')
    card.className = 'cq-options__model-card'
    card.innerHTML = `
      <div class="cq-options__model-tier">${rec.tier}</div>
      <div class="cq-options__model-name">${rec.model}</div>
      <div class="cq-options__model-vram">${rec.vram}</div>
      ${isInstalled
        ? '<div class="cq-options__model-badge">Installed</div>'
        : currentConfig.llmProvider === 'ollama'
          ? `<button class="cq-btn--small" data-model="${rec.model}">Pull Model</button>`
          : ''}
    `
    modelRecommendations.appendChild(card)
  }

  // Pull model buttons
  modelRecommendations.querySelectorAll('.cq-btn--small').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.target as HTMLButtonElement
      const model = target.dataset.model
      if (!model) return

      target.textContent = 'Pulling...'
      target.setAttribute('disabled', 'true')

      try {
        const response = await sendMessage({
          type: 'PULL_OLLAMA_MODEL',
          payload: { model },
        })
        if (response.type === 'OLLAMA_PULL_RESULT' && response.payload.ok) {
          target.textContent = 'Done ✓'
          void renderModelRecommendations()
        } else {
          target.textContent = 'Failed'
          target.title = response.type === 'OLLAMA_PULL_RESULT'
            ? (response.payload.errorMessage ?? 'Unknown error')
            : 'Unexpected provider response'
          target.removeAttribute('disabled')
        }
      } catch {
        target.textContent = 'Failed'
        target.removeAttribute('disabled')
      }
    })
  })
}

init()

function hideConfigError(): void {
  testResult.hidden = true
}

function showConfigError(message: string): void {
  testResult.hidden = false
  testResult.textContent = message
  testResult.className = 'cq-options__test-result cq-options__test-result--error'
}

function populateModelSuggestions(models: string[]): void {
  modelSuggestions.innerHTML = ''
  for (const model of models) {
    const option = document.createElement('option')
    option.value = model
    modelSuggestions.appendChild(option)
  }
}

function getSuggestedModels(): string[] {
  return Array.from(modelSuggestions.options).map((option) => option.value)
}

function updateOpenAICompatibleModelHelp(models: string[], model: string): void {
  const configuredModel = model.trim()

  if (models.length === 0) {
    setModelHelp('No models found at this endpoint.')
    return
  }

  if (!configuredModel) {
    setModelHelp('Enter a model ID.', 'error')
    return
  }

  const hasMatch = models.some((candidate) => candidate.toLowerCase() === configuredModel.toLowerCase())
  if (!hasMatch) {
    setModelHelp(`"${configuredModel}" is not available here.`, 'error')
    return
  }

  setModelHelp(`${models.length} model${models.length === 1 ? '' : 's'} available.`)
}

function setModelHelp(message: string, variant: 'default' | 'error' = 'default'): void {
  modelHelp.textContent = message
  modelHelp.classList.toggle('cq-options__hint--error', variant === 'error')
}

function clearModelHelp(): void {
  setModelHelp('')
}

function syncPresetSelection(endpoint: string): void {
  const normalizedEndpoint = normalizeEndpoint(endpoint)
  const matchedPreset = Object.entries(OPENAI_COMPAT_PRESETS)
    .find(([, presetEndpoint]) => normalizeEndpoint(presetEndpoint) === normalizedEndpoint)?.[0]

  presetSelect.value = matchedPreset ?? ''
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '').toLowerCase()
}

function isCloudPreset(preset: string): boolean {
  return ['openai', 'openrouter', 'together', 'fireworks'].includes(preset)
}

function isLikelyLocalModel(model: string): boolean {
  return LOCAL_MODEL_DEFAULTS.has(model.trim())
}
