import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { sendToBackground } from '@shared/messaging';

const FETCH_TIMEOUT_MS = 500;

export async function extractPdfText(url: string): Promise<Result<string, Error>> {
  try {
    const bytes = await fetchPdfBytes(url);
    const pdfJsText = await extractWithPdfJs(bytes);
    const fallbackText = extractTextFromPdfBytes(bytes);
    const fullText = (pdfJsText || fallbackText).trim();
    if (fullText.trim().length === 0) {
      return err(new Error('PDF contains no extractable text (may be image-only)'));
    }

    return ok(fullText);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('password')) {
      return err(new Error('PDF is password-protected'));
    }
    return err(new Error(`PDF extraction failed: ${message}`));
  }
}

async function extractWithPdfJs(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import('pdfjs-dist');
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      pages.push(pageText);
    }

    return pages.join('\n\n');
  } catch {
    return '';
  }
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const requestUrl = resolveUrl(url);

  try {
    const response = await fetchWithTimeout<{
      ok: boolean;
      data?: string;
      error?: string;
    }>({
      type: 'FETCH_URL',
      payload: { url: requestUrl, responseType: 'base64' },
    });

    if (response.ok && response.data) {
      return decodeBase64(response.data);
    }
  } catch {
    // Fall through to direct fetch for same-origin URLs.
  }

  const directResponse = await fetch(requestUrl);
  if (!directResponse.ok) {
    throw new Error(`Failed to fetch PDF: HTTP ${directResponse.status}`);
  }

  return new Uint8Array(await directResponse.arrayBuffer());
}

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const decoded = new TextDecoder('latin1').decode(bytes);
  const matches = [...decoded.matchAll(/\(([^()]*)\)\s*Tj/g)].map((match) =>
    (match[1] ?? '').replace(/\\\(/g, '(').replace(/\\\)/g, ')')
  );
  return matches.join(' ').trim();
}

export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.href);
    return urlObj.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

async function fetchWithTimeout<T>(
  message: Parameters<typeof sendToBackground>[0]
): Promise<T> {
  return Promise.race([
    sendToBackground(message) as Promise<T>,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Background fetch timed out')), FETCH_TIMEOUT_MS);
    }),
  ]);
}

function resolveUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch {
    return url;
  }
}
