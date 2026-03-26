import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendMessageMock = vi.fn()

const mockChrome = {
  runtime: {
    sendMessage: sendMessageMock,
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
  },
}

Object.assign(globalThis, { chrome: mockChrome })

describe('runtime messaging helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sendMessageMock.mockReset()
    Object.assign(globalThis, { chrome: mockChrome })
  })

  it('returns false when no extension page is listening for a runtime broadcast', async () => {
    sendMessageMock.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )

    const { sendRuntimeMessageBestEffort } = await import('../messages')
    const delivered = await sendRuntimeMessageBestEffort({
      payload: { tabId: 7 },
      type: 'STATUS_CHANGED',
    })

    expect(delivered).toBe(false)
  })

  it('rethrows unexpected runtime messaging errors', async () => {
    sendMessageMock.mockRejectedValueOnce(new Error('Quota exceeded'))

    const { sendRuntimeMessageBestEffort } = await import('../messages')

    await expect(
      sendRuntimeMessageBestEffort({
        payload: { tabId: 7 },
        type: 'STATUS_CHANGED',
      }),
    ).rejects.toThrow('Quota exceeded')
  })

  it('returns false when no content script is listening in the tab', async () => {
    mockChrome.tabs.sendMessage.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    )

    const { sendToTabBestEffort } = await import('../messages')
    const delivered = await sendToTabBestEffort(7, {
      payload: {
        answer: 'B',
        confidence: 0.42,
        questionType: 'multiple-choice',
        reasoning: 'Test',
      },
      type: 'ANSWER_READY',
    })

    expect(delivered).toBe(false)
  })
})
