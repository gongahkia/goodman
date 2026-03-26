import { describe, expect, it } from 'vitest'

import { buildStatusPayload } from '../status'

describe('buildStatusPayload', () => {
  it('builds popup status from config and latest session log entry', () => {
    const status = buildStatusPayload(
      {
        autoCapture: false,
        captureMode: 'region',
        keyboardShortcut: 'Alt+Q',
        llmApiKey: '',
        llmEndpoint: 'http://localhost:11434',
        llmModel: 'qwen2.5vl:7b',
        llmProvider: 'ollama',
        llmTimeoutMs: 30000,
      },
      {
        available: true,
        checkedAt: 4321,
        providerStatus: 'connected',
      },
      {
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
        latencyMs: 812,
        parseStrategy: 'json',
        platform: 'kahoot',
        tabUrl: 'https://kahoot.it/game/123',
        triggerSource: 'platform-auto',
        updatedAt: 1234,
      },
    )

    expect(status.captureInProgress).toBe(false)
    expect(status.providerConnected).toBe(true)
    expect(status.providerStatus).toBe('connected')
    expect(status.providerEndpoint).toBe('localhost:11434')
    expect(status.lastAnswer?.answer).toBe('B')
    expect(status.lastLatencyMs).toBe(812)
    expect(status.lastPlatform).toBe('kahoot')
    expect(status.lastTriggerSource).toBe('platform-auto')
    expect(status.lastCaptureMode).toBe('region')
    expect(status.lastUpdatedAt).toBe(1234)
    expect(status.statusCheckedAt).toBe(4321)
  })

  it('leaves opaque endpoints untouched when URL parsing fails', () => {
    const status = buildStatusPayload(
      {
        autoCapture: false,
        captureMode: 'fullpage',
        keyboardShortcut: 'Alt+Q',
        llmApiKey: '',
        llmEndpoint: 'bad-endpoint',
        llmModel: 'qwen2.5vl:7b',
        llmProvider: 'ollama',
        llmTimeoutMs: 30000,
      },
      {
        available: false,
        checkedAt: 5000,
        errorMessage: 'Bad endpoint',
        providerStatus: 'misconfigured',
      },
    )

    expect(status.captureInProgress).toBe(false)
    expect(status.providerEndpoint).toBe('bad-endpoint')
    expect(status.providerStatus).toBe('misconfigured')
    expect(status.lastAnswer).toBeUndefined()
  })

  it('exposes the in-flight capture mode when a capture is already running', () => {
    const status = buildStatusPayload(
      {
        autoCapture: false,
        captureMode: 'fullpage',
        keyboardShortcut: 'Alt+Q',
        llmApiKey: '',
        llmEndpoint: 'http://localhost:11434',
        llmModel: 'qwen2.5vl:7b',
        llmProvider: 'ollama',
        llmTimeoutMs: 30000,
      },
      {
        available: true,
        checkedAt: 1111,
        providerStatus: 'connected',
      },
      undefined,
      'region',
    )

    expect(status.captureInProgress).toBe(true)
    expect(status.pendingCaptureMode).toBe('region')
  })
})
