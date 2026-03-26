import { assertAllowedEndpoint } from '../lib/endpoint'
import { OllamaProvider } from './ollama'
import { OpenAICompatProvider } from './openai-compat'

import type { VisionLLMProvider } from './provider'
import type { ExtensionConfig } from '../lib/types'

let cachedProvider: VisionLLMProvider | null = null
let cachedConfigHash = ''

export function createProvider(config: ExtensionConfig): VisionLLMProvider {
  assertAllowedEndpoint(config.llmEndpoint, {
    allowPublicHosts: config.llmProvider === 'openai-compatible',
  })
  const hash = `${config.llmProvider}:${config.llmEndpoint}:${config.llmModel}:${config.llmApiKey}`
  if (cachedProvider && cachedConfigHash === hash) return cachedProvider

  switch (config.llmProvider) {
    case 'ollama':
      cachedProvider = new OllamaProvider(config.llmEndpoint, config.llmModel)
      break
    case 'openai-compatible':
      cachedProvider = new OpenAICompatProvider(config.llmEndpoint, config.llmModel, config.llmApiKey)
      break
  }

  cachedConfigHash = hash
  return cachedProvider
}

export function invalidateProvider(): void {
  cachedProvider = null
  cachedConfigHash = ''
}
