import { getStorage, setStorage, withStorageLock } from '@shared/storage';
import type { CachedSummary } from '@shared/storage';
import type { Summary } from '@providers/types';
import { CACHE_TTL_MS, MAX_CACHE_ENTRIES } from '@shared/constants';
import { isStoredSummary } from '@shared/summary-validation';

export async function getCachedSummary(
  textHash: string,
  domain?: string,
  contextHash?: string
): Promise<CachedSummary | null> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return null;

  const cache = validCacheEntries(cacheResult.data);
  const keys = contextHash
    ? [cacheKey(textHash, domain ?? '', contextHash)]
    : [...(domain ? [`${domain}:${textHash}`] : []), textHash];
  for (const key of keys) {
    const entry = cache[key];
    if (!entry || entry.textHash !== textHash || (domain && entry.domain !== domain)) continue;
    if (contextHash && entry.contextHash !== contextHash) continue;
    if (Date.now() - entry.timestamp <= CACHE_TTL_MS) return entry;
  }
  return null;
}

export function cacheSummary(
  textHash: string,
  summary: Summary,
  domain: string,
  contextHash?: string
): Promise<void> {
  return withStorageLock('cache', async () => {
    const cacheResult = await getStorage('cache');
    if (!cacheResult.ok) throw cacheResult.error;

    const cache = validCacheEntries(cacheResult.data);
    cache[cacheKey(textHash, domain, contextHash)] = {
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
        ...(summary.tldr ? { tldr: summary.tldr } : {}),
      },
      domain,
      textHash,
      timestamp: Date.now(),
      ...(contextHash ? { contextHash } : {}),
    };

    const written = await setStorage('cache', cache);
    if (!written.ok) throw written.error;
    await pruneCacheEntries();
  });
}

export function pruneCache(): Promise<void> {
  return withStorageLock('cache', pruneCacheEntries);
}

async function pruneCacheEntries(): Promise<void> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) throw cacheResult.error;

  const now = Date.now();
  const entries = Object.entries(validCacheEntries(cacheResult.data));
  const live = entries.filter(([, e]) => now - e.timestamp <= CACHE_TTL_MS);
  if (
    live.length <= MAX_CACHE_ENTRIES &&
    JSON.stringify(Object.fromEntries(live)) === JSON.stringify(cacheResult.data)
  )
    return;

  const sorted = live.sort((a, b) => b[1].timestamp - a[1].timestamp);
  const kept = sorted.slice(0, MAX_CACHE_ENTRIES);
  const written = await setStorage('cache', Object.fromEntries(kept));
  if (!written.ok) throw written.error;
}

export function clearCache(domain?: string): Promise<void> {
  return withStorageLock('cache', async () => {
    if (!domain) {
      const cleared = await setStorage('cache', {});
      if (!cleared.ok) throw cleared.error;
      return;
    }

    const cacheResult = await getStorage('cache');
    if (!cacheResult.ok) throw cacheResult.error;

    const filtered: Record<string, CachedSummary> = {};
    for (const [key, entry] of Object.entries(validCacheEntries(cacheResult.data))) {
      if (entry.domain !== domain) {
        filtered[key] = entry;
      }
    }

    const cleared = await setStorage('cache', filtered);
    if (!cleared.ok) throw cleared.error;
  });
}

export async function getCacheStats(): Promise<{
  count: number;
  sizeBytes: number;
  domains: string[];
}> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return { count: 0, sizeBytes: 0, domains: [] };

  const cache = validCacheEntries(cacheResult.data);
  const entries = Object.values(cache);
  const domains = [...new Set(entries.map((e) => e.domain))];
  const sizeBytes = new TextEncoder().encode(JSON.stringify(cache)).length;

  return {
    count: entries.length,
    sizeBytes,
    domains,
  };
}

function cacheKey(textHash: string, domain: string, contextHash?: string): string {
  return contextHash
    ? `v2:${JSON.stringify([domain, textHash, contextHash])}`
    : `${domain}:${textHash}`;
}

function validCacheEntries(value: unknown): Record<string, CachedSummary> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => isCachedSummary(entry)));
}

function isCachedSummary(value: unknown): value is CachedSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as CachedSummary;
  const summary = entry.summary;
  return (
    typeof entry.domain === 'string' &&
    typeof entry.textHash === 'string' &&
    typeof entry.timestamp === 'number' &&
    Number.isFinite(entry.timestamp) &&
    entry.timestamp >= 0 &&
    (!('contextHash' in entry) || typeof entry.contextHash === 'string') &&
    isStoredSummary(summary)
  );
}

export async function computeTextHash(text: string): Promise<string> {
  const subtleCrypto = globalThis.crypto?.subtle;
  if (subtleCrypto) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await subtleCrypto.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('[Goodman] Web Crypto SHA-256 failed, using fallback hash:', e);
    }
  }

  return computeFallbackHash(text);
}

function computeFallbackHash(text: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x01000193;

  for (let index = 0; index < text.length; index += 1) {
    const codePoint = text.charCodeAt(index);
    hashA ^= codePoint;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= codePoint + index;
    hashB = Math.imul(hashB, 0x045d9f3b);
  }

  const partA = (hashA >>> 0).toString(16).padStart(8, '0');
  const partB = (hashB >>> 0).toString(16).padStart(8, '0');
  return `${partA}${partB}`.repeat(4).slice(0, 64);
}
