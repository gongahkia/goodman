import { describe, it, expect, beforeEach } from 'vitest';
import { addVersion, getVersionHistory } from '@versioning/schema';
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
});
