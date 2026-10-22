import { describe, expect, it, vi } from 'vitest';
import { syncVersionHistory } from '@background/version-tracking';
import {
  addVersion,
  getDomainHistorySummaries,
  getTextRetention,
  getVersionHistory,
  getVersionHistorySnapshot,
  setTextRetention,
} from '@versioning/schema';
import { computeDiff } from '@versioning/diff';
import { computeTextHash } from '@summarizer/cache';
import { runMigrations } from '@shared/storage';
import { mockStorage, chrome } from '../mocks/chrome';

const domain = 'synthetic.test';
const summary = {
  summary: 'Synthetic summary.',
  keyPoints: [],
  redFlags: [],
  severity: 'low' as const,
};
const original = 'Effective date: 2026-10-01.\nYou may cancel monthly.\nCopyright 2026.';
const updated = 'Effective date: 2026-10-22.\nYou may cancel annually.\nCopyright 2026.';

describe('persisted agreement comparison and privacy', () => {
  it('isolates hostnames that overlap JavaScript object property names', async () => {
    for (const current of ['__proto__', 'constructor']) {
      await setTextRetention(current, true);
      await addVersion(current, original, summary);
      expect(await getTextRetention(current)).toBe(true);
      expect((await getVersionHistory(current))[0]?.sourceText).toBe(original);
      await setTextRetention(current, false);
      expect((await getVersionHistory(current))[0]?.sourceText).toBeUndefined();
    }
    expect(({} as Record<string, unknown>).sourceText).toBeUndefined();
  });
  it('keeps agreement text out of default history', async () => {
    await syncVersionHistory(domain, original, summary);
    const change = await syncVersionHistory(domain, updated, summary);
    expect(change.textDiff).toBeNull();
    expect(JSON.stringify(mockStorage.versionHistory)).not.toContain('You may cancel');
  });

  it('persists and compares both exact agreements after a local per-domain opt-in', async () => {
    mockStorage.textRetention = { [domain]: true };
    await syncVersionHistory(domain, original, summary);
    const change = await syncVersionHistory(domain, updated, summary);
    expect(change.textDiff).not.toBeNull();
    expect(change.textDiff?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          previousText: expect.stringContaining('monthly'),
          text: expect.stringContaining('annually'),
        }),
      ])
    );
    const history = await getVersionHistory(domain);
    expect(history).toMatchObject([{ sourceText: original }, { sourceText: updated }]);
  });

  it('does not expose saved agreement text without an exact true opt-in', async () => {
    const textHash = await computeTextHash(original);
    for (const preference of [undefined, false, 'true', 1, {}]) {
      mockStorage.textRetention = { [domain]: preference };
      mockStorage.versionHistory = {
        [domain]: [
          {
            domain,
            version: 1,
            textHash,
            summary,
            timestamp: 1000,
            sourceText: original,
            fullText: 'legacy private text',
          },
        ],
      };
      const snapshot = await getVersionHistorySnapshot();
      expect(snapshot[domain]?.[0]?.sourceText).toBeUndefined();
      expect(JSON.stringify(snapshot)).not.toContain('legacy private text');
      expect(snapshot[domain]?.[0]?.summary).toEqual(summary);
    }
  });

  it('rejects malformed and cross-domain records while keeping valid summaries', async () => {
    mockStorage.versionHistory = {
      [domain]: [
        null,
        { domain, version: 1, textHash: 'valid', summary, timestamp: 1000 },
        { domain: 'other.test', version: 2, textHash: 'other', summary, timestamp: 2000 },
        { domain, version: 3, textHash: 'bad', summary: null, timestamp: 3000 },
      ],
    };
    await expect(getVersionHistory(domain)).resolves.toMatchObject([{ version: 1 }]);
    mockStorage.versionHistory = { [domain]: 'corrupt-array' };
    await expect(getVersionHistory(domain)).resolves.toEqual([]);
  });

  it('does not present corrupted retained text as an exact source snapshot', async () => {
    mockStorage.textRetention = { [domain]: true };
    mockStorage.versionHistory = {
      [domain]: [
        {
          domain,
          version: 1,
          textHash: await computeTextHash(original),
          summary,
          timestamp: 1000,
          sourceText: 'corrupted agreement text',
        },
      ],
    };
    expect(JSON.stringify(await getVersionHistorySnapshot())).not.toContain(
      'corrupted agreement text'
    );
  });

  it('uses version order consistently even if the clock moves backwards', async () => {
    mockStorage.versionHistory = {
      [domain]: [
        {
          domain,
          version: 2,
          textHash: 'new',
          summary: { ...summary, summary: 'New version.' },
          timestamp: 1000,
        },
        { domain, version: 1, textHash: 'old', summary, timestamp: 2000 },
      ],
    };
    expect((await getVersionHistorySnapshot())[domain]?.map((entry) => entry.version)).toEqual([
      1, 2,
    ]);
    expect((await getDomainHistorySummaries())[0]?.latest.version).toBe(2);
  });

  it('preserves both sides and line numbers of replacements', () => {
    const diff = computeDiff(
      'Heading\nOld provision.\nFooter\n',
      'Heading\nNew provision.\nFooter\n'
    );
    expect(diff.changes).toEqual([
      {
        previousText: 'Old provision.\n',
        text: 'New provision.\n',
        previousLineNumber: 2,
        lineNumber: 2,
      },
    ]);
  });

  it('refuses oversized comparisons explicitly without a misleading empty diff', () => {
    expect(computeDiff('x'.repeat(500001), 'y')).toMatchObject({ limited: true });
  });

  it('purges saved text on opt-out while preserving summary versions and hashes', async () => {
    expect(await getTextRetention(domain)).toBe(false);
    await setTextRetention(domain, true);
    await addVersion(domain, original, summary);
    await addVersion(domain, updated, summary);
    const before = await getVersionHistory(domain);
    await setTextRetention(domain, false);
    expect(await getTextRetention(domain)).toBe(false);
    expect(JSON.stringify(mockStorage.versionHistory)).not.toContain('You may cancel');
    const after = await getVersionHistory(domain);
    expect(after.map(({ sourceText: _text, ...entry }) => entry)).toEqual(
      before.map(({ sourceText: _text, ...entry }) => entry)
    );
  });

  it('retains freshly reanalyzed current text without inventing a new version', async () => {
    await addVersion(domain, original, summary);
    await setTextRetention(domain, true);
    expect(await addVersion(domain, original, summary)).toBeNull();
    expect(await getVersionHistory(domain)).toMatchObject([{ version: 1, sourceText: original }]);
  });

  it('serializes opt-out with concurrent version writes and cannot reintroduce text', async () => {
    await setTextRetention(domain, true);
    const writes = Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        addVersion(domain, `${original}\nRevision ${index}.`, summary)
      )
    );
    await setTextRetention(domain, false);
    await writes;
    expect(JSON.stringify(mockStorage.versionHistory)).not.toContain('You may cancel');
    expect((await getVersionHistory(domain)).length).toBe(10);
  });

  it('bounds UTF-8 text storage globally and retains the newest available texts', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      for (let index = 0; index < 3; index++) {
        const current = `domain-${index}.test`;
        now.mockReturnValue(1000 + index);
        await setTextRetention(current, true);
        await addVersion(current, `${'合'.repeat(300000)}${index}`, summary);
      }
      const entries = Object.values(await getVersionHistorySnapshot()).flat();
      const retained = entries.filter((entry) => entry.sourceText !== undefined);
      expect(entries).toHaveLength(3);
      expect(retained).toHaveLength(2);
      expect(retained.map((entry) => entry.domain).sort()).toEqual([
        'domain-1.test',
        'domain-2.test',
      ]);
      expect(
        retained.reduce(
          (bytes, entry) =>
            bytes + new TextEncoder().encode(JSON.stringify(entry.sourceText)).length,
          0
        )
      ).toBeLessThanOrEqual(2 * 1024 * 1024);
    } finally {
      now.mockRestore();
    }
  });

  it('never writes the text preference or source snapshots to sync storage', async () => {
    const sync = { get: vi.fn(), set: vi.fn() };
    Object.defineProperty(chrome.storage, 'sync', { value: sync, configurable: true });
    try {
      await setTextRetention(domain, true);
      await addVersion(domain, original, summary);
      expect(await getTextRetention(domain)).toBe(true);
      expect(sync.get).not.toHaveBeenCalled();
      expect(sync.set).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(chrome.storage, 'sync');
    }
  });

  it('reports a failed deletion without changing the stored opt-in or text', async () => {
    await setTextRetention(domain, true);
    await addVersion(domain, original, summary);
    chrome.storage.local.set.mockRejectedValueOnce(new Error('synthetic quota failure'));
    await expect(setTextRetention(domain, false)).rejects.toThrow('synthetic quota failure');
    expect(await getTextRetention(domain)).toBe(true);
    expect((await getVersionHistory(domain))[0]?.sourceText).toBe(original);
  });

  it('migrates malformed legacy history without retaining unapproved or unknown text', async () => {
    mockStorage.storageVersion = 0;
    mockStorage.versionHistory = {
      broken: 'not an array',
      [domain]: [
        null,
        {
          domain,
          version: 1,
          textHash: 'old',
          summary,
          timestamp: 1,
          fullText: original,
          sourceText: updated,
          secretExtra: 'opaque private text',
        },
      ],
    };
    await runMigrations();
    expect(mockStorage.storageVersion).toBe(4);
    expect(JSON.stringify(mockStorage.versionHistory)).not.toContain('You may cancel');
    expect(JSON.stringify(mockStorage.versionHistory)).not.toContain('opaque private text');
    expect(await getVersionHistory(domain)).toMatchObject([
      { version: 1, textHash: 'old', summary },
    ]);
  });
});
