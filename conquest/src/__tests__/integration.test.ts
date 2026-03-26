import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome APIs
const mockStorage: Record<string, unknown> = {}

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') return { [keys]: mockStorage[keys] }
        const result: Record<string, unknown> = {}
        for (const key of keys) result[key] = mockStorage[key]
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items)
      }),
    },
  },
  tabs: {
    captureVisibleTab: vi.fn(async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='),
    query: vi.fn(async () => [{ id: 1, url: 'https://kahoot.it/game/123' }]),
    sendMessage: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ id: 1, url: 'https://kahoot.it/game/123' })),
  },
  action: {
    setBadgeText: vi.fn(async () => undefined),
    setBadgeBackgroundColor: vi.fn(async () => undefined),
  },
  runtime: {
    sendMessage: vi.fn(async () => undefined),
  },
}

Object.assign(globalThis, { chrome: mockChrome })

// Mock fetch for LLM responses
const mockLlmResponse = {
  response: JSON.stringify({
    answer: 'B: Mitochondria',
    confidence: 0.87,
    reasoning: 'The mitochondria is the powerhouse of the cell',
    questionType: 'multiple-choice',
  }),
}

const mockFetch = vi.fn(async (url: string) => {
  if (typeof url === 'string' && url.includes('/api/tags')) {
    return {
      ok: true,
      json: async () => ({
        models: [{ name: 'qwen2.5vl:7b', details: { families: ['qwen25vl'] } }],
      }),
    }
  }
  if (typeof url === 'string' && url.includes('/api/generate')) {
    return {
      ok: true,
      json: async () => mockLlmResponse,
    }
  }
  return { ok: false, status: 404, statusText: 'Not Found' }
}) as unknown as typeof fetch

Object.assign(globalThis, { fetch: mockFetch })

// Import modules after mocking
const { detectPlatform } = await import('../detect/platform')
const { createProvider } = await import('../llm/factory')
const { withRetry } = await import('../llm/retry')
const { handleError, AgentError, ErrorCode } = await import('../lib/error-handler')
const { getConfig, appendLog, getSessionLog, clearSessionLog } = await import('../lib/storage')

describe('integration: full pipeline', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    vi.clearAllMocks()
  })

  it('end-to-end: detects platform, creates provider, analyzes, parses', async () => {
    // Detect platform
    const { platform, hints } = detectPlatform('https://kahoot.it/game/123')
    expect(platform).toBe('kahoot')

    // Get config
    const config = await getConfig()
    expect(config.llmProvider).toBe('ollama')

    // Create provider
    const provider = createProvider(config)
    expect(provider.name).toBe('ollama')

    // Check availability
    const available = await provider.isAvailable()
    expect(available).toBe(true)

    // Analyze image with retry
    const prompt = `Analyze this quiz screenshot. ${hints}`
    const analysis = await withRetry(
      () => provider.analyzeImage({ base64: 'base64data', mimeType: 'image/jpeg' }, prompt),
      { maxRetries: 2, baseDelayMs: 100, backoffMultiplier: 2 },
    )
    const answer = analysis.answer

    expect(answer.answer).toBe('B: Mitochondria')
    expect(answer.confidence).toBe(0.87)
    expect(answer.questionType).toBe('multiple-choice')

    // Log the answer
    await appendLog({
      answer,
      platform,
      timestamp: Date.now(),
    })

    const log = await getSessionLog()
    expect(log).toHaveLength(1)
    expect(log[0]!.answer?.answer).toBe('B: Mitochondria')
  })

  it('handles LLM error gracefully', async () => {
    // Mock fetch to fail
    ;(mockFetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new TypeError('fetch failed')
    })

    const error = handleError(new TypeError('fetch failed'))
    expect(error).toBeInstanceOf(AgentError)
    expect(error.code).toBe(ErrorCode.LlmUnavailable)
    expect(error.userMessage).toContain('LLM endpoint unreachable')
  })

  it('handles timeout error', () => {
    const abortError = new DOMException('signal is aborted', 'AbortError')
    const error = handleError(abortError)
    expect(error.code).toBe(ErrorCode.LlmTimeout)
    expect(error.userMessage).toContain('LLM timeout')
  })

  it('retry does not retry 4xx errors', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      const err = new Error('Bad request')
      Object.assign(err, { status: 400 })
      throw err
    }

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 10, backoffMultiplier: 2 }),
    ).rejects.toThrow('Bad request')
    expect(attempts).toBe(1) // No retries
  })

  it('retry succeeds on second attempt', async () => {
    let attempts = 0
    const fn = async () => {
      attempts++
      if (attempts === 1) {
        const err = new Error('Server error')
        Object.assign(err, { status: 500 })
        throw err
      }
      return 'success'
    }

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 10, backoffMultiplier: 2 })
    expect(result).toBe('success')
    expect(attempts).toBe(2)
  })

  it('session log clears properly', async () => {
    await appendLog({
      answer: { answer: 'A', confidence: 0.9, reasoning: '', questionType: 'mc' },
      platform: 'generic',
      timestamp: 1000,
    })
    expect((await getSessionLog())).toHaveLength(1)

    await clearSessionLog()
    expect((await getSessionLog())).toHaveLength(0)
  })
})
