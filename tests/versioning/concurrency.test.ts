import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addVersion, getVersionHistory } from '@versioning/schema';
import { chrome, mockStorage } from '../mocks/chrome';
import type { Summary } from '@providers/types';

const summary: Summary = {
  summary: 'Synthetic terms.',
  keyPoints: [],
  redFlags: [],
  severity: 'low',
};
beforeEach(() => {
  vi.restoreAllMocks();
});

describe('concurrent version persistence', () => {
  it('retains simultaneous writes to distinct domains', async () => {
    const domains = Array.from({ length: 12 }, (_, i) => `synthetic-${i}.test`);
    await Promise.all(domains.map((domain) => addVersion(domain, 'terms for ' + domain, summary)));
    expect(Object.keys(mockStorage.versionHistory as object).sort()).toEqual(domains.sort());
  });

  it('keeps monotonic sequences and bounded history for a concurrent domain', async () => {
    await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        addVersion('synthetic.test', `unique terms ${i}`, summary)
      )
    );
    const history = await getVersionHistory('synthetic.test');
    expect(history.map((entry) => entry.version)).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 23)
    );
    expect(new Set(history.map((entry) => entry.textHash)).size).toBe(10);
  });

  it('does not report a version as durable after a rejected storage write', async () => {
    chrome.storage.local.set.mockRejectedValueOnce(new Error('synthetic quota exhausted'));
    await expect(addVersion('synthetic.test', 'new terms', summary)).rejects.toThrow(/quota/);
    expect(mockStorage.versionHistory).toBeUndefined();
  });
});
