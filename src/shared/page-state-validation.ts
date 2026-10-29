import type { PageAnalysisLogEntry, PageAnalysisRecord } from './page-analysis';
import type { PendingNotification } from './storage';
import { copyStoredSummary, isStoredSummary } from './summary-validation';

const statuses = new Set([
  'idle',
  'analyzing',
  'cancelled',
  'no_detection',
  'extraction_failed',
  'needs_consent',
  'needs_provider',
  'service_unavailable',
  'error',
  'ready',
]);
const sourceTypes = new Set(['inline', 'linked', 'pdf']);
const detectionTypes = new Set(['checkbox', 'modal', 'banner', 'fullpage', 'implicit', 'manual']);
const levels = new Set(['info', 'success', 'warning', 'error']);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const percent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

export function normalizePageAnalysis(value: unknown): Record<string, PageAnalysisRecord> {
  if (!object(value)) return {};
  const entries: Array<[string, PageAnalysisRecord]> = [];
  for (const [key, raw] of Object.entries(value)) {
    if (
      !object(raw) ||
      raw.url !== key ||
      !Number.isInteger(raw.tabId) ||
      (raw.tabId as number) < -1 ||
      typeof raw.status !== 'string' ||
      !statuses.has(raw.status) ||
      !finite(raw.updatedAt) ||
      raw.updatedAt < 0 ||
      (raw.summary !== null && !isStoredSummary(raw.summary))
    )
      continue;
    let url: URL;
    try {
      url = new URL(key);
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== raw.domain) continue;
    } catch {
      continue;
    }
    const record: PageAnalysisRecord = {
      tabId: raw.tabId as number,
      url: key,
      domain: url.hostname,
      status: raw.status as PageAnalysisRecord['status'],
      sourceType:
        typeof raw.sourceType === 'string' && sourceTypes.has(raw.sourceType)
          ? (raw.sourceType as PageAnalysisRecord['sourceType'])
          : null,
      detectionType:
        typeof raw.detectionType === 'string' && detectionTypes.has(raw.detectionType)
          ? (raw.detectionType as PageAnalysisRecord['detectionType'])
          : null,
      confidence: finite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : null,
      textHash: typeof raw.textHash === 'string' ? raw.textHash : null,
      summary:
        raw.summary === null
          ? null
          : (copyStoredSummary(raw.summary) as PageAnalysisRecord['summary']),
      error: typeof raw.error === 'string' ? raw.error.slice(0, 2000) : null,
      updatedAt: raw.updatedAt,
      ...('progressPercent' in raw
        ? { progressPercent: finite(raw.progressPercent) ? percent(raw.progressPercent) : null }
        : {}),
      ...('progressLabel' in raw
        ? {
            progressLabel:
              typeof raw.progressLabel === 'string' ? raw.progressLabel.slice(0, 200) : null,
          }
        : {}),
      ...('progressLogs' in raw ? { progressLogs: normalizeLogs(raw.progressLogs) } : {}),
    };
    entries.push([key, record]);
  }
  return Object.fromEntries(entries);
}

export function normalizePageAnalysisTabs(value: unknown): Record<string, string> {
  if (!object(value)) return {};
  const entries: Array<[string, string]> = [];
  for (const [key, url] of Object.entries(value)) {
    if (/^\d+$/.test(key) && typeof url === 'string') entries.push([key, url]);
  }
  return Object.fromEntries(entries);
}

function normalizeLogs(value: unknown): PageAnalysisLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (log) =>
        object(log) &&
        finite(log.timestamp) &&
        typeof log.message === 'string' &&
        finite(log.progress) &&
        typeof log.level === 'string' &&
        levels.has(log.level)
    )
    .slice(-8)
    .map((log) => ({
      timestamp: log.timestamp,
      message: log.message.slice(0, 1000),
      progress: percent(log.progress),
      level: log.level,
    }));
}

export function normalizePendingNotifications(value: unknown): PendingNotification[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item) =>
        object(item) &&
        typeof item.domain === 'string' &&
        item.domain.length <= 253 &&
        finite(item.timestamp) &&
        item.timestamp >= 0 &&
        Number.isSafeInteger(item.addedRedFlags) &&
        (item.addedRedFlags as number) >= 0 &&
        typeof item.viewed === 'boolean'
    )
    .map((item) => ({
      domain: item.domain,
      timestamp: item.timestamp,
      addedRedFlags: item.addedRedFlags,
      viewed: item.viewed,
    }));
}
