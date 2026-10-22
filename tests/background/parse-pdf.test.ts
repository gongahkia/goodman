import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleParsePdf } from '@background/parse-pdf';
import { parsePdfBytes } from '@shared/pdf-parser';
import { getDocument } from 'pdfjs-dist';

vi.mock('pdfjs-dist', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: { workerSrc: '' } }));
const getDocumentMock = vi.mocked(getDocument);
const destroy = vi.fn().mockResolvedValue(undefined);
const cleanup = vi.fn();

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.useRealTimers());

function pdf(pages: string[]) {
  getDocumentMock.mockReturnValue({
    destroy,
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (index: number) => ({
        cleanup,
        getTextContent: async () => ({ items: [{ str: pages[index - 1], hasEOL: true }] }),
      }),
    }),
  } as never);
}

describe('extension-realm PDF parser', () => {
  it('decodes the same binary bytes and returns both pages without storage or network', async () => {
    pdf(['First clause.', 'Second clause.']);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await handleParsePdf({ body: 'AID/' })).toEqual({
      ok: true,
      data: 'First clause.\n\n\nSecond clause.\n',
    });
    expect(getDocumentMock).toHaveBeenCalledWith({
      data: new Uint8Array([0, 128, 255]),
      isEvalSupported: false,
      stopAtErrors: true,
    });
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(destroy).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it.each([
    null,
    {},
    { body: 3 },
    { body: '' },
    { body: '???' },
    { body: 'A'.repeat(Math.ceil((8 * 1024 * 1024) / 3) * 4 + 1) },
  ])('rejects malformed or oversized bytes before opening PDF.js', async (payload) => {
    expect((await handleParsePdf(payload)).ok).toBe(false);
    expect(getDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects a base64 payload whose decoded bytes exceed 8 MiB', async () => {
    expect(
      (await handleParsePdf({ body: 'A'.repeat(Math.ceil((8 * 1024 * 1024) / 3) * 4) })).ok
    ).toBe(false);
    expect(getDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects more than 200 pages and destroys the document', async () => {
    pdf(Array(201).fill('clause'));
    await expect(parsePdfBytes(new Uint8Array([1]))).rejects.toThrow('200-page');
    expect(cleanup).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('counts page separators toward the 500,000-character limit', async () => {
    pdf(['x'.repeat(249_999), 'y'.repeat(250_000)]);
    await expect(parsePdfBytes(new Uint8Array([1]))).rejects.toThrow('size limit');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('ends a stalled parser after 30 seconds and destroys the document', async () => {
    vi.useFakeTimers();
    getDocumentMock.mockReturnValue({ destroy, promise: new Promise(() => {}) } as never);
    const pending = expect(parsePdfBytes(new Uint8Array([1]))).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('propagates malformed PDF errors as bounded message results', async () => {
    getDocumentMock.mockReturnValue({
      destroy,
      promise: Promise.reject(new Error('Invalid PDF structure')),
    } as never);
    expect(await handleParsePdf({ body: 'AA==' })).toEqual({
      ok: false,
      error: 'Invalid PDF structure',
    });
    expect(destroy).toHaveBeenCalledOnce();
  });
});
