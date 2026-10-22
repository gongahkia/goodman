import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, ProviderError } from '@shared/errors';
import type { Summary } from '@providers/types';
import { mockStorage, chrome } from '../mocks/chrome';

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
import { cacheSummary, computeTextHash, getCachedSummary } from '@summarizer/cache';
import { chunkedSummarizeWithProvider } from '@summarizer/chunked';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { cancelPageAnalysis, processPageAnalysis } from '@background/process-analysis';

const mockSummary: Summary = {
  summary: 'A summary.',
  keyPoints: ['Point one'],
  redFlags: [],
  severity: 'low',
};

describe('processPageAnalysis', () => {
  it('does not let a cancellation for an old URL abort the current route', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    let finish!: (value: { ok: true; data: Summary }) => void;
    vi.mocked(singleShotSummarizeWithProvider).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const run = processPageAnalysis({
      tabId: 77,
      url: 'https://example.com/current',
      domain: 'example.com',
      text: 'Current legal agreement.',
      provider: 'openai',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 1,
    });
    await vi.waitFor(() => expect(singleShotSummarizeWithProvider).toHaveBeenCalledOnce());
    const cancelled = await cancelPageAnalysis(77, 'https://example.com/old');
    finish({ ok: true, data: mockSummary });
    expect(cancelled).toBe(false);
    expect((await run).ok).toBe(true);
  });

  it('does not overwrite a new run when cancellation storage reads finish late', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    let finishOld!: (value: { ok: true; data: Summary }) => void;
    vi.mocked(singleShotSummarizeWithProvider)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValueOnce({ ok: true, data: { ...mockSummary, summary: 'new result' } });
    const input = {
      tabId: 78,
      url: 'https://example.com/raced-cancel',
      domain: 'example.com',
      text: 'Old legal agreement.',
      provider: 'openai',
      sourceType: 'inline' as const,
      detectionType: 'checkbox' as const,
      confidence: 1,
    };
    const oldRun = processPageAnalysis(input);
    await vi.waitFor(() => expect(singleShotSummarizeWithProvider).toHaveBeenCalledOnce());
    let releaseRead!: () => void;
    const snapshot = mockStorage.pageAnalysis;
    chrome.storage.local.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRead = () => resolve({ pageAnalysis: snapshot });
        })
    );
    const cancellation = cancelPageAnalysis(input.tabId, input.url);
    await processPageAnalysis({ ...input, text: 'New legal agreement.' });
    releaseRead();
    await cancellation;
    finishOld({ ok: true, data: mockSummary });
    await oldRun;
    expect(
      (mockStorage.pageAnalysis as Record<string, { summary: Summary; status: string }>)[input.url]
    ).toMatchObject({ status: 'ready', summary: { summary: 'new result' } });
  });

  it('keeps the newer ready result when an older cancelled provider resolves late', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'custom',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    let finishOld!: (value: { ok: true; data: Summary }) => void;
    vi.mocked(singleShotSummarizeWithProvider)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          })
      )
      .mockResolvedValueOnce({ ok: true, data: { ...mockSummary, summary: 'new current result' } });
    const input = {
      tabId: 41,
      url: 'https://synthetic.test/terms',
      domain: 'synthetic.test',
      text: 'old terms',
      provider: 'custom',
      sourceType: 'inline' as const,
      detectionType: 'checkbox' as const,
      confidence: 1,
    };
    const oldRun = processPageAnalysis(input);
    await vi.waitFor(() => expect(singleShotSummarizeWithProvider).toHaveBeenCalledOnce());
    await processPageAnalysis({ ...input, text: 'new terms' });
    finishOld({ ok: true, data: mockSummary });
    await oldRun;
    const stored = (
      mockStorage.pageAnalysis as Record<string, { status: string; summary: Summary }>
    )[input.url];
    expect(stored.status).toBe('ready');
    expect(stored.summary.summary).toBe('new current result');
  });

  it('rejects oversized terms instead of silently omitting the final clauses', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'custom',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(chunkedSummarizeWithProvider).mockResolvedValue({ ok: true, data: mockSummary });
    vi.mocked(singleShotSummarizeWithProvider).mockResolvedValue({ ok: true, data: mockSummary });
    const input = {
      tabId: 42,
      url: 'https://synthetic.test/large',
      domain: 'synthetic.test',
      text: 'a'.repeat(500001),
      provider: 'custom',
      sourceType: 'linked' as const,
      detectionType: 'checkbox' as const,
      confidence: 1,
    };
    const result = await processPageAnalysis(input);
    expect(result.ok).toBe(false);
    expect(input.text).toHaveLength(500001);
    expect(chunkedSummarizeWithProvider).not.toHaveBeenCalled();
    expect(singleShotSummarizeWithProvider).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
    vi.mocked(computeTextHash).mockResolvedValue('hash-1');
    mockStorage.settings = {
      activeProvider: 'openai',
      providers: {
        openai: { apiKey: 'synthetic-key', model: 'synthetic-model' },
        custom: { apiKey: '', model: 'synthetic-model', baseUrl: 'https://synthetic.invalid' },
      },
    };
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: { name: 'openai', summarize: vi.fn(), validateApiKey: vi.fn() },
    });
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
    expect(cacheSummary).toHaveBeenCalledWith('hash-1', mockSummary, 'example.com', 'hash-1');

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

    const storedRecord = (mockStorage.pageAnalysis as Record<string, { status: string }>)[
      'https://example.com'
    ];
    expect(storedRecord.status).toBe('needs_provider');
  });

  it('cancels an active analysis before the provider returns', async () => {
    vi.mocked(getCachedSummary).mockResolvedValue(null);
    vi.mocked(getProviderByName).mockResolvedValue({
      ok: true,
      data: {
        name: 'openai',
        summarize: vi.fn(),
        validateApiKey: vi.fn(),
      },
    });
    vi.mocked(singleShotSummarizeWithProvider).mockImplementation(
      async (_text, _providerName, _metadata, signal) =>
        new Promise((resolve) => {
          signal?.addEventListener(
            'abort',
            () => resolve({ ok: false, error: new CancelledError() }),
            { once: true }
          );
        })
    );

    const resultPromise = processPageAnalysis({
      tabId: 15,
      url: 'https://example.com/cancelled',
      domain: 'example.com',
      text: 'short legal text',
      provider: 'openai',
      sourceType: 'inline',
      detectionType: 'checkbox',
      confidence: 0.9,
    });

    await Promise.resolve();
    await Promise.resolve();

    const cancelled = await cancelPageAnalysis(15);
    const result = await resultPromise;

    expect(cancelled).toBe(true);
    expect(result).toEqual({
      ok: false,
      error: 'Analysis cancelled.',
      cancelled: true,
    });

    const storedRecord = (
      mockStorage.pageAnalysis as Record<string, { status: string; progressLabel: string }>
    )['https://example.com/cancelled'];
    expect(storedRecord.status).toBe('cancelled');
    expect(storedRecord.progressLabel).toBe('Cancelled');
  });
});
