import browser from 'webextension-polyfill';
import { ok, err } from './result';
import type { Result } from './result';
import type { Settings, ProviderConfig } from './messages';
import { STORAGE_VERSION } from './constants';

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
  versionHistory: Record<string, VersionEntry[]>;
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
  versionHistory: {},
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
