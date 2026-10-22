import { getStorage, setStorage, withStorageLock } from '@shared/storage';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { MAX_INPUT_TEXT_LENGTH } from '@shared/constants';
import { copyStoredSummary } from '@shared/summary-validation';
import {
  enforceTextBudget,
  isHistoryDomain,
  normalizeTextRetention,
  normalizeVersionHistory,
} from './history-data';
import { computeTextHash } from '@summarizer/cache';

export type { VersionEntry };

export type SeverityTrend = 'new' | 'up' | 'down' | 'unchanged';

export interface DomainHistorySummary {
  domain: string;
  versionCount: number;
  latest: VersionEntry;
  previous: VersionEntry | null;
  lastDiffAt: number | null;
  severityTrend: SeverityTrend;
}

export async function addVersion(
  domain: string,
  text: string,
  summary: Summary
): Promise<VersionEntry | null> {
  if (!isHistoryDomain(domain) || text.length > MAX_INPUT_TEXT_LENGTH)
    throw new Error('Invalid or oversized history input');
  const textHash = await computeTextHash(text);
  return withStorageLock('versionHistory', async () => {
    const { history, retention } = await readHistory();
    const domainHistory = history[domain] ?? [];
    const latest = domainHistory.at(-1);
    if (latest?.textHash === textHash) {
      if (retention[domain] === true && latest.sourceText === undefined) {
        latest.sourceText = text;
        enforceTextBudget(history);
        const written = await setStorage('versionHistory', history);
        if (!written.ok) throw written.error;
      }
      return null;
    }
    const version = (latest?.version ?? 0) + 1;
    if (!Number.isSafeInteger(version)) throw new Error('History version counter is invalid');
    const entry: VersionEntry = {
      domain,
      textHash,
      version,
      summary: copyStoredSummary(summary),
      timestamp: Date.now(),
      ...(retention[domain] === true ? { sourceText: text } : {}),
    };
    domainHistory.push(entry);
    history[domain] = domainHistory;
    const boundedHistory = normalizeVersionHistory(history, retention);
    const written = await setStorage('versionHistory', boundedHistory);
    if (!written.ok) throw written.error;
    return boundedHistory[domain]?.at(-1) ?? null;
  });
}

export async function getTextRetention(domain: string): Promise<boolean> {
  const result = await getStorage('textRetention');
  if (!result.ok) throw result.error;
  return normalizeTextRetention(result.data)[domain] === true;
}

export async function setTextRetention(domain: string, enabled: boolean): Promise<void> {
  if (!isHistoryDomain(domain) || typeof enabled !== 'boolean')
    throw new Error('Invalid text retention preference');
  return withStorageLock('versionHistory', async () => {
    const { history, retention } = await readHistory();
    if (enabled) retention[domain] = true;
    else delete retention[domain];
    const nextRetention = normalizeTextRetention(retention);
    // One local write under the same lock as version creation; opting out purges text.
    await chrome.storage.local.set({
      textRetention: nextRetention,
      versionHistory: normalizeVersionHistory(history, nextRetention),
    });
  });
}

async function readHistory(): Promise<{
  history: Record<string, VersionEntry[]>;
  retention: Record<string, boolean>;
}> {
  const [historyResult, retentionResult] = await Promise.all([
    getStorage('versionHistory'),
    getStorage('textRetention'),
  ]);
  if (!historyResult.ok) throw historyResult.error;
  if (!retentionResult.ok) throw retentionResult.error;
  const retention = normalizeTextRetention(retentionResult.data);
  const history = normalizeVersionHistory(historyResult.data, retention);
  // Do not present corrupted retained bytes as the text identified by a saved hash.
  await Promise.all(
    Object.values(history)
      .flat()
      .map(async (entry) => {
        if (
          entry.sourceText !== undefined &&
          (await computeTextHash(entry.sourceText)) !== entry.textHash
        )
          delete entry.sourceText;
      })
  );
  return { history, retention };
}

export async function getVersionHistory(domain: string): Promise<VersionEntry[]> {
  return (await readHistory()).history[domain] ?? [];
}

export async function getAllTrackedDomains(): Promise<string[]> {
  return Object.keys((await readHistory()).history);
}

export async function getVersionHistorySnapshot(): Promise<Record<string, VersionEntry[]>> {
  const { history } = await readHistory();
  const entries = Object.entries(history);
  entries.sort(
    ([domainA, historyA], [domainB, historyB]) =>
      (historyB.at(-1)?.timestamp ?? 0) - (historyA.at(-1)?.timestamp ?? 0) ||
      domainA.localeCompare(domainB)
  );
  return Object.fromEntries(entries);
}

export async function getDomainHistorySummaries(): Promise<DomainHistorySummary[]> {
  const snapshot = await getVersionHistorySnapshot();
  return Object.entries(snapshot)
    .map(([domain, entries]) => {
      const latest = entries[entries.length - 1];
      if (!latest) return null;
      const previous = entries[entries.length - 2] ?? null;
      return {
        domain,
        versionCount: entries.length,
        latest,
        previous,
        lastDiffAt: previous ? latest.timestamp : null,
        severityTrend: getSeverityTrend(
          previous?.summary.severity ?? null,
          latest.summary.severity
        ),
      } satisfies DomainHistorySummary;
    })
    .filter((summary): summary is DomainHistorySummary => summary !== null);
}

function getSeverityTrend(
  previous: VersionEntry['summary']['severity'] | null,
  latest: VersionEntry['summary']['severity']
): SeverityTrend {
  if (!previous) return 'new';
  const previousRank = severityRank(previous);
  const latestRank = severityRank(latest);
  if (latestRank > previousRank) return 'up';
  if (latestRank < previousRank) return 'down';
  return 'unchanged';
}

function severityRank(severity: VersionEntry['summary']['severity']): number {
  switch (severity) {
    case 'low':
      return 1;
    case 'medium':
      return 2;
    case 'high':
      return 3;
    case 'critical':
      return 4;
  }
}
