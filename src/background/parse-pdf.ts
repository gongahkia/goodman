import { MAX_PDF_BYTES, parsePdfBytes } from '@shared/pdf-parser';

/** Internal byte-only parsing: no fetch, storage, page scripts or provider calls. */
export async function handleParsePdf(
  payload: unknown
): Promise<{ ok: true; data: string } | { ok: false; error: string }> {
  try {
    const body =
      payload && typeof payload === 'object' && 'body' in payload ? payload.body : undefined;
    if (
      typeof body !== 'string' ||
      !body.length ||
      body.length > Math.ceil(MAX_PDF_BYTES / 3) * 4
    ) {
      throw new Error('Invalid or oversized PDF bytes');
    }
    const binary = atob(body);
    if (!binary.length || binary.length > MAX_PDF_BYTES)
      throw new Error('Invalid or oversized PDF bytes');
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { ok: true, data: await parsePdfBytes(bytes) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not parse PDF' };
  }
}
