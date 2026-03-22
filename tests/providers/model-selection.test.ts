import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProviderByName } from '@providers/factory';
import type { Settings } from '@shared/messages';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { mockStorage } from '../mocks/chrome';

const summarizeOptions = {
  model: '',
  systemPrompt: 'Summarize this legal text.',
  maxTokens: 256,
  temperature: 0.2,
};

describe('provider model selection', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.restoreAllMocks();
  });

  it('uses the configured OpenAI model in the request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: validSummaryJson(),
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = createSettings({
      openai: {
        apiKey: 'sk-openai',
        model: 'gpt-4.1-mini-configured',
      },
    });

    const providerResult = await getProviderByName('openai');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('legal text', summarizeOptions);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe('gpt-4.1-mini-configured');
  });

  it('uses the configured Gemini model in the request URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: validSummaryJson() }],
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = createSettings({
      gemini: {
        apiKey: 'gemini-key',
        model: 'gemini-2.5-pro-configured',
      },
    });

    const providerResult = await getProviderByName('gemini');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('legal text', summarizeOptions);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/models/gemini-2.5-pro-configured:generateContent'
    );
  });

  it('uses the configured Ollama model in the request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        message: {
          content: validSummaryJson(),
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = createSettings({
      ollama: {
        apiKey: '',
        model: 'llama3.1:8b-instruct-q4',
        baseUrl: 'http://localhost:11434',
      },
    });

    const providerResult = await getProviderByName('ollama');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('legal text', summarizeOptions);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe('llama3.1:8b-instruct-q4');
  });

  it('uses the configured custom model in the request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: validSummaryJson(),
            },
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = createSettings({
      custom: {
        apiKey: 'custom-key',
        model: 'my-custom-model',
        baseUrl: 'https://example.test',
      },
    });

    const providerResult = await getProviderByName('custom');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('legal text', summarizeOptions);

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.model).toBe('my-custom-model');
  });

  it('treats missing provider credentials as unconfigured', async () => {
    mockStorage.settings = createSettings({
      openai: {
        apiKey: '',
        model: 'gpt-4o',
      },
    });

    const providerResult = await getProviderByName('openai');

    expect(providerResult.ok).toBe(false);
    if (providerResult.ok) return;
    expect(providerResult.error.message).toContain('Missing provider configuration');
  });
});

function createSettings(
  overrides: Partial<Settings['providers']>
): Settings {
  return {
    ...DEFAULT_SETTINGS,
    providers: {
      ...DEFAULT_SETTINGS.providers,
      ...overrides,
    },
  };
}

function jsonResponse(json: unknown): Response {
  return new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validSummaryJson(): string {
  return JSON.stringify({
    summary: 'A short summary.',
    keyPoints: ['One point'],
    redFlags: [],
    severity: 'low',
  });
}
