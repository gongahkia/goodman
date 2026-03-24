import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, ProviderError, RateLimitError } from '@shared/errors';
import type { Summary } from '@providers/types';
import { mockStorage } from '../mocks/chrome';

vi.mock('@providers/factory', () => ({
  getProviderByName: vi.fn(),
}));

vi.mock('@summarizer/cache', () => ({
  cacheSummary: vi.fn(),
  computeTextHash: vi.fn(),
  getCachedSummary: vi.fn(),
}));

vi.mock('@summarizer/chunked', () => ({
  chunkedSummarizeWithProvider: vi.fn(),
}));

vi.mock('@summarizer/singleshot', () => ({
  singleShotSummarizeWithProvider: vi.fn(),
}));

import { getProviderByName } from '@providers/factory';
import {
  cacheSummary,
  computeTextHash,
  getCachedSummary,
} from '@summarizer/cache';
import { chunkedSummarizeWithProvider } from '@summarizer/chunked';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { processPageAnalysis } from '@background/process-analysis';

const mockSummary: Summary = {
  summary: 'A summary.',
  keyPoints: ['Point one'],
  redFlags: [],
  severity: 'low',
};

describe('processPageAnalysis', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
    vi.mocked(computeTextHash).mockResolvedValue('hash-1');
  });

  it('returns cached summaries without calling the provider', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue({
      summary: mockSummary,
      domain: 'example.com',
      textHash: 'hash-1',
      timestamp: Date.now(),
    });

    const result = await processPageAnalysis({
      tabId: 5,
      url: 'https://example.com',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'openai',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.8,
    });

    expect(result).toEqual({ ok: true, data: mockSummary });
    expect(singleShotSummarizeWithProvider).not.toHaveBeenCalled();
    expect(chunkedSummarizeWithProvider).not.toHaveBeenCalled();
  });

  it('uses single-shot summarization for short uncached text', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'openai',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(singleShotSummarizeWithProvider).mockResolvedValue({
      ok: true,
      data: mockSummary,
    });

    const result = await processPageAnalysis({
      tabId: 9,
      url: 'https://example.com',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'openai',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.9,
    });

    expect(result).toEqual({ ok: true, data: mockSummary });
    expect(singleShotSummarizeWithProvider).toHaveBeenCalledOnce();
    expect(cacheSummary).toHaveBeenCalledWith('hash-1', mockSummary, 'example.com');

    const storedRecord = (
      mockStorage.pageAnalysis as Record<
        string,
        { progressPercent?: number | null; progressLogs?: Array<{ message: string }> }
      >
    )['https://example.com'];
    expect(storedRecord.progressPercent).toBe(100);
    expect(storedRecord.progressLogs?.map((log) => log.message)).toContain(
      'Analysis complete. Summary, cache, and version history are up to date.'
    );
  });

  it('uses chunked summarization for long text', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'openai',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(chunkedSummarizeWithProvider).mockResolvedValue({
      ok: true,
      data: mockSummary,
    });

    const longText = Array(1_200)
      .fill('A long paragraph of legal text with enough characters to force chunking.')
      .join('\n\n');
    const result = await processPageAnalysis({
      tabId: 9,
      url: 'https://example.com',
      domain: 'example.com',
      text: longText,
      provider: 'openai',
      sourceType: 'linked',
      detectionType: 'fullpage',
      confidence: 0.95,
    });

    expect(result).toEqual({ ok: true, data: mockSummary });
    expect(chunkedSummarizeWithProvider).toHaveBeenCalledOnce();
  });

  it('persists a needs_provider state when provider configuration is missing', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: false,
      error: new ProviderError('openai', 'Missing provider configuration'),
    });

    const result = await processPageAnalysis({
      tabId: 3,
      url: 'https://example.com',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'openai',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.7,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Try again or switch providers.');

    const storedRecord = (
      mockStorage.pageAnalysis as Record<string, { status: string }>
    )['https://example.com'];
    expect(storedRecord.status).toBe('needs_provider');
  });

  it('maps hosted network failures to a service_unavailable state', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'hosted',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(singleShotSummarizeWithProvider).mockResolvedValue({
      ok: false,
      error: new NetworkError('TC Guard Cloud'),
    });

    const result = await processPageAnalysis({
      tabId: 11,
      url: 'https://example.com/checkout',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'hosted',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.92,
    });

    expect(result.ok).toBe(false);
    const storedRecord = (
      mockStorage.pageAnalysis as Record<string, { status: string; error: string }>
    )['https://example.com/checkout'];
    expect(storedRecord.status).toBe('service_unavailable');
    expect(storedRecord.error).toContain('Could not connect to TC Guard Cloud');
  });

  it('maps hosted rate limits to a service_unavailable state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'hosted',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(singleShotSummarizeWithProvider).mockResolvedValue({
      ok: false,
      error: new RateLimitError('TC Guard Cloud', 30),
    });

    const resultPromise = processPageAnalysis({
      tabId: 12,
      url: 'https://example.com/rate-limited',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'hosted',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.9,
    });

    await vi.advanceTimersByTimeAsync(6000);
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    const storedRecord = (
      mockStorage.pageAnalysis as Record<string, { status: string }>
    )['https://example.com/rate-limited'];
    expect(storedRecord.status).toBe('service_unavailable');
    vi.useRealTimers();
  });
});
