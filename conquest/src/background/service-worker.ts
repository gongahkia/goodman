import {
  browserApi,
  type ExtensionTab,
  type MessageSender,
} from '../lib/browser-api'
import {
  resolveRequestedCaptureMode,
  shouldPromptForRegionSelection,
} from '../core/capture-request'
import {
  invalidateProviderStatusCache,
  listVisionModels,
  pullOllamaModel,
  testProviderConnection,
} from './provider-service'
import { handleCaptureRequest } from '../core/orchestrator'
import { applyBadgeState, clearBadgeState } from '../lib/badge'
import { ErrorCode } from '../lib/error-handler'
import { sendRuntimeMessageBestEffort, sendToTab } from '../lib/messages'
import { buildStatusPayload } from '../lib/status'
import { buildTabAnalysisState } from '../lib/tab-state'
import {
  clearAllTabAnalysisState,
  clearSessionLog,
  clearTabAnalysisState,
  getConfig,
  getSavedRegion,
  getTabAnalysisState,
  saveRegion,
} from '../lib/storage'
import { invalidateProvider } from '../llm/factory'

import type { Message } from '../lib/messages'
import type { CaptureMode, CaptureTriggerMode, Region, TriggerSource } from '../lib/types'

const activeCaptures = new Map<number, CaptureMode>()

browserApi.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse).catch((err) => {
      console.error('[conquest] message handler error:', err)
      sendResponse(undefined)
    })
    return true
  },
)

async function handleMessage(
  message: Message,
  sender: MessageSender,
): Promise<Message | undefined> {
  switch (message.type) {
    case 'CLEAR_SESSION_STATE': {
      await clearSessionState()
      return {
        type: 'SESSION_STATE_CLEARED',
        payload: null,
      }
    }

    case 'CONFIG_UPDATED': {
      invalidateProvider()
      invalidateProviderStatusCache()
      const tabs = await browserApi.tabs.query({})
      for (const tab of tabs) {
        if (!tab.id) continue
        try {
          await sendToTab(tab.id, message)
        } catch {
          // Tab might not have a content script
        }
      }
      return undefined
    }

    case 'GET_STATUS': {
      const tab = await resolveStatusTab(message.payload?.tabId)
      const fullConfig = await getConfig()
      const providerHealth = await testProviderConnection(fullConfig)
      const tabState = tab?.id
        ? buildTabAnalysisState(
          await getTabAnalysisState(tab.id, tab.url),
          tab.url,
        )
        : undefined
      return {
        type: 'STATUS',
        payload: buildStatusPayload(
          fullConfig,
          providerHealth,
          tabState,
          tab?.id ? activeCaptures.get(tab.id) : undefined,
        ),
      }
    }

    case 'LIST_VISION_MODELS': {
      const config = await getConfig()
      try {
        const models = await listVisionModels(config)
        return {
          type: 'VISION_MODELS_RESULT',
          payload: { models },
        }
      } catch (err) {
        return {
          type: 'VISION_MODELS_RESULT',
          payload: {
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
            models: [],
          },
        }
      }
    }

    case 'PULL_OLLAMA_MODEL': {
      const config = await getConfig()
      try {
        await pullOllamaModel(config, message.payload.model)
        return {
          type: 'OLLAMA_PULL_RESULT',
          payload: { ok: true },
        }
      } catch (err) {
        return {
          type: 'OLLAMA_PULL_RESULT',
          payload: {
            errorMessage: err instanceof Error ? err.message : 'Unknown error',
            ok: false,
          },
        }
      }
    }

    case 'REGION_SELECTED': {
      const tabId = sender.tab?.id
      if (!tabId) return undefined
      if (activeCaptures.has(tabId)) {
        await sendRuntimeMessageBestEffort({
          type: 'STATUS_CHANGED',
          payload: { tabId },
        })
        return undefined
      }

      await persistSelectedRegion(message.payload.tabUrl, message.payload.region)
      await runManagedCapture(
        tabId,
        message.payload.tabUrl,
        'region',
        message.payload.region,
        message.payload.triggerSource,
      )
      return undefined
    }

    case 'REGION_SELECTION_CANCELLED': {
      const tabId = sender.tab?.id
      if (!tabId) return undefined
      await sendToTab(tabId, {
        type: 'ERROR',
        payload: {
          code: ErrorCode.CaptureCancelled,
          userMessage: 'Region selection cancelled',
        },
      })
      return undefined
    }

    case 'START_CAPTURE':
      await startCapture(
        message.payload.mode,
        sender,
        message.payload.triggerSource,
        message.payload.tabId,
      )
      return undefined

    case 'TEST_PROVIDER_CONNECTION': {
      const config = await getConfig()
      return {
        type: 'PROVIDER_CONNECTION_RESULT',
        payload: await testProviderConnection(config, { forceRefresh: true }),
      }
    }

    default:
      return undefined
  }
}

