import { getStorage, setStorage } from '@shared/storage';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { MAX_VERSIONS_PER_DOMAIN, MAX_TRACKED_DOMAINS } from '@shared/constants';
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
  const textHash = await computeTextHash(text);

  const historyResult = await getStorage('versionHistory');
  if (!historyResult.ok) return null;

  const history = { ...historyResult.data };
  const domainHistory = [...(history[domain] ?? [])];

  const latest = domainHistory[domainHistory.length - 1];
  if (latest && latest.textHash === textHash) {
    return null;
  }

  const version = (latest?.version ?? 0) + 1;
  const entry: VersionEntry = {
    domain,
    textHash,
    summary: {
      summary: summary.summary,
      keyPoints: summary.keyPoints,
      redFlags: summary.redFlags.map((f) => ({
        category: f.category,
        description: f.description,
        severity: f.severity,
        quote: f.quote,
      })),
      severity: summary.severity,
    },
    timestamp: Date.now(),
    version,
  };

  domainHistory.push(entry);

  if (domainHistory.length > MAX_VERSIONS_PER_DOMAIN) {
    domainHistory.shift();
  }

  history[domain] = domainHistory;
  pruneDomains(history);
  await setStorage('versionHistory', history);

  return entry;
}

export async function getVersionHistory(
  domain: string
): Promise<VersionEntry[]> {
  const historyResult = await getStorage('versionHistory');
  if (!historyResult.ok) return [];

  const entries = historyResult.data[domain] ?? [];
  return entries.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getAllTrackedDomains(): Promise<string[]> {
  const historyResult = await getStorage('versionHistory');
  if (!historyResult.ok) return [];

  return Object.keys(historyResult.data);
}

export async function getVersionHistorySnapshot(): Promise<Record<string, VersionEntry[]>> {
  const historyResult = await getStorage('versionHistory');
  if (!historyResult.ok) return {};

  const entries: Array<[string, VersionEntry[]]> = Object.entries(historyResult.data)
    .map(([domain, history]) => [
      domain,
      [...history].sort((a, b) => a.timestamp - b.timestamp),
    ]);

  entries.sort(([domainA, historyA], [domainB, historyB]) => {
    const latestA = historyA[historyA.length - 1]?.timestamp ?? 0;
    const latestB = historyB[historyB.length - 1]?.timestamp ?? 0;
    return latestB - latestA || domainA.localeCompare(domainB);
  });

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
        severityTrend: getSeverityTrend(previous?.summary.severity ?? null, latest.summary.severity),
      } satisfies DomainHistorySummary;
    })
    .filter((summary): summary is DomainHistorySummary => summary !== null);
}

function pruneDomains(history: Record<string, VersionEntry[]>): void {
  const domains = Object.keys(history);
  if (domains.length <= MAX_TRACKED_DOMAINS) return;

  const sorted = domains
    .map((d) => {
      const entries = history[d] ?? [];
      const latest = entries[entries.length - 1];
      return { domain: d, latestTs: latest?.timestamp ?? 0 };
    })
    .sort((a, b) => b.latestTs - a.latestTs);

  for (let i = MAX_TRACKED_DOMAINS; i < sorted.length; i++) {
    const item = sorted[i];
    if (item) delete history[item.domain];
  }
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
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    case 'critical': return 4;
  }
}
