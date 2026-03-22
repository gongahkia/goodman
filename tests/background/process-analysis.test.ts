import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '@shared/errors';
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
    )['3'];
    expect(storedRecord.status).toBe('needs_provider');
  });
});
