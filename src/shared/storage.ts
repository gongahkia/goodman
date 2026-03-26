// use chrome.storage directly — webextension-polyfill crashes in MV3 service workers
import { ok, err } from './result';
import type { Result } from './result';
import type { Settings, ProviderConfig } from './messages';
import { STORAGE_VERSION } from './constants';
import type { PageAnalysisRecord } from './page-analysis';

export interface CachedSummary {
  summary: StoredSummary;
  domain: string;
  textHash: string;
  timestamp: number;
}

export interface StoredSummary {
  summary: string;
  keyPoints: string[];
  redFlags: StoredRedFlag[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface StoredRedFlag {
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  quote: string;
}

export interface VersionEntry {
  domain: string;
  textHash: string;
  summary: StoredSummary;
  timestamp: number;
  version: number;
}

export interface PendingNotification {
  domain: string;
  addedRedFlags: number;
  timestamp: number;
  viewed: boolean;
}

export interface StorageSchema {
  settings: Settings;
  cache: Record<string, CachedSummary>;
  pageAnalysis: Record<string, PageAnalysisRecord>;
  pageAnalysisTabs: Record<string, string>;
  versionHistory: Record<string, VersionEntry[]>;
  domainNotificationPreferences: Record<string, boolean>;
  domainBlacklist: string[];
  pendingNotifications: PendingNotification[];
  onboardingCompleted: boolean;
  storageVersion: number;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  apiKey: '',
  model: '',
};

const DEFAULT_HOSTED_API_BASE_URL =
  import.meta.env?.VITE_HOSTED_API_BASE_URL?.trim() || 'http://127.0.0.1:8787';

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'hosted',
  providers: {
    hosted: {
      apiKey: '',
      model: 'goodman-cloud',
      baseUrl: DEFAULT_HOSTED_API_BASE_URL,
    },
    openai: { apiKey: '', model: 'gpt-4o' },
    claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
    gemini: { apiKey: '', model: 'gemini-1.5-pro' },
    ollama: { apiKey: '', model: '', baseUrl: 'http://localhost:11434' },
    custom: { apiKey: '', model: '', baseUrl: '' },
    fixture: { apiKey: '', model: 'fixture-v1' },
  },
  hostedConsentAccepted: false,
  detectionSensitivity: 'conservative',
  darkMode: 'auto',
  notifyOnChange: true,
};

const STORAGE_DEFAULTS: StorageSchema = {
  settings: DEFAULT_SETTINGS,
  cache: {},
  pageAnalysis: {},
  pageAnalysisTabs: {},
  versionHistory: {},
  domainNotificationPreferences: {},
  domainBlacklist: [],
  pendingNotifications: [],
  onboardingCompleted: false,
  storageVersion: STORAGE_VERSION,
};

type MigrationFn = () => Promise<void>;

const MIGRATIONS: Record<number, MigrationFn> = {
  // 1 → 2: strip fullText from versionHistory entries
  1: async () => {
    const result = await chrome.storage.local.get('versionHistory');
    const history = (result['versionHistory'] ?? {}) as Record<string, Array<Record<string, unknown>>>;
    let changed = false;
    for (const entries of Object.values(history)) {
      for (const entry of entries) {
        if ('fullText' in entry) {
          delete entry['fullText'];
          changed = true;
        }
      }
    }
    if (changed) {
      await chrome.storage.local.set({ versionHistory: history });
    }
  },
};

export async function runMigrations(): Promise<void> {
  const raw = await chrome.storage.local.get('storageVersion');
  let current = (typeof raw['storageVersion'] === 'number' ? raw['storageVersion'] : 0) as number;
  while (current < STORAGE_VERSION) {
    const migrate = MIGRATIONS[current];
    if (migrate) await migrate();
    current++;
    await chrome.storage.local.set({ storageVersion: current });
  }
}

const PAGE_ANALYSIS_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_PAGE_ANALYSIS_RECORDS = 100;
const MAX_PAGE_ANALYSIS_RECORDS_PER_DOMAIN = 10;

export async function getStorage<K extends keyof StorageSchema>(
  key: K
): Promise<Result<StorageSchema[K], Error>> {
  try {
    const result = await chrome.storage.local.get(key);
    const value = result[key] as StorageSchema[K] | undefined;
    return ok(value ?? STORAGE_DEFAULTS[key]);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function setStorage<K extends keyof StorageSchema>(
  key: K,
  value: StorageSchema[K]
): Promise<Result<void, Error>> {
  try {
    await chrome.storage.local.set({ [key]: value });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

const writeLocks = new Map<string, Promise<void>>();
export async function withStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  let resolve: () => void;
  const next = new Promise<void>((r) => { resolve = r; });
  writeLocks.set(key, next);
  await prev;
  try { return await fn(); } finally { resolve!(); }
}

export async function getPageAnalysis(
  tabId: number
): Promise<PageAnalysisRecord | null> {
  const [pageAnalysisResult, pageAnalysisTabsResult] = await Promise.all([
    getStorage('pageAnalysis'),
    getStorage('pageAnalysisTabs'),
  ]);
  if (!pageAnalysisResult.ok || !pageAnalysisTabsResult.ok) return null;

  const pageKey = pageAnalysisTabsResult.data[String(tabId)];
  if (!pageKey) return null;

  return pageAnalysisResult.data[pageKey] ?? null;
}

export function setPageAnalysisRecord(
  record: PageAnalysisRecord
): Promise<Result<void, Error>> {
  return withStorageLock('pageAnalysis', async () => {
    const [pageAnalysisResult, pageAnalysisTabsResult] = await Promise.all([
      getStorage('pageAnalysis'),
      getStorage('pageAnalysisTabs'),
    ]);
    if (!pageAnalysisResult.ok) return pageAnalysisResult;
    if (!pageAnalysisTabsResult.ok) return pageAnalysisTabsResult;

    const pageKey = getPageAnalysisKey(record.url);
    const nextPageAnalysis = {
      ...pageAnalysisResult.data,
      [pageKey]: record,
    };
    const nextPageAnalysisTabs =
      record.tabId >= 0
        ? {
            ...pageAnalysisTabsResult.data,
            [String(record.tabId)]: pageKey,
          }
        : pageAnalysisTabsResult.data;
    const { pageAnalysis, pageAnalysisTabs } = prunePageAnalysisMaps(
      nextPageAnalysis,
      nextPageAnalysisTabs
    );

    try {
      await chrome.storage.local.set({
        pageAnalysis,
        pageAnalysisTabs,
      });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function removePageAnalysis(
  tabId: number
): Promise<Result<void, Error>> {
  return withStorageLock('pageAnalysis', async () => {
    const [pageAnalysisResult, pageAnalysisTabsResult] = await Promise.all([
      getStorage('pageAnalysis'),
      getStorage('pageAnalysisTabs'),
    ]);
    if (!pageAnalysisResult.ok) return pageAnalysisResult;
    if (!pageAnalysisTabsResult.ok) return pageAnalysisTabsResult;

    const pageAnalysis = { ...pageAnalysisResult.data };
    const pageAnalysisTabs = { ...pageAnalysisTabsResult.data };
    const tabKey = String(tabId);
    const pageKey = pageAnalysisTabs[tabKey];

    delete pageAnalysisTabs[tabKey];
    if (
      pageKey &&
      !Object.values(pageAnalysisTabs).some((mappedPageKey) => mappedPageKey === pageKey)
    ) {
      delete pageAnalysis[pageKey];
    }
    const prunedState = prunePageAnalysisMaps(pageAnalysis, pageAnalysisTabs);

    try {
      await chrome.storage.local.set({
        pageAnalysis: prunedState.pageAnalysis,
        pageAnalysisTabs: prunedState.pageAnalysisTabs,
      });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function getPageAnalysisByUrl(
  url: string
): Promise<PageAnalysisRecord | null> {
  const result = await getStorage('pageAnalysis');
  if (!result.ok) return null;

  return result.data[getPageAnalysisKey(url)] ?? null;
}

export async function setPageAnalysisByUrl(
  url: string,
  record: PageAnalysisRecord
): Promise<Result<void, Error>> {
  return setPageAnalysisRecord({
    ...record,
    url,
  });
}

export function prunePageAnalysisState(): Promise<Result<void, Error>> {
  return withStorageLock('pageAnalysis', async () => {
    const [pageAnalysisResult, pageAnalysisTabsResult] = await Promise.all([
      getStorage('pageAnalysis'),
      getStorage('pageAnalysisTabs'),
    ]);
    if (!pageAnalysisResult.ok) return pageAnalysisResult;
    if (!pageAnalysisTabsResult.ok) return pageAnalysisTabsResult;

    const prunedState = prunePageAnalysisMaps(
      pageAnalysisResult.data,
      pageAnalysisTabsResult.data
    );

    try {
      await chrome.storage.local.set({
        pageAnalysis: prunedState.pageAnalysis,
        pageAnalysisTabs: prunedState.pageAnalysisTabs,
      });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export async function getDomainNotificationPreference(
  domain: string
): Promise<boolean> {
  const result = await getStorage('domainNotificationPreferences');
  if (!result.ok) return true;

  return result.data[domain] ?? true;
}

export function setDomainNotificationPreference(
  domain: string,
  enabled: boolean
): Promise<Result<void, Error>> {
  return withStorageLock('domainNotificationPreferences', async () => {
    const result = await getStorage('domainNotificationPreferences');
    if (!result.ok) return result;

    const preferences = {
      ...result.data,
      [domain]: enabled,
    };

    return setStorage('domainNotificationPreferences', preferences);
  });
}

function getPageAnalysisKey(url: string): string {
  return url;
}

function prunePageAnalysisMaps(
  pageAnalysis: Record<string, PageAnalysisRecord>,
  pageAnalysisTabs: Record<string, string>,
  now = Date.now()
): {
  pageAnalysis: Record<string, PageAnalysisRecord>;
  pageAnalysisTabs: Record<string, string>;
} {
  const referencedKeys = new Set(Object.values(pageAnalysisTabs));
  const entries = Object.entries(pageAnalysis).filter(([, record]) => {
    return referencedKeys.has(getPageAnalysisKey(record.url)) || !isPageAnalysisStale(record, now);
  });

  const keptEntries = enforcePageAnalysisLimits(entries, referencedKeys);
  const keptKeys = new Set(keptEntries.map(([key]) => key));
  const prunedTabs = Object.fromEntries(
    Object.entries(pageAnalysisTabs).filter(([, pageKey]) => keptKeys.has(pageKey))
  );

  return {
    pageAnalysis: Object.fromEntries(keptEntries),
    pageAnalysisTabs: prunedTabs,
  };
}

function enforcePageAnalysisLimits(
  entries: Array<[string, PageAnalysisRecord]>,
  referencedKeys: Set<string>
): Array<[string, PageAnalysisRecord]> {
  const referencedEntries = entries.filter(([key]) => referencedKeys.has(key));
  const unreferencedEntries = entries
    .filter(([key]) => !referencedKeys.has(key))
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt);

  const keptUnreferencedEntries: Array<[string, PageAnalysisRecord]> = [];
  const perDomainCounts = new Map<string, number>();

  for (const entry of unreferencedEntries) {
    const domainCount = perDomainCounts.get(entry[1].domain) ?? 0;
    if (domainCount >= MAX_PAGE_ANALYSIS_RECORDS_PER_DOMAIN) {
      continue;
    }

    keptUnreferencedEntries.push(entry);
    perDomainCounts.set(entry[1].domain, domainCount + 1);

    if (keptUnreferencedEntries.length >= MAX_PAGE_ANALYSIS_RECORDS) {
      break;
    }
  }

  return [...referencedEntries, ...keptUnreferencedEntries];
}

function isPageAnalysisStale(
  record: PageAnalysisRecord,
  now = Date.now()
): boolean {
  return now - record.updatedAt > PAGE_ANALYSIS_TTL_MS;
}
