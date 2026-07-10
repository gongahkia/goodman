import { describe, it, expect, beforeEach } from 'vitest';
import {
  addVersion,
  getDomainHistorySummaries,
  getVersionHistory,
  getVersionHistorySnapshot,
} from '@versioning/schema';
import { mockStorage } from '../mocks/chrome';
import type { Summary } from '@providers/types';

// Mock crypto.subtle for hashing
const mockCrypto = {
  subtle: {
    digest: async (_algo: string, data: ArrayBuffer) => {
      // Simple hash mock: return a deterministic buffer from input
      const view = new Uint8Array(data);
      const hash = new Uint8Array(32);
      for (let i = 0; i < view.length; i++) {
        hash[i % 32] = (hash[i % 32]! + view[i]!) % 256;
      }
      return hash.buffer;
    },
  },
};

Object.defineProperty(globalThis, 'crypto', { value: mockCrypto, writable: true });

const testSummary: Summary = {
  summary: 'Test summary',
  keyPoints: ['Point 1'],
  redFlags: [],
  severity: 'low',
};

describe('version tracking', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it('should create version 1 on first visit', async () => {
    const result = await addVersion('example.com', 'some legal text', testSummary);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(1);
    expect(result!.domain).toBe('example.com');
  });

  it('should not create new version for same text', async () => {
    await addVersion('example.com', 'some legal text', testSummary);
    const result = await addVersion('example.com', 'some legal text', testSummary);

    expect(result).toBeNull();
  });

  it('should create version 2 for different text', async () => {
    await addVersion('example.com', 'original text', testSummary);
    const result = await addVersion('example.com', 'updated text', testSummary);

    expect(result).not.toBeNull();
    expect(result!.version).toBe(2);
  });

  it('should return history sorted by timestamp ascending', async () => {
    await addVersion('example.com', 'text v1', testSummary);
    await addVersion('example.com', 'text v2', testSummary);

    const history = await getVersionHistory('example.com');

    expect(history).toHaveLength(2);
    expect(history[0]!.timestamp).toBeLessThanOrEqual(history[1]!.timestamp);
  });

  it('returns local history snapshots sorted by latest activity', async () => {
    mockStorage.versionHistory = {
      'old.test': [makeVersion('old.test', 1, 'low', 1000)],
      'new.test': [makeVersion('new.test', 1, 'medium', 2000)],
    };

    const snapshot = await getVersionHistorySnapshot();

    expect(Object.keys(snapshot)).toEqual(['new.test', 'old.test']);
    expect(snapshot['new.test']?.[0]?.summary.summary).toBe('new.test summary 1');
  });

  it('summarizes latest domain history and severity trend', async () => {
    mockStorage.versionHistory = {
      'example.com': [
        makeVersion('example.com', 1, 'low', 1000),
        makeVersion('example.com', 2, 'high', 2000),
      ],
    };

    const summaries = await getDomainHistorySummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      domain: 'example.com',
      versionCount: 2,
      lastDiffAt: 2000,
      severityTrend: 'up',
    });
    expect(summaries[0]?.latest.version).toBe(2);
  });
});

function makeVersion(
  domain: string,
  version: number,
  severity: Summary['severity'],
  timestamp: number
) {
  return {
    domain,
    textHash: `${domain}-${version}`,
    timestamp,
    version,
    summary: {
      summary: `${domain} summary ${version}`,
      keyPoints: [],
      redFlags: [],
      severity,
    },
  };
}
