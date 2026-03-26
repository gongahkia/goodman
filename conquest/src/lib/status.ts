import { maskEndpointForDisplay } from './endpoint'

import type {
  ExtensionConfig,
  ProviderConnectionResult,
  StatusPayload,
  TabAnalysisState,
} from './types'

function formatProviderName(provider: ExtensionConfig['llmProvider']): string {
  switch (provider) {
    case 'ollama':
      return 'Ollama'
    case 'openai-compatible':
      return 'OpenAI-style API server'
  }
}

export function buildStatusPayload(
  config: ExtensionConfig,
  providerHealth: ProviderConnectionResult,
  tabState?: TabAnalysisState,
  activeCaptureMode?: StatusPayload['pendingCaptureMode'],
): StatusPayload {
  return {
    captureInProgress: Boolean(activeCaptureMode),
    lastAnswer: tabState?.answer,
    lastCaptureMode: tabState?.captureMode,
    lastErrorCode: tabState?.errorCode,
    lastLatencyMs: tabState?.latencyMs,
    lastPlatform: tabState?.platform,
    lastParseStrategy: tabState?.parseStrategy,
    lastTriggerSource: tabState?.triggerSource,
    lastUpdatedAt: tabState?.updatedAt,
    modelName: config.llmModel,
    pendingCaptureMode: activeCaptureMode,
    providerConnected: providerHealth.available,
    providerEndpoint: maskEndpointForDisplay(config.llmEndpoint),
    providerErrorMessage: providerHealth.errorMessage,
    providerName: formatProviderName(config.llmProvider),
    providerStatus: providerHealth.providerStatus,
    statusCheckedAt: providerHealth.checkedAt,
  }
}
