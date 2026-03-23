import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProviderByName } from '@providers/factory';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { mockStorage } from '../mocks/chrome';

describe('hosted provider', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.restoreAllMocks();
  });

  it('sends raw text and metadata to the hosted analyze endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        summary: validSummary(),
        model: 'tc-guard-cloud',
        requestId: 'req-1',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = {
      ...DEFAULT_SETTINGS,
      activeProvider: 'hosted',
      hostedConsentAccepted: true,
      providers: {
        ...DEFAULT_SETTINGS.providers,
        hosted: {
          apiKey: '',
          model: 'tc-guard-cloud',
          baseUrl: 'https://cloud.example.test',
        },
      },
    };

    const providerResult = await getProviderByName('hosted');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('Formatted prompt', {
      model: '',
      systemPrompt: 'ignored',
      maxTokens: 256,
      temperature: 0.2,
      rawText: 'Raw terms text',
      metadata: {
        url: 'https://example.com/checkout',
        domain: 'example.com',
        sourceType: 'inline',
        detectionType: 'checkbox',
        clientVersion: '1.0.0-test',
      },
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://cloud.example.test/v1/analyze',
      expect.objectContaining({
        method: 'POST',
      })
    );
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toEqual({
      text: 'Raw terms text',
      url: 'https://example.com/checkout',
      domain: 'example.com',
      sourceType: 'inline',
      detectionType: 'checkbox',
      clientVersion: '1.0.0-test',
    });
  });

  it('maps hosted 503 responses to service unavailable errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Hosted analysis is down.',
            retryable: true,
          },
          requestId: 'req-2',
        },
        503
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    mockStorage.settings = {
      ...DEFAULT_SETTINGS,
      activeProvider: 'hosted',
      hostedConsentAccepted: true,
    };

    const providerResult = await getProviderByName('hosted');
    expect(providerResult.ok).toBe(true);
    if (!providerResult.ok) return;

    const result = await providerResult.data.summarize('prompt', {
      model: '',
      systemPrompt: 'ignored',
      maxTokens: 256,
      temperature: 0.2,
      rawText: 'Raw terms text',
      metadata: {
        url: 'https://example.com/checkout',
        domain: 'example.com',
        sourceType: 'inline',
        detectionType: 'checkbox',
        clientVersion: '1.0.0-test',
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

function jsonResponse(json: unknown, status = 200): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validSummary() {
  return {
    summary: 'A short summary.',
    keyPoints: ['One point'],
    redFlags: [],
    severity: 'low',
  };
}
