import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/messages';
import { chrome, mockStorage } from '../mocks/chrome';

async function importBackground(): Promise<void> {
  vi.resetModules();
  await import('@background/index');
}

function getRuntimeListener(): (
  message: Message,
  sender: unknown
) => Promise<unknown> {
  const raw = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0] as (
    message: Message,
    sender: unknown,
    sendResponse: (response?: unknown) => void
  ) => boolean;
  return (message: Message, sender: unknown) =>
    new Promise((resolve) => { raw(message, sender, resolve); });
}

describe('background fetch URL handling', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('returns an error when the upstream fetch responds with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Not Found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        })
      )
    );

    await importBackground();
    const listener = getRuntimeListener();
    const response = await listener(
      {
        type: 'FETCH_URL',
        payload: { url: 'https://example.com/missing', responseType: 'text' },
      },
      {}
    );

    expect(response).toEqual({
      ok: false,
      error: 'Failed to fetch URL: HTTP 404',
    });
  });

  it('still returns base64-encoded bytes for successful binary fetches', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        })
      )
    );

    await importBackground();
    const listener = getRuntimeListener();
    const response = await listener(
      {
        type: 'FETCH_URL',
        payload: { url: 'https://example.com/file.pdf', responseType: 'base64' },
      },
      {}
    );

    expect(response).toEqual({
      ok: true,
      data: 'AQID',
    });
  });
});
