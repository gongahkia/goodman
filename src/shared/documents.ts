export interface AgreementDocument {
  frameId?: number;
  id: string;
  url: string;
  title: string;
  kind: 'terms' | 'privacy' | 'cookies' | 'agreement' | 'selection';
  language: string;
}

export function canonicalDocumentUrl(value: string): string {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 4096
  )
    throw new Error('Use an HTTP(S) agreement URL without credentials.');
  // Preserve document routes while dropping known account/session and advertising parameters.
  for (const key of [...url.searchParams.keys()]) {
    if (
      /^(?:utm_.*|gclid|fbclid|ref|token|access_token|auth|authorization|session|sessionid|password|secret|email|account_id|user_id|customer_id|nonce|signature|api_key)$/i.test(
        key
      )
    )
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.hash = url.hash.split(':~:text=')[0] ?? '';
  return url.href;
}

export function createDocument(
  value: string,
  title = '',
  language = '',
  selection = false
): AgreementDocument {
  const url = canonicalDocumentUrl(value);
  const label = `${title} ${new URL(url).pathname}`.toLowerCase();
  const kind: AgreementDocument['kind'] = selection
    ? 'selection'
    : /privacy|confidentialité|datenschutz|隐私|隱私|privacidad/.test(label)
      ? 'privacy'
      : /cookie/.test(label)
        ? 'cookies'
        : /terms|conditions|tos|eula|条款|條款|bedingungen/.test(label)
          ? 'terms'
          : 'agreement';
  const locale = language.toLowerCase().slice(0, 40);
  return {
    id: JSON.stringify([url, kind, locale]),
    url,
    kind,
    language: locale,
    title:
      title.trim().slice(0, 160) ||
      {
        terms: 'Terms of service',
        privacy: 'Privacy policy',
        cookies: 'Cookie policy',
        agreement: 'Agreement',
        selection: 'Selected or pasted text',
      }[kind],
  };
}

export function normalizeDocument(value: unknown): AgreementDocument | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const doc = value as AgreementDocument;
  if (
    typeof doc.url !== 'string' ||
    typeof doc.title !== 'string' ||
    typeof doc.language !== 'string' ||
    !['terms', 'privacy', 'cookies', 'agreement', 'selection'].includes(doc.kind)
  )
    return undefined;
  try {
    const url = canonicalDocumentUrl(doc.url);
    const language = doc.language.toLowerCase().slice(0, 40);
    return {
      url,
      language,
      kind: doc.kind,
      title: doc.title.slice(0, 160),
      id: JSON.stringify([url, doc.kind, language]),
      ...(Number.isInteger(doc.frameId) && doc.frameId! >= 0 ? { frameId: doc.frameId } : {}),
    };
  } catch {
    return undefined;
  }
}

export function sourceQuoteUrl(document: AgreementDocument, quote: string): string {
  const url = new URL(document.url);
  // Text fragments are hints; the original remains readable in browsers without support.
  if (quote.trim())
    url.hash = `${url.hash.slice(1)}:~:text=${encodeURIComponent(quote.slice(0, 250))}`;
  return url.href;
}

/** Replace discovery hints with fetched metadata without counting one source twice. */
export function mergeDocuments(
  previous: AgreementDocument[],
  incoming: AgreementDocument[]
): AgreementDocument[] {
  const result = [...previous];
  for (const doc of incoming) {
    const index = result.findIndex(
      (old) =>
        old.url === doc.url &&
        old.kind === doc.kind &&
        (!old.language || !doc.language || old.language === doc.language)
    );
    if (index < 0) result.push(doc);
    else if (doc.language || !result[index]!.language) result[index] = doc;
  }
  return result.slice(-20);
}
