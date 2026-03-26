import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
Object.assign(globalThis, { fetch: mockFetch })

const {
  invalidateProviderStatusCache,
  listVisionModels,
  pullOllamaModel,
  testProviderConnection,
} = await import('../provider-service')

describe('provider-service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockFetch.mockReset()
    vi.useRealTimers()
    invalidateProviderStatusCache()
  })

  it('lists provider models via the configured provider', async () => {
    const provider = {
      isAvailable: vi.fn(async () => true),
      listVisionModels: vi.fn(async () => ['qwen2.5vl:7b']),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const models = await listVisionModels({
      autoCapture: false,
      captureMode: 'fullpage',
      keyboardShortcut: 'Alt+Q',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'ollama',
      llmTimeoutMs: 30000,
    })

    expect(models).toEqual(['qwen2.5vl:7b'])
    expect(provider.listVisionModels).toHaveBeenCalledOnce()
  })

  it('tests provider availability and reports connection failures cleanly', async () => {
    const provider = {
      isAvailable: vi.fn(async () => false),
      listVisionModels: vi.fn(async () => []),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const result = await testProviderConnection({
      autoCapture: false,
      captureMode: 'fullpage',
      keyboardShortcut: 'Alt+Q',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'ollama',
      llmTimeoutMs: 30000,
    })

    expect(result.available).toBe(false)
    expect(result.errorMessage).toContain('Server not available')
    expect(result.providerStatus).toBe('unavailable')
  })

  it('pulls Ollama models through the background worker', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
    })

    await pullOllamaModel(
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
      'moondream:1.8b',
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/pull',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('times out provider availability checks instead of hanging forever', async () => {
    vi.useFakeTimers()

    const provider = {
      isAvailable: vi.fn(() => new Promise<boolean>(() => undefined)),
      listVisionModels: vi.fn(async () => []),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const resultPromise = testProviderConnection({
      autoCapture: false,
      captureMode: 'fullpage',
      keyboardShortcut: 'Alt+Q',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'ollama',
      llmTimeoutMs: 30000,
    })

    await vi.advanceTimersByTimeAsync(3000)

    await expect(resultPromise).resolves.toMatchObject({
      available: false,
      errorMessage: expect.stringContaining('timed out'),
      providerStatus: 'timed_out',
    })
  })

  it('marks the provider as misconfigured when the configured model is not offered by the endpoint', async () => {
    const provider = {
      isAvailable: vi.fn(async () => true),
      listVisionModels: vi.fn(async () => ['gpt-4o-mini', 'gpt-4.1-mini']),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const result = await testProviderConnection({
      autoCapture: false,
      captureMode: 'fullpage',
      keyboardShortcut: 'Alt+Q',
      llmApiKey: 'sk-test',
      llmEndpoint: 'https://api.openai.com',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'openai-compatible',
      llmTimeoutMs: 30000,
    })

    expect(result.available).toBe(false)
    expect(result.providerStatus).toBe('misconfigured')
    expect(result.errorMessage).toContain('qwen2.5vl:7b')
    expect(result.errorMessage).toContain('api.openai.com')
  })

  it('caches provider health checks for repeated status reads', async () => {
    const provider = {
      isAvailable: vi.fn(async () => true),
      listVisionModels: vi.fn(async () => []),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const config = {
      autoCapture: false,
      captureMode: 'fullpage' as const,
      keyboardShortcut: 'Alt+Q',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'ollama' as const,
      llmTimeoutMs: 30000,
    }

    await testProviderConnection(config)
    await testProviderConnection(config)

    expect(provider.isAvailable).toHaveBeenCalledTimes(1)
  })

  it('bypasses the cache when a forced refresh is requested', async () => {
    const provider = {
      isAvailable: vi.fn(async () => true),
      listVisionModels: vi.fn(async () => []),
    }
    vi.spyOn(await import('../../llm/factory'), 'createProvider').mockReturnValue(
      provider as never,
    )

    const config = {
      autoCapture: false,
      captureMode: 'fullpage' as const,
      keyboardShortcut: 'Alt+Q',
      llmApiKey: '',
      llmEndpoint: 'http://localhost:11434',
      llmModel: 'qwen2.5vl:7b',
      llmProvider: 'ollama' as const,
      llmTimeoutMs: 30000,
    }

    await testProviderConnection(config)
    await testProviderConnection(config, { forceRefresh: true })

    expect(provider.isAvailable).toHaveBeenCalledTimes(2)
  })
})
