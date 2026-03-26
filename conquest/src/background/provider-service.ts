import {
  PROVIDER_HEALTH_TIMEOUT_MS,
  PROVIDER_STATUS_CACHE_TTL_MS,
} from '../lib/constants'
import { assertAllowedEndpoint, maskEndpointForDisplay } from '../lib/endpoint'
import { AgentError, ErrorCode } from '../lib/error-handler'
import { createProvider } from '../llm/factory'

import type {
  ExtensionConfig,
  ProviderConnectionResult,
} from '../lib/types'

interface ProviderStatusCacheEntry {
  expiresAt: number
  key: string
  result: ProviderConnectionResult
}

let providerStatusCache: ProviderStatusCacheEntry | null = null

export async function listVisionModels(config: ExtensionConfig): Promise<string[]> {
  assertAllowedEndpoint(config.llmEndpoint, {
    allowPublicHosts: config.llmProvider === 'openai-compatible',
  })
  const provider = createProvider(config)
  return provider.listVisionModels()
}

export async function pullOllamaModel(
  config: ExtensionConfig,
  model: string,
): Promise<void> {
  if (config.llmProvider !== 'ollama') {
    throw new AgentError(
      ErrorCode.LlmError,
      'Model pull unavailable: Ollama is not the active provider',
    )
  }

  assertAllowedEndpoint(config.llmEndpoint)
  const response = await fetch(`${config.llmEndpoint.replace(/\/+$/, '')}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: false }),
  })

  if (!response.ok) {
    throw new Error(`Ollama model pull failed: ${response.status} ${response.statusText}`)
  }
}

export async function testProviderConnection(
  config: ExtensionConfig,
  options: { forceRefresh?: boolean } = {},
): Promise<ProviderConnectionResult> {
  const cacheKey = buildCacheKey(config)
  if (
    !options.forceRefresh
    && providerStatusCache
    && providerStatusCache.key === cacheKey
    && providerStatusCache.expiresAt > Date.now()
  ) {
    return providerStatusCache.result
  }

  const result = await probeProviderConnection(config)
  providerStatusCache = {
    expiresAt: result.checkedAt + PROVIDER_STATUS_CACHE_TTL_MS,
    key: cacheKey,
    result,
  }
  return result
}

export function invalidateProviderStatusCache(): void {
  providerStatusCache = null
}

async function probeProviderConnection(
  config: ExtensionConfig,
): Promise<ProviderConnectionResult> {
  const checkedAt = Date.now()

  try {
    assertAllowedEndpoint(config.llmEndpoint, {
      allowPublicHosts: config.llmProvider === 'openai-compatible',
    })
    const provider = createProvider(config)
    const available = await withTimeout(
      provider.isAvailable(),
      PROVIDER_HEALTH_TIMEOUT_MS,
      () => new AgentError(
        ErrorCode.LlmUnavailable,
        `Provider health check timed out after ${PROVIDER_HEALTH_TIMEOUT_MS}ms`,
      ),
    )
    const modelError = available
      ? await validateConfiguredModel(config)
      : undefined

    return {
      available: available && !modelError,
      checkedAt,
      errorMessage: modelError ?? (available
        ? undefined
        : 'Server not available at configured endpoint'),
      providerStatus: modelError
        ? 'misconfigured'
        : available ? 'connected' : 'unavailable',
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    const normalizedError = errorMessage.toLowerCase()
    const providerStatus = normalizedError.includes('timed out')
      ? 'timed_out'
      : normalizedError.includes('localhost')
        || normalizedError.includes('private network')
        || normalizedError.includes('endpoint')
        || normalizedError.includes('authentication')
        || normalizedError.includes('api key')
        || normalizedError.includes('401')
        || normalizedError.includes('403')
        ? 'misconfigured'
        : 'unavailable'

    return {
      available: false,
      checkedAt,
      errorMessage,
      providerStatus,
    }
  }
}

async function validateConfiguredModel(
  config: ExtensionConfig,
): Promise<string | undefined> {
  const configuredModel = config.llmModel.trim()
  if (!configuredModel) {
    return 'No model configured for the selected provider'
  }

  const provider = createProvider(config)
  const models = await provider.listVisionModels()
  if (models.length === 0) {
    return undefined
  }

  const normalizedConfiguredModel = configuredModel.toLowerCase()
  const hasMatchingModel = models.some((model) => model.toLowerCase() === normalizedConfiguredModel)

  if (hasMatchingModel) {
    return undefined
  }

  return `Configured model "${configuredModel}" is not available at ${maskEndpointForDisplay(config.llmEndpoint)}`
}

function buildCacheKey(config: ExtensionConfig): string {
  return `${config.llmProvider}:${config.llmEndpoint}:${config.llmModel}:${config.llmApiKey}`
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(onTimeout()), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