browserApi.commands.onCommand.addListener(async (command) => {
  if (command === 'trigger-capture') {
    await startCapture('default', undefined, 'keyboard')
  }
})

async function updateBadgeForTab(tabId: number): Promise<void> {
  try {
    const tab = await browserApi.tabs.get(tabId)
    if (!tab.url) {
      await clearBadgeState(tabId)
      return
    }

    const tabState = await getTabAnalysisState(tabId, tab.url)
    if (!tabState) {
      await clearBadgeState(tabId)
      return
    }

    await applyBadgeState(tabId, tabState.badge)
  } catch {
    // Tab may not exist
  }
}

browserApi.tabs.onActivated.addListener(async (activeInfo) => {
  await updateBadgeForTab(activeInfo.tabId)
})

browserApi.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url) {
    await clearTabAnalysisState(tabId)
    try {
      await clearBadgeState(tabId)
    } catch {
      // Tab may not be available
    }
  }
})

browserApi.tabs.onRemoved.addListener(async (tabId) => {
  await clearTabAnalysisState(tabId)
  try {
    await clearBadgeState(tabId)
  } catch {
    // Tab no longer available
  }
})

async function startCapture(
  requestedMode: CaptureTriggerMode,
  sender?: MessageSender,
  triggerSource: TriggerSource = sender?.tab ? 'popup' : 'keyboard',
  explicitTabId?: number | null,
): Promise<void> {
  const targetTab = await resolveTargetTab(sender, explicitTabId)
  if (!targetTab?.id || !targetTab.url) return

  if (activeCaptures.has(targetTab.id)) {
    await sendRuntimeMessageBestEffort({
      type: 'STATUS_CHANGED',
      payload: { tabId: targetTab.id },
    })
    return
  }

  const config = await getConfig()
  const hostname = getHostname(targetTab.url)
  const savedRegion = hostname ? await getSavedRegion(hostname) : undefined

  if (
    shouldPromptForRegionSelection(
      requestedMode,
      config.captureMode,
      Boolean(savedRegion),
    )
  ) {
    await sendToTab(targetTab.id, { type: 'START_REGION_SELECTION', payload: null })
    return
  }

  const captureMode = resolveRequestedCaptureMode(requestedMode, config.captureMode)
  await runManagedCapture(targetTab.id, targetTab.url, captureMode, undefined, triggerSource)
}

function getHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

async function persistSelectedRegion(url: string, region: Region): Promise<void> {
  const hostname = getHostname(url)
  if (!hostname) return
  await saveRegion(hostname, region)
}

async function resolveTargetTab(
  sender?: MessageSender,
  explicitTabId?: number | null,
): Promise<ExtensionTab | undefined> {
  if (typeof explicitTabId === 'number') {
    try {
      return await browserApi.tabs.get(explicitTabId)
    } catch {
      return undefined
    }
  }

  if (sender?.tab) return sender.tab
  const [activeTab] = await browserApi.tabs.query({ active: true, currentWindow: true })
  return activeTab
}

async function resolveStatusTab(
  tabId?: number | null,
): Promise<ExtensionTab | undefined> {
  if (typeof tabId === 'number') {
    try {
      return await browserApi.tabs.get(tabId)
    } catch {
      return undefined
    }
  }

  const [activeTab] = await browserApi.tabs.query({ active: true, currentWindow: true })
  return activeTab
}

async function clearSessionState(): Promise<void> {
  await clearSessionLog()
  await clearAllTabAnalysisState()

  const tabs = await browserApi.tabs.query({})
  for (const tab of tabs) {
    if (!tab.id) continue

    try {
      await clearBadgeState(tab.id)
    } catch {
      // Tab may no longer be available
    }

    await sendRuntimeMessageBestEffort({
      type: 'STATUS_CHANGED',
      payload: { tabId: tab.id },
    })
  }
}

async function showAnalysisStarted(tabId: number, captureMode: CaptureMode): Promise<void> {
  try {
    await sendToTab(tabId, {
      type: 'ANALYSIS_STARTED',
      payload: { captureMode },
    })
  } catch {
    // Tab may not have an active content script receiver
  }
}

async function runManagedCapture(
  tabId: number,
  tabUrl: string,
  captureMode: CaptureMode,
  region: Region | undefined,
  triggerSource: TriggerSource,
): Promise<void> {
  if (activeCaptures.has(tabId)) return

  activeCaptures.set(tabId, captureMode)
  await showAnalysisStarted(tabId, captureMode)
  await sendRuntimeMessageBestEffort({
    type: 'STATUS_CHANGED',
    payload: { tabId },
  })

  try {
    await handleCaptureRequest(tabId, tabUrl, captureMode, region, triggerSource)
  } finally {
    activeCaptures.delete(tabId)
    await sendRuntimeMessageBestEffort({
      type: 'STATUS_CHANGED',
      payload: { tabId },
    })
  }
}
