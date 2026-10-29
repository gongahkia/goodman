import { normalizeDocument } from '@shared/documents';
import {
  MAX_INPUT_TEXT_LENGTH,
  MAX_RETAINED_TEXT_BYTES,
  MAX_TRACKED_DOMAINS,
  MAX_VERSIONS_PER_DOMAIN,
} from '@shared/constants';
import type { VersionEntry } from '@shared/storage';
import { copyStoredSummary, isStoredSummary } from '@shared/summary-validation';

export function isHistoryDomain(domain: unknown): domain is string {
  if (typeof domain !== 'string' || !domain || domain.length > 253) return false;
  try {
    return new URL(`https://${domain}`).hostname === domain;
  } catch {
    return false;
  }
}

export function normalizeTextRetention(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.create(null);
  return Object.assign(
    Object.create(null),
    Object.fromEntries(
      Object.entries(value)
        .filter(([domain, enabled]) => isHistoryDomain(domain) && enabled === true)
        .slice(-MAX_TRACKED_DOMAINS)
    )
  );
}

export function normalizeVersionHistory(
  value: unknown,
  retention: Record<string, boolean>
): Record<string, VersionEntry[]> {
  const history: Record<string, VersionEntry[]> = Object.create(null);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return history;
  for (const [domain, entries] of Object.entries(value)) {
    if (!isHistoryDomain(domain) || !Array.isArray(entries)) continue;
    const versions = new Map<string, VersionEntry>();
    for (const raw of entries) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        raw.domain !== domain ||
        !Number.isSafeInteger(raw.version) ||
        raw.version < 1 ||
        typeof raw.textHash !== 'string' ||
        !raw.textHash ||
        raw.textHash.length > 128 ||
        typeof raw.timestamp !== 'number' ||
        !Number.isFinite(raw.timestamp) ||
        raw.timestamp < 0 ||
        !isStoredSummary(raw.summary)
      )
        continue;
      const document = normalizeDocument(raw.document);
      const entry: VersionEntry = {
        ...(document ? { document } : {}),
        ...(typeof raw.lastCheckedAt === 'number' && Number.isFinite(raw.lastCheckedAt)
          ? { lastCheckedAt: raw.lastCheckedAt }
          : {}),
        domain,
        version: raw.version,
        textHash: raw.textHash,
        timestamp: raw.timestamp,
        summary: copyStoredSummary(raw.summary),
      };
      if (
        retention[domain] === true &&
        typeof raw.sourceText === 'string' &&
        raw.sourceText.length <= MAX_INPUT_TEXT_LENGTH
      )
        entry.sourceText = raw.sourceText;
      const key = JSON.stringify([document?.id ?? 'legacy', entry.version]);
      const previous = versions.get(key);
      if (!previous || entry.timestamp >= previous.timestamp) versions.set(key, entry);
    }
    const groups = new Map<string, VersionEntry[]>();
    for (const entry of versions.values()) {
      const key = entry.document?.id ?? 'legacy';
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    const sorted = [...groups.values()]
      .sort(
        (a, b) => Math.max(...b.map((e) => e.timestamp)) - Math.max(...a.map((e) => e.timestamp))
      )
      .slice(0, 20)
      .reverse()
      .flatMap((entries) =>
        entries.sort((a, b) => a.version - b.version).slice(-MAX_VERSIONS_PER_DOMAIN)
      );
    if (sorted.length) history[domain] = sorted;
  }
  const domains = Object.keys(history).sort(
    (a, b) => (history[b]?.at(-1)?.timestamp ?? 0) - (history[a]?.at(-1)?.timestamp ?? 0)
  );
  for (const domain of domains.slice(MAX_TRACKED_DOMAINS)) delete history[domain];
  // Document-specific histories must not multiply the previous global entry budget.
  const keep = new Set(
    Object.values(history)
      .flat()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_TRACKED_DOMAINS * MAX_VERSIONS_PER_DOMAIN)
  );
  for (const domain of Object.keys(history)) {
    history[domain] = history[domain]!.filter((entry) => keep.has(entry));
    if (!history[domain]!.length) delete history[domain];
  }
  enforceTextBudget(history);
  return history;
}

export function enforceTextBudget(history: Record<string, VersionEntry[]>): void {
  const candidates: Array<{ entry: VersionEntry; priority: number }> = [];
  for (const entries of Object.values(history)) {
    let priority = 0;
    for (const entry of entries) {
      priority = Math.max(priority, entry.timestamp);
      if (typeof entry.sourceText === 'string') candidates.push({ entry, priority });
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || b.entry.version - a.entry.version);
  let bytes = 0;
  for (const { entry } of candidates) {
    const size = new TextEncoder().encode(JSON.stringify(entry.sourceText)).length;
    if (bytes + size > MAX_RETAINED_TEXT_BYTES) delete entry.sourceText;
    else bytes += size;
  }
}
