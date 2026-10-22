import { describe, expect, it, vi } from 'vitest';
import { chrome, mockStorage } from '../mocks/chrome';

async function listener() {
  vi.resetModules();
  await import('@background/index');
  const raw = chrome.runtime.onMessage.addListener.mock.calls[0]![0];
  return (message: unknown, sender: unknown) =>
    new Promise<{ ok: boolean }>((resolve) => raw(message, sender, resolve));
}

describe('text retention message boundary', () => {
  it('rejects page/content-script attempts to enable local text storage', async () => {
    const send = await listener();
    const result = await send(
      { type: 'SET_TEXT_RETENTION', payload: { domain: 'synthetic.test', enabled: true } },
      { url: 'https://synthetic.test/checkout', tab: { id: 7 } }
    );
    expect(result.ok).toBe(false);
    expect(mockStorage.textRetention).not.toMatchObject({ 'synthetic.test': true });
  });

  it('accepts an explicit extension-page preference and rejects malformed values', async () => {
    const send = await listener();
    const sender = { url: chrome.runtime.getURL('src/popup/index.html') };
    expect(
      (
        await send(
          { type: 'SET_TEXT_RETENTION', payload: { domain: 'synthetic.test', enabled: true } },
          sender
        )
      ).ok
    ).toBe(true);
    expect(mockStorage.textRetention).toMatchObject({ 'synthetic.test': true });
    expect(
      (
        await send(
          { type: 'SET_TEXT_RETENTION', payload: { domain: 'synthetic.test', enabled: 'true' } },
          sender
        )
      ).ok
    ).toBe(false);
  });
});
