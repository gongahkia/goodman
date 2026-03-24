import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from '@providers/ollama';
import type { SummarizeOptions } from '@providers/types';

const BASE_URL = 'http://localhost:11434';

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validOllamaResponse() {
  return {
    message: {
      role: 'assistant',
      content: JSON.stringify({
        summary: 'Ollama summary.',
        keyPoints: ['Local point'],
        redFlags: [],
        severity: 'low',
      }),
    },
  };
}

function defaultOptions(overrides: Partial<SummarizeOptions> = {}): SummarizeOptions {
  return {
    model: 'llama3.2',
    systemPrompt: 'Analyze this.',
    maxTokens: 256,
    temperature: 0.2,
    ...overrides,
  };
}

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    provider = new OllamaProvider(BASE_URL, 'llama3.2');
  });

  it('successful summarize returns parsed Summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(validOllamaResponse()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('Analyze this document.', defaultOptions());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.summary).toBe('Ollama summary.');
    expect(result.data.keyPoints).toEqual(['Local point']);
    expect(result.data.severity).toBe('low');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/chat`,
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe('llama3.2');
    expect(body.stream).toBe(false);
    expect(body.format).toBe('json');
    expect(body.messages).toEqual([
      { role: 'system', content: 'Analyze this.' },
      { role: 'user', content: 'Analyze this document.' },
    ]);
  });

  it('connection refused returns NetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NETWORK_ERROR');
  });

  it('non-ok status returns ProviderError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'model not found' }, 404));
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.summarize('prompt', defaultOptions());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PROVIDER_ERROR');
  });

  it('validateApiKey returns true when models are available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'llama3.2' }, { name: 'mistral' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('');
    expect(valid).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(`${BASE_URL}/api/tags`);
  });

  it('validateApiKey returns false when no models available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ models: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('');
    expect(valid).toBe(false);
  });

  it('validateApiKey returns false on connection failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const valid = await provider.validateApiKey('');
    expect(valid).toBe(false);
  });

  it('listModels returns model names from /api/tags', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'llama3.2' }, { name: 'codellama' }] })
    );
    vi.stubGlobal('fetch', fetchMock);

    const models = await provider.listModels();
    expect(models).toEqual(['llama3.2', 'codellama']);
  });

  it('listModels returns empty array on failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);

    const models = await provider.listModels();
    expect(models).toEqual([]);
  });
});
