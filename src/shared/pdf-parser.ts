import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export const MAX_PDF_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_TEXT_LENGTH = 500_000;

export async function parsePdfBytes(bytes: Uint8Array): Promise<string> {
  if (!bytes.length || bytes.length > MAX_PDF_BYTES)
    throw new Error('PDF exceeds the download size limit or is empty');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(pdfWorkerUrl.replace(/^\//, ''));
  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    stopAtErrors: true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await loadingTask.promise;
        if (pdf.numPages > 200) throw new Error('PDF exceeds the 200-page analysis limit');
        const pages: string[] = [];
        let length = 0;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : ''))
            .join(' ');
          length += text.length + (i > 1 ? 2 : 0);
          if (length > MAX_PDF_TEXT_LENGTH)
            throw new Error('PDF text exceeds the analysis size limit');
          pages.push(text);
          page.cleanup();
        }
        return pages.join('\n\n');
      })(),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PDF parsing timed out')), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await loadingTask.destroy();
  }
}
