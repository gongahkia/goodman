import { beforeEach, describe, expect, it, vi } from 'vitest';
import { processPageAnalysis } from '@background/process-analysis';
import {
  cacheSummary,
  clearCache,
  getCachedSummary,
  getCacheStats,
  pruneCache,
} from '@summarizer/cache';
import { mockStorage, chrome } from '../mocks/chrome';

const summary = {
  summary: 'Synthetic result.',
  keyPoints: [],
  redFlags: [],
  severity: 'low' as const,
};
const input = {
  tabId: 701,
  url: 'https://synthetic.test/terms',
  domain: 'synthetic.test',
  text: 'Terms and Conditions require recurring billing and allow cancellation before renewal.',
  provider: 'custom',
  sourceType: 'inline' as const,
  detectionType: 'checkbox' as const,
  confidence: 1,
};
let requests: Array<{
  url: string;
  body: { model: string; messages: Array<{ content: string }> };
  authorization: string | null;
}>;

function settings(
  model = 'original-model',
  apiKey = 'synthetic-secret',
  baseUrl = 'https://provider.invalid'
) {
  return { activeProvider: 'custom', providers: { custom: { model, apiKey, baseUrl } } };
}

beforeEach(() => {
  requests = [];
  mockStorage.settings = settings();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({
        url,
        body: JSON.parse(init.body as string),
        authorization: new Headers(init.headers).get('Authorization'),
      });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(summary) } }] })
      );
    })
  );
});

describe('analysis cache identity', () => {
  it('reuses identical requests but invalidates model, language, credentials and endpoint changes', async () => {
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(1);
    mockStorage.settings = settings('new-model');
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests.at(-1)?.body.model).toBe('new-model');
    mockStorage.domainPreferences = { 'synthetic.test': { summaryLanguage: 'French' } };
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(3);
    expect(requests.at(-1)?.body.messages[0]?.content).toContain('French');
    mockStorage.settings = settings('new-model', 'different-synthetic-secret');
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(4);
    mockStorage.settings = settings(
      'new-model',
      'different-synthetic-secret',
      'https://other.invalid'
    );
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests).toHaveLength(5);
    expect(requests.at(-1)?.url).toBe('https://other.invalid/v1/chat/completions');
    expect(JSON.stringify(mockStorage.cache)).not.toContain('synthetic-secret');
    expect(JSON.stringify(mockStorage.cache)).not.toContain('other.invalid');
  });

  it('does not bypass missing provider configuration with a previously cached result', async () => {
    expect((await processPageAnalysis(input)).ok).toBe(true);
    mockStorage.settings = { activeProvider: 'custom', providers: {} };
    expect((await processPageAnalysis(input)).ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('uses one provider and language snapshot for every chunk and its merge', async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        const response = await originalFetch(url, init);
        mockStorage.settings = settings(
          'changed-mid-analysis',
          'changed-secret',
          'https://changed.invalid'
        );
        mockStorage.domainPreferences = { 'synthetic.test': { summaryLanguage: 'French' } };
        return response;
      })
    );
    const result = await processPageAnalysis({
      ...input,
      text: 'Terms require binding arbitration. '.repeat(2600),
    });
    expect(result.ok).toBe(true);
    expect(requests.length).toBeGreaterThan(3);
    for (const request of requests) {
      expect(request.url).toBe('https://provider.invalid/v1/chat/completions');
      expect(request.body.model).toBe('original-model');
      expect(request.authorization).toBe('Bearer synthetic-secret');
      expect(request.body.messages[0]?.content).not.toContain('in French');
    }
    expect((await processPageAnalysis(input)).ok).toBe(true);
    expect(requests.at(-1)?.body.model).toBe('changed-mid-analysis');
  });

  it('rejects a legacy cache entry belonging to another domain', async () => {
    mockStorage.cache = {
      legacy: { summary, domain: 'other.test', textHash: 'legacy', timestamp: Date.now() },
    };
    expect(await getCachedSummary('legacy', 'synthetic.test')).toBeNull();
  });

  it('ignores corrupt cache entries and repairs them during pruning', async () => {
    const malformed = [
      null,
      [],
      'bad',
      { summary: null, timestamp: Date.now() },
      { summary, domain: 'synthetic.test', textHash: 'bad', timestamp: 'invalid' },
    ];
    for (const value of malformed) {
      mockStorage.cache = { 'synthetic.test:bad': value };
      expect(await getCachedSummary('bad', 'synthetic.test')).toBeNull();
      await expect(pruneCache()).resolves.toBeUndefined();
      expect((await getCacheStats()).count).toBe(0);
    }
    mockStorage.cache = 'corrupt top-level value';
    await cacheSummary('new', summary, 'synthetic.test');
    expect((await getCacheStats()).count).toBe(1);
  });

  it('reports a failed cache clear rather than claiming deletion succeeded', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('synthetic storage failure'));
    await expect(clearCache()).rejects.toThrow('synthetic storage failure');
  });
});
