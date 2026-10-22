export function legalDocumentResponse(
  value: string | Uint8Array,
  url = 'https://example.test/terms',
  contentType = 'text/html; charset=utf-8'
) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return { ok: true, data: { body: btoa(String.fromCharCode(...bytes)), url, contentType } };
}
