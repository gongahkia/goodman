import { getStorage, setStorage } from '@shared/storage';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { MAX_VERSIONS_PER_DOMAIN } from '@shared/constants';
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
    fullText: text,
    timestamp: Date.now(),
    version,
  };

  domainHistory.push(entry);

  if (domainHistory.length > MAX_VERSIONS_PER_DOMAIN) {
    domainHistory.shift();
  }

  history[domain] = domainHistory;
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
