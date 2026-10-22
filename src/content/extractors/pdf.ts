import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { sendToBackground } from '@shared/messaging';
import { MAX_PDF_BYTES, MAX_PDF_TEXT_LENGTH, parsePdfBytes } from '@shared/pdf-parser';
import { fetchLegalDocument } from './fetch';

export async function extractPdfText(
  url: string,
  downloadedBytes?: Uint8Array
): Promise<Result<string, Error>> {
  try {
    const bytes = downloadedBytes ?? (await fetchLegalDocument(url)).bytes;
    if (!bytes.length || bytes.length > MAX_PDF_BYTES)
      throw new Error('PDF exceeds the download size limit or is empty');
    // Firefox content scripts use Xray wrappers for page stream APIs. Parse in
    // the extension's own background realm; Chromium keeps its local parser.
    const fullText = (
      await (chrome.runtime.getURL('').startsWith('moz-extension:')
        ? parseInBackground(bytes)
        : parsePdfBytes(bytes))
    ).trim();
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

async function parseInBackground(bytes: Uint8Array): Promise<string> {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = (await Promise.race([
      sendToBackground({ type: 'PARSE_PDF', payload: { body: btoa(binary) } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Background PDF parsing timed out')), 35_000);
      }),
    ])) as { ok?: boolean; data?: unknown; error?: string } | null;
    if (response?.ok !== true) throw new Error(response?.error || 'Could not parse PDF');
    if (typeof response.data !== 'string' || response.data.length > MAX_PDF_TEXT_LENGTH) {
      throw new Error('Invalid PDF parsing response');
    }
    return response.data;
  } finally {
    clearTimeout(timer);
  }
}

export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.href);
    return urlObj.pathname.toLowerCase().endsWith('.pdf');
  } catch (e) {
    console.warn('[Goodman] isPdfUrl failed to parse URL:', url, e);
    return false;
  }
}
