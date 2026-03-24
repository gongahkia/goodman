import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetCacheStats = vi.fn();
const mockClearCache = vi.fn();

vi.mock('@summarizer/cache', () => ({
  getCacheStats: (...args: unknown[]) => mockGetCacheStats(...args),
  clearCache: (...args: unknown[]) => mockClearCache(...args),
}));

import { renderCacheSettings } from '@popup/settings/cache';

describe('cache settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    mockGetCacheStats.mockResolvedValue({
      count: 5,
      sizeBytes: 2048,
      domains: ['example.com', 'test.org'],
    });
    mockClearCache.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows cache count and size', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderCacheSettings(container);

    expect(container.textContent).toContain('Cached summaries: 5');
    expect(container.textContent).toContain('2.0 KB');
  });

  it('clear all button calls clearCache', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderCacheSettings(container);

    // stub confirm
    vi.stubGlobal('confirm', () => true);

    const buttons = Array.from(container.querySelectorAll('button'));
    const clearAllBtn = buttons.find((b) => b.textContent === 'Clear All Cache');
    expect(clearAllBtn).toBeDefined();

    // after clearing, getCacheStats will return empty for re-render
    mockGetCacheStats.mockResolvedValue({ count: 0, sizeBytes: 0, domains: [] });
    clearAllBtn!.click();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockClearCache).toHaveBeenCalledWith();
    vi.unstubAllGlobals();
  });

  it('per-domain clear button works', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderCacheSettings(container);

    const domainRows = container.querySelectorAll('.tc-domain-row');
    expect(domainRows.length).toBe(2);

    const firstClearBtn = domainRows[0]!.querySelector('button') as HTMLButtonElement;
    expect(firstClearBtn).not.toBeNull();

    mockGetCacheStats.mockResolvedValue({ count: 1, sizeBytes: 512, domains: ['test.org'] });
    firstClearBtn.click();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockClearCache).toHaveBeenCalledWith('example.com');
  });
});
