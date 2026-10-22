import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/messaging', () => ({
  sendToBackground: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { extractPdfText, isPdfUrl } from '@content/extractors/pdf';
import { sendToBackground } from '@shared/messaging';
import { getDocument } from 'pdfjs-dist';
import { legalDocumentResponse } from '../mocks/legal-document';

const mockSendToBackground = vi.mocked(sendToBackground);
const mockGetDocument = vi.mocked(getDocument);

function makePdfBytes(textChunks: string[]): Uint8Array {
  const raw = textChunks.map((t) => `(${t}) Tj`).join(' ');
  return new TextEncoder().encode(raw);
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
    vi.restoreAllMocks();
    vi.mocked(chrome.runtime.getURL).mockImplementation(
      (path) => `chrome-extension://mock-id/${path}`
    );
  });

  it('parses Firefox PDF bytes in the extension realm without a second download', async () => {
    vi.spyOn(chrome.runtime, 'getURL').mockImplementation((path) => `moz-extension://test/${path}`);
    mockSendToBackground.mockResolvedValue({ ok: true, data: 'First page.\n\nSecond page.' });
    const bytes = new Uint8Array([0, 128, 255]);
    const result = await extractPdfText('https://example.com/doc.pdf', bytes);
    expect(result).toEqual({ ok: true, data: 'First page.\n\nSecond page.' });
    expect(mockSendToBackground).toHaveBeenCalledExactlyOnceWith({
      type: 'PARSE_PDF',
      payload: { body: 'AID/' },
    });
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it.each([
    { ok: true, data: {} },
    { ok: true, data: 'x'.repeat(500_001) },
    { ok: false, error: 'PDF parsing timed out' },
  ])('rejects invalid or failed Firefox parser responses', async (response) => {
    vi.spyOn(chrome.runtime, 'getURL').mockImplementation((path) => `moz-extension://test/${path}`);
    mockSendToBackground.mockResolvedValue(response);
    expect((await extractPdfText('https://example.com/doc.pdf', new Uint8Array([1]))).ok).toBe(
      false
    );
  });

  it('bounds already-downloaded input before invoking either parser', async () => {
    expect(
      (await extractPdfText('https://example.com/doc.pdf', new Uint8Array(8 * 1024 * 1024 + 1))).ok
    ).toBe(false);
    expect(mockSendToBackground).not.toHaveBeenCalled();
    expect(mockGetDocument).not.toHaveBeenCalled();
  });

  it('bounds a lost Firefox parser response without falling back or downloading again', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(chrome.runtime.getURL).mockImplementation((path) => `moz-extension://test/${path}`);
      mockSendToBackground.mockReturnValue(new Promise(() => {}));
      const pending = extractPdfText('https://example.com/doc.pdf', new Uint8Array([1]));
      await vi.advanceTimersByTimeAsync(35_000);
      const result = await pending;
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('Background PDF parsing timed out');
      expect(mockSendToBackground).toHaveBeenCalledTimes(1);
      expect(mockGetDocument).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('succeeds when pdfjs returns text', async () => {
    const pdfBytes = makePdfBytes(['hello']);
    mockSendToBackground.mockResolvedValue(
      legalDocumentResponse(pdfBytes, 'https://example.com/doc.pdf', 'application/pdf')
    );
    mockGetDocument.mockReturnValue({
      destroy: vi.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            cleanup: vi.fn(),
            getTextContent: () => Promise.resolve({ items: [{ str: 'pdfjs extracted text' }] }),
          }),
      }),
    } as never);

    const result = await extractPdfText('https://example.com/doc.pdf');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toContain('pdfjs extracted text');
  });

  it('rejects unparsed bytes instead of treating a raw Tj fragment as a complete PDF', async () => {
    const pdfBytes = makePdfBytes(['fallback content here']);
    mockSendToBackground.mockResolvedValue(
      legalDocumentResponse(pdfBytes, 'https://example.com/doc.pdf', 'application/pdf')
    );
    mockGetDocument.mockReturnValue({
      destroy: vi.fn().mockResolvedValue(undefined),
      promise: Promise.reject(new Error('pdfjs unavailable')),
    } as never);

    const result = await extractPdfText('https://example.com/doc.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('pdfjs unavailable');
  });

  it('returns error for empty PDF', async () => {
    const emptyBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header, no text
    mockSendToBackground.mockResolvedValue(
      legalDocumentResponse(emptyBytes, 'https://example.com/empty.pdf', 'application/pdf')
    );
    mockGetDocument.mockReturnValue({
      destroy: vi.fn().mockResolvedValue(undefined),
      promise: Promise.resolve({
        numPages: 1,
        getPage: () =>
          Promise.resolve({
            cleanup: vi.fn(),
            getTextContent: () => Promise.resolve({ items: [] }),
          }),
      }),
    } as never);

    const result = await extractPdfText('https://example.com/empty.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('no extractable text');
  });

  it('handles password-protected PDF error', async () => {
    // A password error from the download or parser reaches the user-facing wrapper.
    mockSendToBackground.mockRejectedValue(new Error('password required'));
    // also mock global fetch to throw the same
    vi.stubGlobal('fetch', () => Promise.reject(new Error('password required')));

    const result = await extractPdfText('https://example.com/secure.pdf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('password-protected');
    vi.unstubAllGlobals();
  });
});
