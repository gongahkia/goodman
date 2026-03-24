import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '@providers/gemini';
import type { SummarizeOptions } from '@providers/types';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validGeminiResponse() {
  return {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            summary: 'Gemini summary.',
            keyPoints: ['Key point'],
            redFlags: [{
              category: 'data_selling',
              description: 'Sells your data',
              severity: 'high',
              quote: 'we sell data',
            }],
            severity: 'high',
          }),
        }],
      },
    }],
  };
}

function defaultOptions(overrides: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    model: 'gemini-1.5-pro',
    systemPrompt: 'Analyze this.',
    maxTokens: 256,
    temperature: 0.2,
    ...overrides,
  };
}

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    provider = new GeminiProvider('gm-test-key', 'gemini-1.5-pro');
  });

  it('successful summarize returns parsed Summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validGeminiResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('Analyze this document.', defaultOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toBe('Gemini summary.');
    expect(result.data.severity).toBe('high');
    expect(result.data.redFlags).toHaveLength(1);
    expect(result.data.redFlags[0].category).toBe('data_selling');

    const expectedUrl = `${BASE_URL}/models/gemini-1.5-pro:generateContent?key=gm-test-key`;
    expect(fetchMock).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.contents).toEqual([{ parts: [{ text: 'Analyze this document.' }] }]);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Analyze this.' }] });
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('429 retries then returns RateLimitError', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'rate limited' }, 429));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = provider.summarize('prompt', defaultOptions());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('RATE_LIMIT');
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('500 retries then returns ProviderError', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'server error' }, 500));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = provider.summarize('prompt', defaultOptions());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROVIDER_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('network error returns NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });

  it('validateApiKey returns true for valid key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ models: [] }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('gm-real-key');
    expect(valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/models?key=gm-real-key`);
  });

  it('validateApiKey returns false on 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('bad-key');
    expect(valid).toBe(false);
  });

  it('validateApiKey returns false on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('gm-key');
    expect(valid).toBe(false);
  });
});
