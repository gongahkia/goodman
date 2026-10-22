export interface FetchLimits {
  timeoutMs?: number;
  maxBytes?: number;
}

// The deadline covers headers AND the body. Returning buffered, bounded bytes
// prevents a stalled JSON/PDF body from retaining a worker slot indefinitely.
export async function fetchBounded(
  url: string,
  init: RequestInit = {},
  { timeoutMs = 30_000, maxBytes = 2 * 1024 * 1024 }: FetchLimits = {}
): Promise<Response> {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Only HTTP(S) resources without URL credentials are supported');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  let cancelBody = (): void => {};
  try {
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => {
        controller.abort();
        reject(new DOMException('Request cancelled', 'AbortError'));
      };
      if (init.signal?.aborted) onAbort();
      else init.signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        reject(new DOMException('Request timed out', 'TimeoutError'));
      }, timeoutMs);
    });
    if (init.signal?.aborted) return await interrupted;
    return await Promise.race([
      (async () => {
        const response = await fetch(url, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          ...init,
          signal: controller.signal,
        });
        const declared = Number(response.headers.get('content-length'));
        if (declared > maxBytes) throw new Error('Response exceeds the download size limit');
        const chunks: Uint8Array[] = [];
        let length = 0;
        const reader = response.body?.getReader();
        if (reader) {
          cancelBody = () => {
            void reader.cancel().catch(() => undefined);
          };
          try {
            while (true) {
              const part = await reader.read();
              if (part.done) break;
              length += part.value.byteLength;
              if (length > maxBytes) throw new Error('Response exceeds the download size limit');
              chunks.push(part.value);
            }
          } catch (error) {
            void reader.cancel().catch(() => undefined);
            throw error;
          } finally {
            reader.releaseLock();
          }
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        const result = new Response([204, 205, 304].includes(response.status) ? null : bytes, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        Object.defineProperty(result, 'url', { value: response.url });
        return result;
      })(),
      interrupted,
    ]);
  } finally {
    controller.abort();
    cancelBody();
    clearTimeout(timer);
    if (onAbort) init.signal?.removeEventListener('abort', onAbort);
  }
}
