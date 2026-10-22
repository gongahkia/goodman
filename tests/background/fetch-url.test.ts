import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/messages';
import { chrome, mockStorage } from '../mocks/chrome';

async function importBackground(): Promise<void> {
  vi.resetModules();
  await import('@background/index');
}

function getRuntimeListener(): (message: Message, sender: unknown) => Promise<unknown> {
  const raw = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0] as (
    message: Message,
    sender: unknown,
    sendResponse: (response?: unknown) => void
  ) => boolean;
  return (message: Message, sender: unknown) =>
    new Promise((resolve) => {
      raw(message, sender, resolve);
    });
}

describe('background fetch URL handling', () => {
  it('preserves binary bytes, MIME/charset and final redirect URL for document extraction', async () => {
    const response = new Response(new Uint8Array([0x80, 0xe9]), {
      headers: { 'Content-Type': 'text/html; charset=windows-1252' },
    });
    Object.defineProperty(response, 'url', { value: 'https://example.test/nested/terms' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await importBackground();
    expect(
      await getRuntimeListener()(
        {
          type: 'FETCH_URL',
          payload: { url: 'https://example.test/start', responseType: 'document' },
        },
        {}
      )
    ).toEqual({
      ok: true,
      data: {
        body: 'gOk=',
        contentType: 'text/html; charset=windows-1252',
        url: 'https://example.test/nested/terms',
      },
    });
  });
  it.each([
    null,
    {},
    { type: 'FETCH_URL', payload: null },
    { type: 'SAVE_SETTINGS', payload: null },
  ])(
    'rejects a malformed runtime request without throwing or modifying settings: %j',
    async (message) => {
      await importBackground();
      const response = (await getRuntimeListener()(message as Message, {})) as { ok: boolean };
      expect(response.ok).toBe(false);
      expect(mockStorage.settings).toBeUndefined();
    }
  );

  it('rejects non-HTTP document URLs before making a request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('synthetic private file'));
    vi.stubGlobal('fetch', fetchMock);
    await importBackground();
    const response = (await getRuntimeListener()(
      {
        type: 'FETCH_URL',
        payload: { url: 'file:///synthetic-private-file', responseType: 'text' },
      },
      {}
    )) as { ok: boolean };
    expect(response.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bounds document response bytes before accepting a large body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(9 * 1024 * 1024))));
    await importBackground();
    const response = (await getRuntimeListener()(
      {
        type: 'FETCH_URL',
        payload: { url: 'https://example.test/oversized', responseType: 'text' },
      },
      {}
    )) as { ok: boolean };
    expect(response.ok).toBe(false);
  });

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
