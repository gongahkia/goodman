import browser from 'webextension-polyfill';
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
  fullText: string;
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
  versionHistory: Record<string, VersionEntry[]>;
  domainNotificationPreferences: Record<string, boolean>;
  pendingNotifications: PendingNotification[];
  storageVersion: number;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  apiKey: '',
  model: '',
};

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'openai',
  providers: {
    openai: { apiKey: '', model: 'gpt-4o' },
    claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
    gemini: { apiKey: '', model: 'gemini-1.5-pro' },
    ollama: { apiKey: '', model: '', baseUrl: 'http://localhost:11434' },
    custom: { apiKey: '', model: '', baseUrl: '' },
  },
  detectionSensitivity: 'normal',
  darkMode: 'auto',
  notifyOnChange: true,
};

const STORAGE_DEFAULTS: StorageSchema = {
  settings: DEFAULT_SETTINGS,
  cache: {},
  pageAnalysis: {},
  versionHistory: {},
  domainNotificationPreferences: {},
  pendingNotifications: [],
  storageVersion: STORAGE_VERSION,
};

export async function getStorage<K extends keyof StorageSchema>(
  key: K
): Promise<Result<StorageSchema[K], Error>> {
  try {
    const result = await browser.storage.local.get(key);
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
    await browser.storage.local.set({ [key]: value });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function getPageAnalysis(
  tabId: number
): Promise<PageAnalysisRecord | null> {
  const result = await getStorage('pageAnalysis');
  if (!result.ok) return null;

  return result.data[getPageAnalysisKey(tabId)] ?? null;
}

export async function setPageAnalysisRecord(
  record: PageAnalysisRecord
): Promise<Result<void, Error>> {
  const result = await getStorage('pageAnalysis');
  if (!result.ok) return result;

  const pageAnalysis = {
    ...result.data,
    [getPageAnalysisKey(record.tabId)]: record,
  };

  return setStorage('pageAnalysis', pageAnalysis);
}

export async function removePageAnalysis(
  tabId: number
): Promise<Result<void, Error>> {
  const result = await getStorage('pageAnalysis');
  if (!result.ok) return result;

  const pageAnalysis = { ...result.data };
  delete pageAnalysis[getPageAnalysisKey(tabId)];

  return setStorage('pageAnalysis', pageAnalysis);
}

export async function getDomainNotificationPreference(
  domain: string
): Promise<boolean> {
  const result = await getStorage('domainNotificationPreferences');
  if (!result.ok) return true;

  return result.data[domain] ?? true;
}

export async function setDomainNotificationPreference(
  domain: string,
  enabled: boolean
): Promise<Result<void, Error>> {
  const result = await getStorage('domainNotificationPreferences');
  if (!result.ok) return result;

  const preferences = {
    ...result.data,
    [domain]: enabled,
  };

  return setStorage('domainNotificationPreferences', preferences);
}

function getPageAnalysisKey(tabId: number): string {
  return String(tabId);
}
