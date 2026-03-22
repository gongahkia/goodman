import { describe, expect, it } from 'vitest';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import {
  getDomainNotificationPreference,
  getPageAnalysis,
  getPageAnalysisByUrl,
  getStorage,
  prunePageAnalysisState,
  setDomainNotificationPreference,
  setPageAnalysisRecord,
  setStorage,
} from '@shared/storage';

function makePageAnalysisRecord(
  overrides: Partial<PageAnalysisRecord> = {}
): PageAnalysisRecord {
  return {
    tabId: 12,
    url: 'https://example.com/signup',
    domain: 'example.com',
    status: 'analyzing',
    sourceType: null,
    detectionType: 'checkbox',
    confidence: 0.82,
    textHash: null,
    summary: null,
    error: null,
    updatedAt: 1_763_648_400_000,
    ...overrides,
  };
}

describe('shared storage', () => {
  it('returns empty page analysis by default', async () => {
    const result = await getStorage('pageAnalysis');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it('returns an empty page-analysis tab index by default', async () => {
    const result = await getStorage('pageAnalysisTabs');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it('persists page analysis records by tab id', async () => {
    const record = makePageAnalysisRecord();

    const saveResult = await setPageAnalysisRecord(record);
    expect(saveResult.ok).toBe(true);

    const storedRecord = await getPageAnalysis(record.tabId);
    expect(storedRecord).toEqual(record);
  });

  it('mirrors page analysis records by url', async () => {
    const record = makePageAnalysisRecord();

    const saveResult = await setPageAnalysisRecord(record);
    expect(saveResult.ok).toBe(true);

    const storedRecord = await getPageAnalysisByUrl(record.url);
    expect(storedRecord).toEqual(record);
  });

  it('prunes stale unreferenced page analysis records', async () => {
    const staleRecord = makePageAnalysisRecord({
      updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    });

    await setStorage('pageAnalysis', {
      [staleRecord.url]: staleRecord,
    });
    await setStorage('pageAnalysisTabs', {});

    const pruneResult = await prunePageAnalysisState();
    expect(pruneResult.ok).toBe(true);

    const storedRecord = await getPageAnalysisByUrl(staleRecord.url);
    expect(storedRecord).toBeNull();
  });

  it('keeps stale page analysis records that are still referenced by an active tab', async () => {
    const staleRecord = makePageAnalysisRecord({
      updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
    });

    await setStorage('pageAnalysis', {
      [staleRecord.url]: staleRecord,
    });
    await setStorage('pageAnalysisTabs', {
      [String(staleRecord.tabId)]: staleRecord.url,
    });

    const pruneResult = await prunePageAnalysisState();
    expect(pruneResult.ok).toBe(true);

    const storedRecord = await getPageAnalysis(staleRecord.tabId);
    expect(storedRecord).toEqual(staleRecord);
  });

  it('defaults domain notification preferences to enabled', async () => {
    const enabled = await getDomainNotificationPreference('example.com');

    expect(enabled).toBe(true);
  });

  it('persists domain notification preferences', async () => {
    const saveResult = await setDomainNotificationPreference('example.com', false);
    expect(saveResult.ok).toBe(true);

    const enabled = await getDomainNotificationPreference('example.com');
    expect(enabled).toBe(false);
  });
});
