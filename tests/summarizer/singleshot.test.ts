import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@shared/result';
import { ProviderError } from '@shared/errors';
import type { Summary, LLMProvider, SummarizeOptions } from '@providers/types';

const mockGetActiveProvider = vi.fn();
const mockGetProviderByName = vi.fn();

vi.mock('@providers/factory', () => ({
  getActiveProvider: () => mockGetActiveProvider(),
  getProviderByName: (name: string) => mockGetProviderByName(name),
}));

import { singleShotSummarize, singleShotSummarizeWithProvider } from '@summarizer/singleshot';

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    summary: 'test summary',
    keyPoints: ['point1'],
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

describe('singleShotSummarize', () => {
  it('calls active provider and returns summary', async () => {
    const summary = makeSummary();
    const provider = makeMockProvider(ok(summary));
    mockGetActiveProvider.mockResolvedValue(ok(provider));
    const result = await singleShotSummarize('some terms text');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.summary).toBe('test summary');
    expect(provider.summarize).toHaveBeenCalledOnce();
  });

  it('returns error when provider factory fails', async () => {
    mockGetActiveProvider.mockResolvedValue(err(new ProviderError('test', 'not configured')));
    const result = await singleShotSummarize('text');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('PROVIDER_ERROR');
  });

  it('returns error when provider.summarize fails', async () => {
    const provider = makeMockProvider(err(new ProviderError('mock', 'api error')));
    mockGetActiveProvider.mockResolvedValue(ok(provider));
    const result = await singleShotSummarize('text');
    expect(result.ok).toBe(false);
  });

  it('passes metadata through to provider', async () => {
    const provider = makeMockProvider(ok(makeSummary()));
    mockGetActiveProvider.mockResolvedValue(ok(provider));
    const meta = { url: 'https://example.com', domain: 'example.com' };
    await singleShotSummarize('text', meta);
    const callArgs = (provider.summarize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].metadata).toEqual(meta);
  });
});

describe('singleShotSummarizeWithProvider', () => {
  it('calls named provider', async () => {
    const summary = makeSummary({ summary: 'named provider result' });
    const provider = makeMockProvider(ok(summary));
    mockGetProviderByName.mockResolvedValue(ok(provider));
    const result = await singleShotSummarizeWithProvider('text', 'openai');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.summary).toBe('named provider result');
    expect(mockGetProviderByName).toHaveBeenCalledWith('openai');
  });

  it('returns error when named provider not found', async () => {
    mockGetProviderByName.mockResolvedValue(err(new ProviderError('missing', 'not found')));
    const result = await singleShotSummarizeWithProvider('text', 'missing');
    expect(result.ok).toBe(false);
  });

  it('passes metadata through to named provider', async () => {
    const provider = makeMockProvider(ok(makeSummary()));
    mockGetProviderByName.mockResolvedValue(ok(provider));
    const meta = { url: 'https://test.com', domain: 'test.com', sourceType: 'tos_page' as const };
    await singleShotSummarizeWithProvider('text', 'claude', meta);
    const callArgs = (provider.summarize as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].metadata).toEqual(meta);
  });
});
