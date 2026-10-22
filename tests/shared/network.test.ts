import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBounded } from '@shared/network';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('bounded response bodies', () => {
  it('times out and cancels a response that stalls after successful headers', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const outcome = fetchBounded('https://example.test/stalled', {}, { timeoutMs: 100 }).catch(
      (error) => error
    );
    await vi.advanceTimersByTimeAsync(101);
    expect((await outcome).name).toBe('TimeoutError');
    expect(cancelled).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a streaming response as soon as it exceeds the byte limit', async () => {
    let cancelled = false;
    let produced = 0;
    const body = new ReadableStream({
      pull(controller) {
        produced += 256;
        controller.enqueue(new Uint8Array(256));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchBounded('https://example.test/large', {}, { maxBytes: 512 })).rejects.toThrow(
      /size limit/
    );
    expect(cancelled).toBe(true);
    expect(produced).toBeLessThan(4096);
  });

  it('does not start a fetch for an already cancelled operation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchBounded('https://example.test/cancelled', { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
