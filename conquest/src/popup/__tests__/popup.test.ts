// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Message } from '../../lib/messages'

let runtimeMessageListener: ((message: Message) => void) | undefined
let delayedStatusResponse: Promise<void> | null = null
let mockCaptureInProgress = false
let mockPendingCaptureMode: 'fullpage' | 'region' | undefined

const mockChrome = {
  runtime: {
    getURL: vi.fn((path: string) => `chrome-extension://fake-id/${path}`),
    onMessage: {
      addListener: vi.fn((listener: (message: Message) => void) => {
        runtimeMessageListener = listener
      }),
    },
    openOptionsPage: vi.fn(),
    sendMessage: vi.fn(async (message: unknown) => {
      if (
        typeof message === 'object'
        && message !== null
        && 'type' in message
        && message.type === 'GET_STATUS'
      ) {
        const statusRequest = message as Extract<Message, { type: 'GET_STATUS' }>
        const tabId = typeof statusRequest.payload === 'object' && statusRequest.payload !== null
          && 'tabId' in statusRequest.payload
          ? statusRequest.payload.tabId
          : null
        if (delayedStatusResponse) {
          await delayedStatusResponse
        }
        const lastAnswer = mockStatusByTab.get(tabId ?? null)
        return {
          payload: {
            captureInProgress: mockCaptureInProgress,
            lastAnswer,
            lastCaptureMode: lastAnswer ? 'region' : undefined,
            lastLatencyMs: lastAnswer ? 812 : undefined,
            lastPlatform: lastAnswer ? 'kahoot' : undefined,
            lastParseStrategy: lastAnswer ? 'json' : undefined,
            lastTriggerSource: lastAnswer ? 'platform-auto' : undefined,
            lastUpdatedAt: lastAnswer ? 1234 : undefined,
            modelName: 'qwen2.5vl:7b',
            pendingCaptureMode: mockPendingCaptureMode,
            providerConnected: true,
            providerEndpoint: 'localhost:11434',
            providerStatus: 'connected',
            providerName: 'Ollama',
            statusCheckedAt: 4567,
          },
          type: 'STATUS',
        }
      }

      return undefined
    }),
  },
  storage: {
    local: {
      get: vi.fn(async (key: string | string[]) => {
        if (key === 'config') {
          return {
            config: {
              autoCapture: false,
              captureMode: 'fullpage',
              keyboardShortcut: 'Alt+Q',
              llmEndpoint: 'http://localhost:11434',
              llmModel: 'qwen2.5vl:7b',
              llmProvider: 'ollama',
              llmTimeoutMs: 90000,
            },
          }
        }
        return { session_log: [] }
      }),
      set: vi.fn(async () => undefined),
    },
  },
  tabs: {
    create: vi.fn(async () => undefined),
    query: vi.fn(async () => [{ id: 11, url: 'https://kahoot.it/game/123' }]),
  },
}

const mockStatusByTab = new Map<number | null, {
  answer: string
  confidence: number
  questionType: string
  reasoning: string
} | undefined>()

Object.assign(globalThis, { chrome: mockChrome })

describe('popup init', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    runtimeMessageListener = undefined
    delayedStatusResponse = null
    mockCaptureInProgress = false
    mockPendingCaptureMode = undefined
    mockStatusByTab.clear()
    Object.assign(globalThis, { chrome: mockChrome })
    document.body.innerHTML = `
      <button id="settings-btn"></button>
      <span id="status-dot"></span>
      <span id="status-text"></span>
      <div id="answer-empty"></div>
      <div id="answer-card" hidden></div>
      <div id="answer-text"></div>
      <span id="confidence-badge"></span>
      <span id="platform-chip" hidden></span>
      <button id="log-count-chip"><span id="log-count"></span> captures</button>
      <div id="error-banner" hidden></div>
      <button id="capture-fullpage-btn"></button>
      <button id="capture-region-btn"></button>
      <div id="capture-loading" hidden></div>
      <div id="capture-loading-title"></div>
      <div id="capture-loading-text"></div>
    `
  })

  it('requests popup status for the active tab', async () => {
    await import('../popup')
    await Promise.resolve()

    expect(mockChrome.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    })
    expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
      payload: { tabId: 11 },
      type: 'GET_STATUS',
    })
  })

  it('displays answer when background reports status with lastAnswer', async () => {
    mockStatusByTab.set(11, {
      answer: 'B',
      confidence: 0.87,
      questionType: 'multiple-choice',
      reasoning: 'Test reasoning',
    })

    await import('../popup')
    await Promise.resolve()

    runtimeMessageListener?.({
      payload: { tabId: 11 },
      type: 'STATUS_CHANGED',
    })
    await Promise.resolve()

    expect(mockChrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      payload: { tabId: 11 },
      type: 'GET_STATUS',
    })
    expect(document.getElementById('answer-card')?.hidden).toBe(false)
    expect(document.getElementById('answer-text')?.textContent).toBe('B')
    expect(document.getElementById('confidence-badge')?.textContent).toBe('87%')
  })

  it('shows a loading indicator while a capture request is pending', async () => {
    await import('../popup')
    await Promise.resolve()

    document.getElementById('capture-fullpage-btn')?.dispatchEvent(new MouseEvent('click'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockChrome.runtime.sendMessage).toHaveBeenLastCalledWith({
      payload: { mode: 'fullpage', tabId: 11, triggerSource: 'popup' },
      type: 'START_CAPTURE',
    })
    expect(document.getElementById('capture-loading')?.hidden).toBe(false)
    expect(document.getElementById('capture-loading-title')?.textContent).toContain('Analyzing visible page')
    expect((document.getElementById('capture-fullpage-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps capture actions disabled when the background reports an in-flight request', async () => {
    mockCaptureInProgress = true
    mockPendingCaptureMode = 'region'

    await import('../popup')
    await Promise.resolve()
    await Promise.resolve()

    expect(document.getElementById('capture-loading')?.hidden).toBe(false)
    expect(document.getElementById('capture-loading-title')?.textContent).toContain('Analyzing selected region')
    expect((document.getElementById('capture-fullpage-btn') as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById('capture-region-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('updates status chip with provider info', async () => {
    await import('../popup')
    await Promise.resolve()
    await Promise.resolve()

    expect(document.getElementById('status-text')?.textContent).toContain('qwen2.5vl:7b')
    expect(document.getElementById('status-text')?.textContent).toContain('Ollama')
    expect(document.getElementById('status-dot')?.className).toContain('connected')
  })
})
