export interface DetectedElement {
  element: HTMLElement;
  type: 'checkbox' | 'modal' | 'banner' | 'fullpage';
  confidence: number;
  keywords: string[];
  nearestLink: string | null;
}

const LEGAL_KEYWORDS = [
  'terms',
  'conditions',
  'terms of service',
  'terms and conditions',
  'privacy',
  'privacy policy',
  'policy',
  'eula',
  'tos',
  'arbitration',
  'subscription',
  'cancellation',
];
const AGREEMENT_KEYWORDS = [
  'agree',
  'accept',
  'consent',
  'acknowledge',
  'by checking',
  'by continuing',
  'i have read',
  'i understand',
];
const MARKETING_KEYWORDS = [
  'newsletter',
  'marketing',
  'promotions',
  'offers',
  'updates',
  'email me',
  'text me',
  'sms',
  'product updates',
  'subscribe',
];
const MAX_ANCESTOR_LEVELS = 5;
const MAX_VERTICAL_DISTANCE = 200;

export function detectCheckboxes(root: Element): DetectedElement[] {
  const checkboxes = root.querySelectorAll('input[type="checkbox"]');
  const results: DetectedElement[] = [];

  for (const checkbox of checkboxes) {
    const result = analyzeCheckbox(checkbox as HTMLInputElement);
    if (result) {
      results.push(result);
    }
  }

  return results;
}

function analyzeCheckbox(checkbox: HTMLInputElement): DetectedElement | null {
  const foundKeywords: string[] = [];
  const contextSegments: string[] = [];
  let nearestLink: string | null = null;

  const label = findAssociatedLabel(checkbox);
  if (label) {
    const labelResult = scanElementForKeywords(label);
    foundKeywords.push(...labelResult.keywords);
    contextSegments.push(labelResult.text);
    nearestLink = findNearestLink(label) ?? nearestLink;
  }

  let current: Element | null = checkbox;
  for (let level = 0; level < MAX_ANCESTOR_LEVELS && current; level++) {
    current = current.parentElement;
    if (!current) break;

    const siblings = Array.from(current.children);
    for (const sibling of siblings) {
      if (sibling === checkbox || sibling === label) continue;
      const sibResult = scanElementForKeywords(sibling);
      foundKeywords.push(...sibResult.keywords);
      contextSegments.push(sibResult.text);
      nearestLink = nearestLink ?? findNearestLink(sibling);
    }
  }

  const links = findLinksWithinDistance(checkbox, MAX_VERTICAL_DISTANCE);
  for (const link of links) {
    const linkResult = scanElementForKeywords(link);
    foundKeywords.push(...linkResult.keywords);
    contextSegments.push(linkResult.text);
    nearestLink = nearestLink ?? link.getAttribute('href');
  }

  const contextText = contextSegments.join(' ').toLowerCase();
  if (!hasStrongAgreementLanguage(contextText)) return null;
  if (!hasLegalContext(contextText, nearestLink)) return null;
  if (looksLikeMarketingOptIn(contextText, nearestLink)) return null;

  const legalMatches = countMatches(contextText, LEGAL_KEYWORDS);
  const agreementMatches = countMatches(contextText, AGREEMENT_KEYWORDS);
  const marketingMatches = countMatches(contextText, MARKETING_KEYWORDS);
  let score = 0;

  score += Math.min(legalMatches * 0.18, 0.45);
  score += Math.min(agreementMatches * 0.2, 0.35);
  if (nearestLink) score += 0.2;
  if (contextText.includes('terms and conditions') || contextText.includes('terms of service')) {
    score += 0.2;
  }
  if (contextText.includes('privacy policy')) {
    score += 0.1;
  }
  score -= Math.min(marketingMatches * 0.2, 0.4);

  const uniqueKeywords = [...new Set(foundKeywords)];
  const confidence = Math.max(0, Math.min(score, 1.0));

  if (uniqueKeywords.length === 0 || confidence < 0.45) return null;

  return {
    element: checkbox,
    type: 'checkbox',
    confidence,
    keywords: uniqueKeywords,
    nearestLink,
  };
}

function findAssociatedLabel(checkbox: HTMLInputElement): HTMLLabelElement | null {
  if (checkbox.id) {
    const label = document.querySelector(`label[for="${checkbox.id}"]`);
    if (label) return label as HTMLLabelElement;
  }
  const parent = checkbox.closest('label');
  return parent as HTMLLabelElement | null;
}

function scanElementForKeywords(el: Element): { keywords: string[]; text: string } {
  const text = (el.textContent ?? '').toLowerCase();
  const found: string[] = [];

  for (const keyword of [...LEGAL_KEYWORDS, ...AGREEMENT_KEYWORDS]) {
    if (text.includes(keyword)) {
      found.push(keyword);
    }
  }

  return { keywords: found, text };
}

function findNearestLink(el: Element): string | null {
  const anchor = Array.from(el.querySelectorAll('a[href]')).find((candidate) =>
    isLegalLink(candidate as HTMLAnchorElement)
  );
  return anchor?.getAttribute('href') ?? null;
}

function findLinksWithinDistance(
  checkbox: HTMLElement,
  maxDistance: number
): HTMLAnchorElement[] {
  const rect = checkbox.getBoundingClientRect();
  const links = document.querySelectorAll('a[href]');
  const nearby: HTMLAnchorElement[] = [];

  for (const link of links) {
    const linkRect = link.getBoundingClientRect();
    const verticalDistance = Math.abs(linkRect.top - rect.top);
    if (verticalDistance <= maxDistance) {
      if (isLegalLink(link as HTMLAnchorElement)) {
        nearby.push(link as HTMLAnchorElement);
      }
    }
  }

  return nearby;
}

function hasStrongAgreementLanguage(text: string): boolean {
  return AGREEMENT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function hasLegalContext(text: string, nearestLink: string | null): boolean {
  return (
    LEGAL_KEYWORDS.some((keyword) => text.includes(keyword)) ||
    isLegalHref(nearestLink)
  );
}

function looksLikeMarketingOptIn(text: string, nearestLink: string | null): boolean {
  const marketingMatches = countMatches(text, MARKETING_KEYWORDS);
  const explicitLegalPhrase =
    text.includes('terms and conditions') ||
    text.includes('terms of service') ||
    text.includes('privacy policy') ||
    isLegalHref(nearestLink);

  return marketingMatches > 0 && !explicitLegalPhrase;
}

function countMatches(text: string, keywords: string[]): number {
  return keywords.reduce(
    (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
    0
  );
}

function isLegalLink(link: HTMLAnchorElement): boolean {
  const text = (link.textContent ?? '').toLowerCase();
  const href = link.getAttribute('href');
  return hasLegalContext(text, href);
}

function isLegalHref(href: string | null): boolean {
  if (!href) return false;
  const normalizedHref = href.toLowerCase();
  return (
    normalizedHref.includes('terms') ||
    normalizedHref.includes('privacy') ||
    normalizedHref.includes('policy') ||
    normalizedHref.includes('conditions') ||
    normalizedHref.includes('tos') ||
    normalizedHref.includes('eula')
  );
}
