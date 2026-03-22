export interface NormalizerMetadata {
  effectiveDate: string | null;
  lastUpdated: string | null;
}

export interface NormalizedResult {
  text: string;
  metadata: NormalizerMetadata;
}

const DATE_LINE_PATTERNS = [
  /^(?:last\s+(?:updated|modified|revised))\s*[:\-—]\s*(.+)$/im,
  /^(?:effective\s+(?:date|as\s+of))\s*[:\-—]\s*(.+)$/im,
  /^(?:date\s+of\s+(?:last\s+)?(?:update|revision))\s*[:\-—]\s*(.+)$/im,
];

const BOILERPLATE_PATTERNS = [
  /^cookie\s+settings?\s*$/im,
  /^manage\s+(?:your\s+)?preferences?\s*$/im,
  /^©\s*\d{4}.*$/gm,
  /^copyright\s+\d{4}.*$/gim,
  /^all\s+rights\s+reserved\.?\s*$/gim,
];

export function normalizeText(raw: string): NormalizedResult {
  const metadata: NormalizerMetadata = {
    effectiveDate: null,
    lastUpdated: null,
  };

  let text = stripHtmlTags(raw);

  for (const pattern of DATE_LINE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const dateStr = match[1].trim();
      if (pattern.source.includes('effective')) {
        metadata.effectiveDate = dateStr;
      } else {
        metadata.lastUpdated = dateStr;
      }
      text = text.replace(match[0], '');
    }
  }

  for (const pattern of BOILERPLATE_PATTERNS) {
    text = text.replace(pattern, '');
  }

  text = collapseWhitespace(text);
  text = collapseNewlines(text);
  text = text.trim();

  return { text, metadata };
}

function stripHtmlTags(html: string): string {
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent ?? '';
  }
  return html.replace(/<[^>]*>/g, '');
}

function collapseWhitespace(text: string): string {
  return text.replace(/[^\S\n]+/g, ' ');
}

function collapseNewlines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}
