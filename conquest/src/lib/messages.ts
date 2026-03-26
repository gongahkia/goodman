import { browserApi } from './browser-api'

import type { ErrorCode } from './error-handler'
import type {
  CaptureMode,
  CaptureTriggerMode,
  ExtensionConfig,
  ProviderConnectionResult,
  QuizAnswer,
  Region,
  StatusPayload,
  TriggerSource,
} from './types'

export type Message =
  | { type: 'ANALYSIS_STARTED', payload: { captureMode: CaptureMode } }
  | { type: 'ANSWER_READY', payload: QuizAnswer }
  | { type: 'CLEAR_SESSION_STATE', payload: null }
  | { type: 'CONFIG_UPDATED', payload: Partial<ExtensionConfig> }
  | { type: 'ERROR', payload: { code: ErrorCode, userMessage: string } }
  | { type: 'GET_STATUS', payload: { tabId?: number | null } }
  | { type: 'LIST_VISION_MODELS', payload: null }
  | { type: 'OLLAMA_PULL_RESULT', payload: { errorMessage?: string, ok: boolean } }
  | { type: 'PROVIDER_CONNECTION_RESULT', payload: ProviderConnectionResult }
  | { type: 'PULL_OLLAMA_MODEL', payload: { model: string } }
  | { type: 'REGION_SELECTED', payload: { region: Region, tabUrl: string, triggerSource: TriggerSource } }
  | { type: 'REGION_SELECTION_CANCELLED', payload: null }
  | { type: 'SESSION_STATE_CLEARED', payload: null }
  | { type: 'START_CAPTURE', payload: { mode: CaptureTriggerMode, tabId?: number | null, triggerSource: TriggerSource } }
  | { type: 'START_REGION_SELECTION', payload: null }
  | { type: 'STATUS', payload: StatusPayload }
  | { type: 'STATUS_CHANGED', payload: { tabId: number } }
  | { type: 'TEST_PROVIDER_CONNECTION', payload: null }
  | { type: 'VISION_MODELS_RESULT', payload: { errorMessage?: string, models: string[] } }

export async function sendMessage(msg: Message): Promise<Message> {
  const response = await browserApi.runtime.sendMessage(msg)
  return response as Message
}

export async function sendRuntimeMessageBestEffort(msg: Message): Promise<boolean> {
  try {
    await browserApi.runtime.sendMessage(msg)
    return true
  } catch (error) {
    if (isMissingReceiverError(error)) {
      return false
    }
    throw error
  }
}

export async function sendToTab(tabId: number, msg: Message): Promise<void> {
  await browserApi.tabs.sendMessage(tabId, msg)
}

export async function sendToTabBestEffort(tabId: number, msg: Message): Promise<boolean> {
  try {
    await browserApi.tabs.sendMessage(tabId, msg)
    return true
  } catch (error) {
    if (isMissingReceiverError(error)) {
      return false
    }
    throw error
  }
}

function isMissingReceiverError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  return error.message.includes('Could not establish connection')
    || error.message.includes('Receiving end does not exist')
}
