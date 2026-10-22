import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextDecoder as BrowserTextDecoder } from '@exodus/bytes/encoding.js';
import { resolveDetectionTextSource } from '@content/extractors/source';
import { extractLinkedText } from '@content/extractors/linked';
import { chrome } from '../mocks/chrome';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({
    destroy: vi.fn().mockResolvedValue(undefined),
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        cleanup: vi.fn(),
        getTextContent: async () => ({ items: [{ str: 'Exact PDF agreement clause.' }] }),
      }),
    }),
  })),
}));

function resource(
  bytes: Uint8Array,
  contentType: string,
  url = 'https://example.test/nested/terms'
) {
  chrome.runtime.sendMessage.mockResolvedValue({
    ok: true,
    data: { body: btoa(String.fromCharCode(...bytes)), contentType, url },
  });
}
const detection = (url: string) => ({
  element: document.createElement('input'),
  type: 'checkbox' as const,
  confidence: 1,
  keywords: ['terms'],
  nearestLink: url,
});

// Node20.20.1 maps windows-1252 byte0x80 to U+0080; browser/Node24 map it to €.
// Use an independent WHATWG decoder in this unit environment; native tests use browser APIs.
beforeEach(() => vi.stubGlobal('TextDecoder', BrowserTextDecoder));
afterEach(() => vi.unstubAllGlobals());

describe('downloaded legal document boundaries', () => {
  it('routes an extensionless PDF by response type and uses a single download', async () => {
    resource(
      new TextEncoder().encode('%PDF-1.7 synthetic bytes; real parsing separately native-tested'),
      'application/pdf'
    );
    const result = await resolveDetectionTextSource(detection('https://example.test/download'));
    expect(result).toEqual({ sourceType: 'pdf', text: 'Exact PDF agreement clause.' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledOnce();
  });

  it('preserves declared legacy-encoded currency and company names', async () => {
    resource(
      Uint8Array.from([
        ...'<main><p>Terms: the fee is '.split('').map((c) => c.charCodeAt(0)),
        128,
        ...' 15 for Soci'.split('').map((c) => c.charCodeAt(0)),
        233,
        ...'t'.split('').map((c) => c.charCodeAt(0)),
        233,
        ...'.</p></main>'.split('').map((c) => c.charCodeAt(0)),
      ]),
      'text/html; charset=windows-1252'
    );
    const result = await resolveDetectionTextSource(detection('https://example.test/terms'));
    expect(result.text).toBe('Terms: the fee is € 15 for Société.');
  });

  it('preserves literal angle brackets in a plain-text agreement', async () => {
    resource(
      new TextEncoder().encode(
        'Effective date: 2026-10-22.\nKeep <LICENSE_CODE> exactly. 契約条件。'
      ),
      'text/plain; charset=utf-8'
    );
    const result = await resolveDetectionTextSource(detection('https://example.test/terms'));
    expect(result.text).toContain('<LICENSE_CODE>');
    expect(result.text).toContain('契約条件。');
  });

  it('honors an UTF-16 BOM without losing Unicode or literal legal placeholders', async () => {
    const text = 'Effective date: 2026-10-22. 契約条件 <LICENSE_CODE>.';
    const units = [...Array(text.length)].map((_, i) => text.charCodeAt(i));
    resource(
      Uint8Array.from([255, 254, ...units.flatMap((unit) => [unit & 255, unit >>> 8])]),
      'text/plain'
    );
    expect((await resolveDetectionTextSource(detection('https://example.test/terms'))).text).toBe(
      text
    );
  });

  it('does not interpret a literal meta tag in plain-text legal terms as an encoding instruction', async () => {
    const text = '契約条件 describe the literal <meta charset=windows-1252> token.';
    resource(new TextEncoder().encode(text), 'text/plain');
    expect((await resolveDetectionTextSource(detection('https://example.test/terms'))).text).toBe(
      text
    );
  });

  it('rejects malformed UTF-8 rather than summarizing replacement characters', async () => {
    resource(new Uint8Array([60, 112, 62, 0xff, 60, 47, 112, 62]), 'text/html; charset=utf-8');
    await expect(
      resolveDetectionTextSource(detection('https://example.test/terms'))
    ).rejects.toThrow();
  });

  it('resolves related legal links against the final redirect URL and excludes unsafe schemes', async () => {
    resource(
      new TextEncoder().encode(
        '<main><p>Terms require arbitration.</p><a href="privacy">Privacy</a><a href="javascript:alert(1)">Legal policy</a></main>'
      ),
      'text/html',
      'https://example.test/policy/current/terms'
    );
    const result = await extractLinkedText('https://example.test/start');
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.data.relatedLinks).toEqual([
        { url: 'https://example.test/policy/current/privacy', label: 'Privacy' },
      ]);
  });

  it('rejects an unsupported JSON response instead of treating it as an agreement', async () => {
    resource(
      new TextEncoder().encode('{"error":"account unavailable","private":"synthetic"}'),
      'application/json'
    );
    await expect(
      resolveDetectionTextSource(detection('https://example.test/terms'))
    ).rejects.toThrow();
  });
});
