import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockStorage } from '../mocks/chrome';
import {
  computeTextHash,
  getCachedSummary,
  cacheSummary,
  getCacheStats,
  clearCache,
  pruneCache,
} from '@summarizer/cache';
import { CACHE_TTL_MS, MAX_CACHE_ENTRIES } from '@shared/constants';
import type { Summary } from '@providers/types';

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    summary: 'test summary',
    keyPoints: ['point1'],
    redFlags: [{
      category: 'data_selling',
      description: 'sells data',
      severity: 'high',
      quote: 'we sell your data',
    }],
    severity: 'high',
    ...overrides,
  };
}

describe('computeTextHash', () => {
  it('returns consistent hash for same input', async () => {
    const a = await computeTextHash('hello world');
    const b = await computeTextHash('hello world');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('returns different hashes for different input', async () => {
    const a = await computeTextHash('hello');
    const b = await computeTextHash('world');
    expect(a).not.toBe(b);
  });
});

describe('getCachedSummary', () => {
  it('returns null on cache miss', async () => {
    const result = await getCachedSummary('nonexistent-hash');
    expect(result).toBeNull();
  });

  it('returns null for expired entries', async () => {
    const expiredTimestamp = Date.now() - CACHE_TTL_MS - 1000;
    mockStorage['cache'] = {
      'expired-hash': {
        summary: { summary: 's', keyPoints: [], redFlags: [], severity: 'low' },
        domain: 'example.com',
        textHash: 'expired-hash',
        timestamp: expiredTimestamp,
      },
    };
    const result = await getCachedSummary('expired-hash');
    expect(result).toBeNull();
  });
});

describe('cacheSummary + getCachedSummary roundtrip', () => {
  it('stores and retrieves a summary', async () => {
    const summary = makeSummary();
    await cacheSummary('hash-1', summary, 'example.com');
    const cached = await getCachedSummary('hash-1');
    expect(cached).not.toBeNull();
    expect(cached!.summary.summary).toBe('test summary');
    expect(cached!.domain).toBe('example.com');
    expect(cached!.textHash).toBe('hash-1');
  });
});

describe('getCacheStats', () => {
  it('returns correct count and domains', async () => {
    const summary = makeSummary();
    await cacheSummary('h1', summary, 'a.com');
    await cacheSummary('h2', summary, 'b.com');
    await cacheSummary('h3', summary, 'a.com');
    const stats = await getCacheStats();
    expect(stats.count).toBe(3);
    expect(stats.domains.sort()).toEqual(['a.com', 'b.com']);
    expect(stats.sizeBytes).toBeGreaterThan(0);
  });
});

describe('clearCache', () => {
  beforeEach(async () => {
    const summary = makeSummary();
    await cacheSummary('h1', summary, 'a.com');
    await cacheSummary('h2', summary, 'b.com');
    await cacheSummary('h3', summary, 'a.com');
  });

  it('removes only the specified domain', async () => {
    await clearCache('a.com');
    const stats = await getCacheStats();
    expect(stats.count).toBe(1);
    expect(stats.domains).toEqual(['b.com']);
  });

  it('clears all entries when no domain specified', async () => {
    await clearCache();
    const stats = await getCacheStats();
    expect(stats.count).toBe(0);
    expect(stats.domains).toEqual([]);
  });
});

describe('pruneCache', () => {
  it('removes expired entries', async () => {
    const now = Date.now();
    mockStorage['cache'] = {
      fresh: {
        summary: { summary: 's', keyPoints: [], redFlags: [], severity: 'low' },
        domain: 'a.com',
        textHash: 'fresh',
        timestamp: now,
      },
      stale: {
        summary: { summary: 's', keyPoints: [], redFlags: [], severity: 'low' },
        domain: 'b.com',
        textHash: 'stale',
        timestamp: now - CACHE_TTL_MS - 1000,
      },
    };
    await pruneCache();
    const stats = await getCacheStats();
    expect(stats.count).toBe(1);
    expect(stats.domains).toEqual(['a.com']);
  });

  it('enforces max entry count', async () => {
    const now = Date.now();
    const cache: Record<string, unknown> = {};
    for (let i = 0; i < MAX_CACHE_ENTRIES + 10; i++) {
      cache[`hash-${i}`] = {
        summary: { summary: 's', keyPoints: [], redFlags: [], severity: 'low' },
        domain: 'test.com',
        textHash: `hash-${i}`,
        timestamp: now - i * 1000, // progressively older
      };
    }
    mockStorage['cache'] = cache;
    await pruneCache();
    const stats = await getCacheStats();
    expect(stats.count).toBeLessThanOrEqual(MAX_CACHE_ENTRIES);
  });
});
