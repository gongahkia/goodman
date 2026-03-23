import { getStorage, setStorage } from '@shared/storage';
import type { CachedSummary } from '@shared/storage';
import type { Summary } from '@providers/types';
import { CACHE_TTL_MS } from '@shared/constants';

export async function getCachedSummary(
  textHash: string
): Promise<CachedSummary | null> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return null;

  const entry = cacheResult.data[textHash];
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    return null;
  }

  return entry;
}

export async function cacheSummary(
  textHash: string,
  summary: Summary,
  domain: string
): Promise<void> {
  const cacheResult = await getStorage('cache');
  if (!cacheResult.ok) return;

  const cache = { ...cacheResult.data };
  cache[textHash] = {
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
    domain,
    textHash,
    timestamp: Date.now(),
  };

  await setStorage('cache', cache);
}

export async function clearCache(domain?: string): Promise<void> {
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
    } catch {
      // Fall through to the deterministic JS hash below.
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
