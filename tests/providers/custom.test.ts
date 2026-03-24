import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomEndpointProvider } from '@providers/custom';
import type { SummarizeOptions } from '@providers/types';

const ENDPOINT = 'https://my-llm.example.com';

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validOpenAIResponse() {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: JSON.stringify({
          summary: 'Custom summary.',
          keyPoints: ['Custom point'],
          redFlags: [],
          severity: 'medium',
        }),
      },
    }],
  };
}

function defaultOptions(overrides: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    model: 'my-model',
    systemPrompt: 'Analyze this.',
    maxTokens: 256,
    temperature: 0.2,
    ...overrides,
  };
}

describe('CustomEndpointProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('successful summarize returns parsed Summary', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, 'bearer-token', 'my-model');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validOpenAIResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('Analyze this document.', defaultOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toBe('Custom summary.');
    expect(result.data.severity).toBe('medium');

    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/v1/chat/completions`,
      expect.objectContaining({ method: 'POST' })
    );
    const reqInit = fetchMock.mock.calls[0]?.[1];
    expect(reqInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer bearer-token',
    });
    const body = JSON.parse(String(reqInit.body));
    expect(body.model).toBe('my-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'Analyze this.' },
      { role: 'user', content: 'Analyze this document.' },
    ]);
  });

  it('works without API key (no Authorization header)', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, '', 'my-model');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validOpenAIResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());
    expect(result.ok).toBe(true);

    const reqInit = fetchMock.mock.calls[0]?.[1];
    expect(reqInit.headers).not.toHaveProperty('Authorization');
  });

  it('500 retries then returns ProviderError', async () => {
    vi.useFakeTimers();
    const provider = new CustomEndpointProvider(ENDPOINT, 'key', 'model');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'server error' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = provider.summarize('prompt', defaultOptions());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROVIDER_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('429 retries then returns RateLimitError', async () => {
    vi.useFakeTimers();
    const provider = new CustomEndpointProvider(ENDPOINT, 'key', 'model');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = provider.summarize('prompt', defaultOptions());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMIT');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('network error returns NetworkError', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, 'key', 'model');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });

  it('validateApiKey returns true when models endpoint responds ok', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, '', 'model');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('my-key');
    expect(valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      `${ENDPOINT}/v1/models`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Authorization': 'Bearer my-key' }),
      })
    );
  });

  it('validateApiKey falls back to chat completions when models endpoint fails', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, '', 'my-model');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404)) // /v1/models
      .mockResolvedValueOnce(jsonResponse({}, 200)); // /v1/chat/completions
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('my-key');
    expect(valid).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${ENDPOINT}/v1/chat/completions`);
  });

  it('validateApiKey returns false when both endpoints fail', async () => {
    const provider = new CustomEndpointProvider(ENDPOINT, '', 'model');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('bad-key');
    expect(valid).toBe(false);
  });
});
