import { describe, expect, it } from 'vitest';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import {
  DEFAULT_SETTINGS,
  getDomainNotificationPreference,
  getPageAnalysis,
  getPageAnalysisByUrl,
  getStorage,
  prunePageAnalysisState,
  runMigrations,
  setDomainNotificationPreference,
  setPageAnalysisRecord,
  setStorage,
} from '@shared/storage';
import { mockStorage } from '../mocks/chrome';

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

  it('returns empty consent-warning dismissals by default', async () => {
    const result = await getStorage('dismissedConsentWarnings');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({});
    }
  });

  it('defaults anonymous corpus contribution to disabled', async () => {
    const result = await getStorage('settings');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.corpusContribution).toEqual({ enabled: false });
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

  it('normalizes legacy hosted settings to the default BYOK provider', async () => {
    mockStorage.settings = makeLegacyHostedSettings();

    const result = await getStorage('settings');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activeProvider).toBe(DEFAULT_SETTINGS.activeProvider);
    expect(result.data.providers.hosted).toBeUndefined();
    expect(result.data.providers.openai).toEqual(DEFAULT_SETTINGS.providers.openai);
    expect(result.data.corpusContribution.enabled).toBe(false);
  });

  it('migrates stored hosted settings out of local storage', async () => {
    mockStorage.storageVersion = 2;
    mockStorage.settings = makeLegacyHostedSettings();

    await runMigrations();

    expect(mockStorage.storageVersion).toBe(3);
    expect(mockStorage.settings).toMatchObject({
      activeProvider: DEFAULT_SETTINGS.activeProvider,
      providers: {
        openai: DEFAULT_SETTINGS.providers.openai,
      },
      corpusContribution: {
        enabled: false,
      },
    });
    expect((mockStorage.settings as { providers: Record<string, unknown> }).providers.hosted).toBeUndefined();
  });

  it('persists domain notification preferences', async () => {
    const saveResult = await setDomainNotificationPreference('example.com', false);
    expect(saveResult.ok).toBe(true);

    const enabled = await getDomainNotificationPreference('example.com');
    expect(enabled).toBe(false);
  });
});

function makeLegacyHostedSettings(): Record<string, unknown> {
  return {
    activeProvider: 'hosted',
    providers: {
      hosted: {
        apiKey: '',
        model: 'legacy-hosted-model',
        baseUrl: 'http://127.0.0.1:8787',
      },
      ...DEFAULT_SETTINGS.providers,
    },
    detectionSensitivity: 'conservative',
    darkMode: 'auto',
    notifyOnChange: true,
  };
}
