import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@shared/result';
import { InvalidResponseError } from '@shared/errors';
import type { Summary, LLMProvider, SummarizeOptions } from '@providers/types';
import { MAX_HOSTED_SINGLE_REQUEST_CHARS } from '@shared/constants';

const mockSingleShot = vi.fn();
const mockSingleShotWithProvider = vi.fn();
const mockGetActiveProvider = vi.fn();
const mockGetProviderByName = vi.fn();

vi.mock('@summarizer/singleshot', () => ({
  singleShotSummarize: (...args: unknown[]) => mockSingleShot(...args),
  singleShotSummarizeWithProvider: (...args: unknown[]) => mockSingleShotWithProvider(...args),
}));

vi.mock('@providers/factory', () => ({
  getActiveProvider: () => mockGetActiveProvider(),
  getProviderByName: (name: string) => mockGetProviderByName(name),
}));

import { chunkedSummarize, chunkedSummarizeWithProvider } from '@summarizer/chunked';

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    summary: 'chunk summary',
    keyPoints: ['kp1'],
    redFlags: [{
      category: 'data_selling',
      description: 'sells data',
      severity: 'high',
      quote: 'we sell',
    }],
    severity: 'high',
    ...overrides,
  };
}

function makeMockProvider(summarizeResult = ok(makeSummary())): LLMProvider {
  return {
    name: 'mock',
    summarize: vi.fn().mockResolvedValue(summarizeResult),
    validateApiKey: vi.fn().mockResolvedValue(true),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('chunkedSummarize', () => {
  it('single chunk delegates to singleShotSummarize', async () => {
    const summary = makeSummary();
    mockSingleShot.mockResolvedValue(ok(summary));
    const result = await chunkedSummarize(['some text']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.summary).toBe('chunk summary');
    expect(mockSingleShot).toHaveBeenCalledOnce();
  });

  it('all chunks fail returns error', async () => {
    mockSingleShot.mockResolvedValue(err(new InvalidResponseError('fail')));
    const result = await chunkedSummarize(['chunk1', 'chunk2']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('All chunk summaries failed');
  });

  it('multi-chunk runs map phase in batches', async () => {
    const s = makeSummary();
    mockSingleShot.mockResolvedValue(ok(s));
    mockGetActiveProvider.mockResolvedValue(ok(makeMockProvider(ok(makeSummary({ summary: 'merged' })))));
    const chunks = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const result = await chunkedSummarize(chunks);
    expect(mockSingleShot).toHaveBeenCalledTimes(5);
    expect(result.ok).toBe(true);
  });

  it('reduce phase merges summaries', async () => {
    const s1 = makeSummary({ summary: 'part one', keyPoints: ['a'] });
    const s2 = makeSummary({ summary: 'part two', keyPoints: ['b'] });
    mockSingleShot
      .mockResolvedValueOnce(ok(s1))
      .mockResolvedValueOnce(ok(s2));
    const merged = makeSummary({ summary: 'merged result' });
    mockGetActiveProvider.mockResolvedValue(ok(makeMockProvider(ok(merged))));
    const result = await chunkedSummarize(['c1', 'c2']);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.summary).toBe('merged result');
  });
});

describe('chunkedSummarizeWithProvider (hosted)', () => {
  it('hosted provider with small text uses single request', async () => {
    const small = 'x'.repeat(100);
    const summary = makeSummary();
    mockSingleShotWithProvider.mockResolvedValue(ok(summary));
    const result = await chunkedSummarizeWithProvider([small], 'hosted');
    expect(mockSingleShotWithProvider).toHaveBeenCalledWith(
      small,
      'hosted',
      undefined,
      undefined
    );
    expect(result.ok).toBe(true);
  });

  it('hosted provider with large text falls through to map-reduce', async () => {
    const large = 'x'.repeat(MAX_HOSTED_SINGLE_REQUEST_CHARS + 1);
    const s = makeSummary();
    mockSingleShotWithProvider.mockResolvedValue(ok(s));
    mockGetProviderByName.mockResolvedValue(ok(makeMockProvider(ok(makeSummary({ summary: 'reduced' })))));
    const result = await chunkedSummarizeWithProvider([large.slice(0, large.length / 2), large.slice(large.length / 2)], 'hosted');
    expect(result.ok).toBe(true);
    // should have called singleShotWithProvider for each chunk in map phase
    expect(mockSingleShotWithProvider.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
