import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
Object.assign(globalThis, { fetch: mockFetch })

const { OllamaProvider } = await import('../ollama')
const { OpenAICompatProvider } = await import('../openai-compat')

describe('vision providers', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('shapes Ollama requests for low-latency live answers', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: '{"answer":"B","confidence":0.44,"reasoning":"Fast guess","questionType":"multiple-choice"}',
      }),
    })

    const provider = new OllamaProvider('http://localhost:11434', 'qwen2.5vl:7b')
    const result = await provider.analyzeImage(
      { base64: 'base64data', mimeType: 'image/jpeg' },
      'Prompt text',
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({
        body: expect.stringContaining('"num_predict":64'),
        method: 'POST',
      }),
    )
    expect(result.provider).toBe('ollama')
    expect(result.model).toBe('qwen2.5vl:7b')
    expect(result.parseStrategy).toBe('json')
    expect(result.answer.answer).toBe('B')
  })

  it('bounds OpenAI-compatible responses for speed-first mode', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'Answer: Mercury\nConfidence: 0.25\nReasoning: It is the closest planet to the sun.',
          },
        }],
      }),
    })

    const provider = new OpenAICompatProvider('http://localhost:1234', 'local-vlm')
    const result = await provider.analyzeImage(
      { base64: 'base64data', mimeType: 'image/jpeg' },
      'Prompt text',
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1234/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"max_tokens":220'),
        method: 'POST',
      }),
    )
    expect(result.provider).toBe('openai-compatible')
    expect(result.model).toBe('local-vlm')
    expect(result.parseStrategy).toBe('labeled-text')
    expect(result.answer.answer).toBe('Mercury')
  })

  it('adds bearer auth for hosted OpenAI-compatible APIs when an API key is configured', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-4o-mini' }],
      }),
    })

    const provider = new OpenAICompatProvider('https://api.openai.com', 'gpt-4o-mini', 'sk-test')
    const models = await provider.listVisionModels()

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer sk-test',
        }),
      }),
    )
    expect(models).toEqual(['gpt-4o-mini'])
  })

  it('surfaces provider error details for hosted OpenAI-compatible failures', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: '',
      clone: () => ({
        json: async () => ({
          error: {
            message: 'The model `qwen2.5vl:7b` does not exist.',
          },
        }),
      }),
      text: async () => '',
    })

    const provider = new OpenAICompatProvider('https://api.openai.com', 'qwen2.5vl:7b', 'sk-test')

    await expect(
      provider.analyzeImage({ base64: 'base64data', mimeType: 'image/jpeg' }, 'Prompt text'),
    ).rejects.toThrow('The model `qwen2.5vl:7b` does not exist.')
  })

  it('retries hosted OpenAI-compatible requests with max_completion_tokens when max_tokens is rejected', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: '',
        clone: () => ({
          json: async () => ({
            error: {
              message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            },
          }),
        }),
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: '{"answer":"12","confidence":0.52,"reasoning":"Solved from the image.","questionType":"open-ended"}',
            },
          }],
        }),
      })

    const provider = new OpenAICompatProvider('https://api.openai.com', 'o4-mini', 'sk-test')
    const result = await provider.analyzeImage(
      { base64: 'base64data', mimeType: 'image/jpeg' },
      'Prompt text',
    )

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
      body: expect.stringContaining('"max_tokens":220'),
    })
    expect(mockFetch.mock.calls[1]?.[1]).toMatchObject({
      body: expect.stringContaining('"max_completion_tokens":220'),
    })
    expect(String(mockFetch.mock.calls[1]?.[1]?.body ?? '')).not.toContain('"max_tokens":220')
    expect(result.answer.answer).toBe('12')
  })
})
