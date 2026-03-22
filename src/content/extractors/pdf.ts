import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { sendToBackground } from '@shared/messaging';

export async function extractPdfText(url: string): Promise<Result<string, Error>> {
  try {
    const response = await sendToBackground({
      type: 'FETCH_URL',
      payload: { url },
    });

    const result = response as { ok: boolean; data?: string; error?: string };
    if (!result.ok || !result.data) {
      return err(new Error(result.error ?? 'Failed to fetch PDF'));
    }

    const pdfjs = await import('pdfjs-dist');
    const binaryString = atob(result.data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

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

    const fullText = pages.join('\n\n');
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

export function isPdfUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}
