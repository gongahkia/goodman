import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaudeProvider } from '@providers/claude';
import type { SummarizeOptions } from '@providers/types';

const API_URL = 'https://api.anthropic.com/v1/messages';

function jsonResponse(json: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function validClaudeResponse() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        summary: 'A short summary.',
        keyPoints: ['Point one'],
        redFlags: [],
        severity: 'low',
      }),
    }],
  };
}

function defaultOptions(overrides: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    model: 'claude-sonnet-4-20250514',
    systemPrompt: 'Analyze this.',
    maxTokens: 256,
    temperature: 0.2,
    ...overrides,
  };
}

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    provider = new ClaudeProvider('sk-test-key', 'claude-sonnet-4-20250514');
  });

  it('successful summarize returns parsed Summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validClaudeResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('Analyze this document.', defaultOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toBe('A short summary.');
    expect(result.data.keyPoints).toEqual(['Point one']);
    expect(result.data.severity).toBe('low');

    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({ method: 'POST' })
    );
    const reqInit = fetchMock.mock.calls[0]?.[1];
    expect(reqInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-api-key': 'sk-test-key',
      'anthropic-version': '2023-06-01',
    });
    const body = JSON.parse(String(reqInit.body));
    expect(body.model).toBe('claude-sonnet-4-20250514');
    expect(body.messages).toEqual([{ role: 'user', content: 'Analyze this document.' }]);
  });

  it('429 retries then returns RateLimitError', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'rate limited' }, 429, { 'retry-after': '30' })
    );
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
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'internal' }, 500)
    );
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = provider.summarize('prompt', defaultOptions());
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROVIDER_ERROR');
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('network error returns NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });

  it('validateApiKey returns true for non-empty key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 200));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('sk-real-key');
    expect(valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      API_URL,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'sk-real-key' }),
      })
    );
  });

  it('validateApiKey returns false on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('sk-real-key');
    expect(valid).toBe(false);
  });
});
