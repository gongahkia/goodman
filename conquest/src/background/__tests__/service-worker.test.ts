import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '../../lib/messages'

const store: Record<string, unknown> = {}

let runtimeMessageListener:
  | ((message: Message, sender: chrome.runtime.MessageSender, sendResponse: (response?: Message) => void) => boolean)
  | undefined
let tabActivatedListener: ((activeInfo: chrome.tabs.TabActiveInfo) => void | Promise<void>) | undefined
let tabUpdatedListener:
  | ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void | Promise<void>)
  | undefined
let tabRemovedListener: ((tabId: number) => void | Promise<void>) | undefined

const handleCaptureRequestMock = vi.fn(async () => undefined)
const providerAvailabilityMock = vi.fn(async () => true)
const createProviderMock = vi.fn(() => ({
  isAvailable: providerAvailabilityMock,
}))
const invalidateProviderMock = vi.fn()

vi.mock('../../core/orchestrator', () => ({
  handleCaptureRequest: handleCaptureRequestMock,
}))

vi.mock('../../llm/factory', () => ({
  createProvider: createProviderMock,
  invalidateProvider: invalidateProviderMock,
}))

const mockChrome = {
  action: {
    setBadgeBackgroundColor: vi.fn(async () => undefined),
    setBadgeText: vi.fn(async () => undefined),
  },
  commands: {
    onCommand: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    onMessage: {
      addListener: vi.fn((
        listener: (
          message: Message,
          sender: chrome.runtime.MessageSender,
          sendResponse: (response?: Message) => void,
        ) => boolean,
      ) => {
        runtimeMessageListener = listener
      }),
    },
    sendMessage: vi.fn(async () => undefined),
  },
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: store[keys] }
        }

        const result: Record<string, unknown> = {}
        for (const key of keys) {
          result[key] = store[key]
        }
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items)
      }),
    },
  },
  tabs: {
    get: vi.fn(async (tabId: number) => ({
      id: tabId,
      url: 'https://kahoot.it/game/123',
    })),
    onActivated: {
      addListener: vi.fn((listener: (activeInfo: chrome.tabs.TabActiveInfo) => void | Promise<void>) => {
        tabActivatedListener = listener
      }),
    },
    onRemoved: {
      addListener: vi.fn((listener: (tabId: number) => void | Promise<void>) => {
        tabRemovedListener = listener
      }),
    },
    onUpdated: {
      addListener: vi.fn((
        listener: (
          tabId: number,
          changeInfo: chrome.tabs.TabChangeInfo,
          tab: chrome.tabs.Tab,
        ) => void | Promise<void>,
      ) => {
        tabUpdatedListener = listener
      }),
    },
    query: vi.fn(async () => [{ id: 7, url: 'https://kahoot.it/game/123' }]),
    sendMessage: vi.fn(async () => undefined),
  },
}

Object.assign(globalThis, { chrome: mockChrome })

