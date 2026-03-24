import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/messaging', () => ({
  sendToBackground: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
}));

import { extractPdfText, isPdfUrl } from '@content/extractors/pdf';
import { sendToBackground } from '@shared/messaging';
import { getDocument } from 'pdfjs-dist';

const mockSendToBackground = vi.mocked(sendToBackground);
const mockGetDocument = vi.mocked(getDocument);

function makePdfBytes(textChunks: string[]): Uint8Array {
  const raw = textChunks.map((t) => `(${t}) Tj`).join(' ');
  return new TextEncoder().encode(raw);
}

function base64Encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('isPdfUrl', () => {
  it('returns true for .pdf URLs', () => {
    expect(isPdfUrl('https://example.com/doc.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/path/file.PDF')).toBe(true);
  });

  it('returns false for non-PDF URLs', () => {
    expect(isPdfUrl('https://example.com/page.html')).toBe(false);
    expect(isPdfUrl('https://example.com/doc.pdf.bak')).toBe(false);
    expect(isPdfUrl('https://example.com/')).toBe(false);
  });
});

describe('extractPdfText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('succeeds when pdfjs returns text', async () => {
    const pdfBytes = makePdfBytes(['hello']);
    mockSendToBackground.mockResolvedValue({
      ok: true,
      data: base64Encode(pdfBytes),
    } as never);
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getTextContent: () =>
              Promise.resolve({ items: [{ str: 'pdfjs extracted text' }] }),
          }),
      }),
    } as never);

    const result = await extractPdfText('https://example.com/doc.pdf');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('pdfjs extracted text');
  });

  it('falls back to regex when pdfjs fails', async () => {
    const pdfBytes = makePdfBytes(['fallback content here']);
    mockSendToBackground.mockResolvedValue({
      ok: true,
      data: base64Encode(pdfBytes),
    } as never);
    mockGetDocument.mockReturnValue({
      promise: Promise.reject(new Error('pdfjs unavailable')),
    } as never);

    const result = await extractPdfText('https://example.com/doc.pdf');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('fallback content here');
  });

  it('returns error for empty PDF', async () => {
    const emptyBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header, no text
    mockSendToBackground.mockResolvedValue({
      ok: true,
      data: base64Encode(emptyBytes),
    } as never);
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            getTextContent: () => Promise.resolve({ items: [] }),
          }),
      }),
    } as never);

    const result = await extractPdfText('https://example.com/empty.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('no extractable text');
  });

  it('handles password-protected PDF error', async () => {
    // password error must come from fetchPdfBytes (outer try) since extractWithPdfJs swallows errors
    mockSendToBackground.mockRejectedValue(new Error('password required'));
    // also mock global fetch to throw the same
    vi.stubGlobal('fetch', () => Promise.reject(new Error('password required')));

    const result = await extractPdfText('https://example.com/secure.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('password-protected');
    vi.unstubAllGlobals();
  });
});
