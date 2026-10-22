import { sendToBackground } from '@shared/messaging';

export async function fetchLegalResource(
  url: string,
  responseType: 'text' | 'base64'
): Promise<string> {
  const data = await requestLegalResource(url, responseType);
  if (typeof data !== 'string') throw new Error('Invalid document download response');
  return data;
}

export interface LegalDocument {
  bytes: Uint8Array;
  contentType: string;
  url: string;
}

export async function fetchLegalDocument(url: string): Promise<LegalDocument> {
  const requestedUrl = new URL(url, window.location.href).href;
  const raw = await requestLegalResource(requestedUrl, 'document');
  if (!raw || typeof raw !== 'object') throw new Error('Invalid document download response');
  const resource = raw as Record<string, unknown>;
  if (
    typeof resource.body !== 'string' ||
    resource.body.length > Math.ceil((8 * 1024 * 1024) / 3) * 4 ||
    typeof resource.contentType !== 'string' ||
    typeof resource.url !== 'string'
  )
    throw new Error('Invalid document metadata or size');
  const finalUrl = new URL(resource.url);
  if (!['http:', 'https:'].includes(finalUrl.protocol) || finalUrl.username || finalUrl.password)
    throw new Error('Invalid final document URL');
  const binary = atob(resource.body);
  if (binary.length > 8 * 1024 * 1024) throw new Error('Document exceeds the download size limit');
  return {
    bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)),
    contentType: resource.contentType,
    url: finalUrl.href,
  };
}

export function isPdfDocument(document: LegalDocument): boolean {
  return (
    document.contentType.split(';')[0]?.trim().toLowerCase() === 'application/pdf' ||
    String.fromCharCode(...document.bytes.subarray(0, 1024)).includes('%PDF-')
  );
}

export function decodeLegalDocument(document: LegalDocument): string {
  const bytes = document.bytes;
  let encoding = /charset\s*=\s*["']?([^;\s"']+)/i.exec(document.contentType)?.[1];
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = 'utf-8';
  else if (!encoding && !document.contentType.toLowerCase().startsWith('text/plain'))
    encoding = /<meta\b[^>]*charset\s*=\s*["']?([^;\s"'/>]+)/i.exec(
      String.fromCharCode(...bytes.subarray(0, 4096))
    )?.[1];
  return new TextDecoder(encoding || 'utf-8', { fatal: true }).decode(bytes);
}

async function requestLegalResource(
  url: string,
  responseType: 'text' | 'base64' | 'document'
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = (await Promise.race([
      sendToBackground({ type: 'FETCH_URL', payload: { url, responseType } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Background download timed out')), 15_000);
      }),
    ])) as { ok?: boolean; data?: unknown; error?: string } | null;
    if (response?.ok === true) return response.data;
    throw new Error(response?.error || 'Could not download the linked agreement');
  } finally {
    clearTimeout(timer);
  }
}
