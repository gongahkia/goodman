import { getStorage, setStorage, withStorageLock } from '@shared/storage';
import type { CachedSummary } from '@shared/storage';
import type { Summary } from '@providers/types';
import { CACHE_TTL_MS, MAX_CACHE_ENTRIES } from '@shared/constants';

export async function getCachedSummary(
  textHash: string,
  domain?: string
): Promise<CachedSummary | null> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return null;

  const scopedKey = domain ? `${domain}:${textHash}` : null;
  const entry = (scopedKey ? cacheResult.data[scopedKey] : null) ?? cacheResult.data[textHash]; // fallback to legacy key
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    return null;
  }

  return entry;
}

export function cacheSummary(
  textHash: string,
  summary: Summary,
  domain: string
): Promise<void> {
  return withStorageLock('cache', async () => {
    const cacheResult = await getStorage('cache');
    if (!cacheResult.ok) return;

    const cache = { ...cacheResult.data };
    const cacheKey = `${domain}:${textHash}`;
    cache[cacheKey] = {
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
    };

    await setStorage('cache', cache);
    await pruneCacheEntries();
  });
}

export function pruneCache(): Promise<void> {
  return withStorageLock('cache', pruneCacheEntries);
}

async function pruneCacheEntries(): Promise<void> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return;

  const now = Date.now();
  const entries = Object.entries(cacheResult.data);
  const live = entries.filter(([, e]) => now - e.timestamp <= CACHE_TTL_MS);
  if (live.length <= MAX_CACHE_ENTRIES && live.length === entries.length) return;

  const sorted = live.sort((a, b) => b[1].timestamp - a[1].timestamp);
  const kept = sorted.slice(0, MAX_CACHE_ENTRIES);
  await setStorage('cache', Object.fromEntries(kept));
}

export function clearCache(domain?: string): Promise<void> {
  return withStorageLock('cache', async () => {
    if (!domain) {
      await setStorage('cache', {});
      return;
    }

    const cacheResult = await getStorage('cache');
    if (!cacheResult.ok) return;

    const filtered: Record<string, CachedSummary> = {};
    for (const [key, entry] of Object.entries(cacheResult.data)) {
      if (entry.domain !== domain) {
        filtered[key] = entry;
      }
    }

    await setStorage('cache', filtered);
  });
}

export async function getCacheStats(): Promise<{
  count: number;
  sizeBytes: number;
  domains: string[];
}> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return { count: 0, sizeBytes: 0, domains: [] };

  const entries = Object.values(cacheResult.data);
  const domains = [...new Set(entries.map((e) => e.domain))];
  const sizeBytes = new TextEncoder().encode(JSON.stringify(cacheResult.data)).length;

  return {
    count: entries.length,
    sizeBytes,
    domains,
  };
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
