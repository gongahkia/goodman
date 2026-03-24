import { getStorage, setStorage } from '@shared/storage';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { MAX_VERSIONS_PER_DOMAIN, MAX_TRACKED_DOMAINS } from '@shared/constants';
import { computeTextHash } from '@summarizer/cache';

export type { VersionEntry };

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
