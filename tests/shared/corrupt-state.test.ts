import { describe, expect, it } from 'vitest';
import { getPageAnalysis, getStorage, setPageAnalysisRecord } from '@shared/storage';
import { getPendingNotifications } from '@versioning/notifications';
import { mockStorage } from '../mocks/chrome';

const valid = {
  tabId: 12,
  url: 'https://synthetic.test/terms',
  domain: 'synthetic.test',
  status: 'ready' as const,
  sourceType: 'inline' as const,
  detectionType: 'checkbox' as const,
  confidence: 1,
  textHash: 'abc',
  summary: { summary: 'Saved summary.', keyPoints: [], redFlags: [], severity: 'low' as const },
  error: null,
  updatedAt: Date.now(),
};

describe('corrupt local extension state', () => {
  it('keeps valid page records while rejecting invalid records and tab indexes', async () => {
    mockStorage.pageAnalysis = {
      corrupt: null,
      [valid.url]: valid,
      'https://synthetic.test/bad': { ...valid, url: 'https://synthetic.test/bad', summary: {} },
    };
    mockStorage.pageAnalysisTabs = { '12': valid.url, '13': 123 };
    expect(await getPageAnalysis(12)).toMatchObject(valid);
    const next = { ...valid, tabId: 14, url: 'https://synthetic.test/new' };
    expect((await setPageAnalysisRecord(next)).ok).toBe(true);
    expect((mockStorage.pageAnalysis as Record<string, unknown>).corrupt).toBeUndefined();
    expect((await getStorage('pageAnalysisTabs')).ok).toBe(true);
    expect(await getPageAnalysis(14)).toMatchObject(next);
  });

  it('drops malformed progress logs instead of crashing subsequent analysis', async () => {
    mockStorage.pageAnalysis = {
      [valid.url]: { ...valid, progressLogs: 'corrupt', progressPercent: Infinity },
    };
    mockStorage.pageAnalysisTabs = { '12': valid.url };
    expect(await getPageAnalysis(12)).toMatchObject({ progressLogs: [], progressPercent: null });
  });

  it('normalizes malformed pending notifications and domain blocklists', async () => {
    mockStorage.pendingNotifications = [
      null,
      'bad',
      { domain: 'synthetic.test', viewed: false, timestamp: 1000, addedRedFlags: 2 },
    ];
    expect(await getPendingNotifications()).toMatchObject([{ domain: 'synthetic.test' }]);
    mockStorage.domainBlacklist = { wrong: 'type' };
    const blacklist = await getStorage('domainBlacklist');
    expect(blacklist.ok && blacklist.data).toEqual([]);
  });
});