describe('background service worker', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    providerAvailabilityMock.mockReset()
    providerAvailabilityMock.mockResolvedValue(true)
    handleCaptureRequestMock.mockReset()
    handleCaptureRequestMock.mockResolvedValue(undefined)
    createProviderMock.mockReset()
    createProviderMock.mockReturnValue({
      isAvailable: providerAvailabilityMock,
    })
    invalidateProviderMock.mockReset()
    runtimeMessageListener = undefined
    tabActivatedListener = undefined
    tabUpdatedListener = undefined
    tabRemovedListener = undefined

    for (const key of Object.keys(store)) {
      delete store[key]
    }

    Object.assign(globalThis, { chrome: mockChrome })
    await import('../service-worker')
  })

  it('returns tab-scoped status when the stored URL still matches', async () => {
    const { setTabAnalysisState } = await import('../../lib/storage')
    await setTabAnalysisState(7, {
      answer: {
        answer: 'B',
        confidence: 0.87,
        questionType: 'multiple-choice',
        reasoning: 'Test',
      },
      badge: {
        color: '#00d4aa',
        text: '87%',
        variant: 'success',
      },
      captureMode: 'region',
      platform: 'kahoot',
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })

    const response = await dispatchMessage({
      payload: { tabId: 7 },
      type: 'GET_STATUS',
    })

    expect(response?.type).toBe('STATUS')
    if (response?.type !== 'STATUS') {
      throw new Error('Expected STATUS response')
    }

    expect(response.payload.lastAnswer?.answer).toBe('B')
    expect(response.payload.lastPlatform).toBe('kahoot')
  })

  it('suppresses status details when the current tab URL no longer matches', async () => {
    const { setTabAnalysisState } = await import('../../lib/storage')
    await setTabAnalysisState(7, {
      answer: {
        answer: 'B',
        confidence: 0.87,
        questionType: 'multiple-choice',
        reasoning: 'Test',
      },
      badge: {
        color: '#00d4aa',
        text: '87%',
        variant: 'success',
      },
      captureMode: 'region',
      platform: 'kahoot',
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })
    mockChrome.tabs.get.mockResolvedValueOnce({
      id: 7,
      url: 'https://kahoot.it/game/999',
    })

    const response = await dispatchMessage({
      payload: { tabId: 7 },
      type: 'GET_STATUS',
    })

    expect(response?.type).toBe('STATUS')
    if (response?.type !== 'STATUS') {
      throw new Error('Expected STATUS response')
    }

    expect(response.payload.lastAnswer).toBeUndefined()
    expect(response.payload.lastUpdatedAt).toBeUndefined()
  })

  it('restores the badge for the activated tab from stored state', async () => {
    const { setTabAnalysisState } = await import('../../lib/storage')
    await setTabAnalysisState(7, {
      badge: {
        color: '#00d4aa',
        text: '87%',
        variant: 'success',
      },
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })

    await tabActivatedListener?.({ tabId: 7, windowId: 1 })

    expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: '87%',
    })
    expect(mockChrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: '#00d4aa',
      tabId: 7,
    })
  })

  it('clears tab state and badge when the tab URL changes', async () => {
    const { getTabAnalysisState, setTabAnalysisState } = await import('../../lib/storage')
    await setTabAnalysisState(7, {
      badge: {
        color: '#00d4aa',
        text: '87%',
        variant: 'success',
      },
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })

    await tabUpdatedListener?.(7, { url: 'https://kahoot.it/game/456' }, {
      id: 7,
      url: 'https://kahoot.it/game/456',
    } as chrome.tabs.Tab)

    expect(await getTabAnalysisState(7)).toBeUndefined()
    expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: '',
    })
  })

  it('clears tab state when the tab is removed', async () => {
    const { getTabAnalysisState, setTabAnalysisState } = await import('../../lib/storage')
    await setTabAnalysisState(7, {
      badge: {
        color: '#e04060',
        text: '!',
        variant: 'error',
      },
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })

    await tabRemovedListener?.(7)

    expect(await getTabAnalysisState(7)).toBeUndefined()
  })

  it('sends explicit cancel feedback without mutating logs or tab state', async () => {
    const response = await dispatchMessage(
      {
        payload: null,
        type: 'REGION_SELECTION_CANCELLED',
      },
      {
        tab: {
          id: 7,
        },
      } as chrome.runtime.MessageSender,
    )

    expect(response).toBeUndefined()
    expect(mockChrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      payload: {
        code: 'CAPTURE_CANCELLED',
        userMessage: 'Region selection cancelled',
      },
      type: 'ERROR',
    })
    expect(store.session_log).toBeUndefined()
    expect(store.tab_analysis_state).toBeUndefined()
  })

  it('clears session log, tab state, and badges together', async () => {
    const { appendLog, getSessionLog, setTabAnalysisState } = await import('../../lib/storage')
    await appendLog({
      answer: {
        answer: 'B',
        confidence: 0.87,
        questionType: 'multiple-choice',
        reasoning: 'Test',
      },
      captureMode: 'region',
      platform: 'kahoot',
      timestamp: 1234,
    })
    await setTabAnalysisState(7, {
      badge: {
        color: '#00d4aa',
        text: '87%',
        variant: 'success',
      },
      tabUrl: 'https://kahoot.it/game/123',
      updatedAt: 1234,
    })

    const response = await dispatchMessage({
      payload: null,
      type: 'CLEAR_SESSION_STATE',
    })

    expect(response).toEqual({
      payload: null,
      type: 'SESSION_STATE_CLEARED',
    })
    expect(await getSessionLog()).toEqual([])
    expect(store.tab_analysis_state).toEqual({})
    expect(mockChrome.action.setBadgeText).toHaveBeenCalledWith({
      tabId: 7,
      text: '',
    })
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
      payload: { tabId: 7 },
      type: 'STATUS_CHANGED',
    })
  })

  it('blocks duplicate captures while a request is already in flight for the same tab', async () => {
    let resolveCapture: (() => void) | undefined
    handleCaptureRequestMock.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      resolveCapture = () => resolve(undefined)
    }))

    const firstCapturePromise = dispatchMessage({
      payload: { mode: 'fullpage', tabId: 7, triggerSource: 'popup' },
      type: 'START_CAPTURE',
    })
    await Promise.resolve()
    await Promise.resolve()

    const statusWhilePending = await dispatchMessage({
      payload: { tabId: 7 },
      type: 'GET_STATUS',
    })

    expect(statusWhilePending?.type).toBe('STATUS')
    if (statusWhilePending?.type !== 'STATUS') {
      throw new Error('Expected STATUS response')
    }
    expect(statusWhilePending.payload.captureInProgress).toBe(true)
    expect(statusWhilePending.payload.pendingCaptureMode).toBe('fullpage')

    const secondCapturePromise = dispatchMessage({
      payload: { mode: 'fullpage', tabId: 7, triggerSource: 'popup' },
      type: 'START_CAPTURE',
    })
    await Promise.resolve()

    expect(handleCaptureRequestMock).toHaveBeenCalledTimes(1)

    resolveCapture?.()
    await firstCapturePromise
    await secondCapturePromise

    const statusAfterCompletion = await dispatchMessage({
      payload: { tabId: 7 },
      type: 'GET_STATUS',
    })

    expect(statusAfterCompletion?.type).toBe('STATUS')
    if (statusAfterCompletion?.type !== 'STATUS') {
      throw new Error('Expected STATUS response')
    }
    expect(statusAfterCompletion.payload.captureInProgress).toBe(false)
  })
})

async function dispatchMessage(
  message: Message,
  sender = {} as chrome.runtime.MessageSender,
): Promise<Message | undefined> {
  if (!runtimeMessageListener) {
    throw new Error('Runtime message listener was not registered')
  }

  return await new Promise<Message | undefined>((resolve) => {
    const keepAlive = runtimeMessageListener?.(message, sender, resolve)
    expect(keepAlive).toBe(true)
  })
}
