export interface DetectedElement {
  element: HTMLElement;
  type: 'checkbox' | 'modal' | 'banner' | 'fullpage';
  confidence: number;
  keywords: string[];
  nearestLink: string | null;
}

const TC_KEYWORDS = ['terms', 'conditions', 'privacy', 'policy', 'agree', 'consent', 'eula', 'tos'];
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
  let nearestLink: string | null = null;
  let score = 0;

  const label = findAssociatedLabel(checkbox);
  if (label) {
    const labelResult = scanElementForKeywords(label);
    foundKeywords.push(...labelResult.keywords);
    score += labelResult.score * 1.5;
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
      const distanceFactor = 1 - level * 0.15;
      score += sibResult.score * distanceFactor;
      foundKeywords.push(...sibResult.keywords);
      nearestLink = nearestLink ?? findNearestLink(sibling);
    }
  }

  const links = findLinksWithinDistance(checkbox, MAX_VERTICAL_DISTANCE);
  for (const link of links) {
    const linkResult = scanElementForKeywords(link);
    foundKeywords.push(...linkResult.keywords);
    score += linkResult.score * 0.8;
    nearestLink = nearestLink ?? link.getAttribute('href');
  }

  const uniqueKeywords = [...new Set(foundKeywords)];
  const confidence = Math.min(score, 1.0);

  if (uniqueKeywords.length === 0) return null;

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

function scanElementForKeywords(el: Element): { keywords: string[]; score: number } {
  const text = (el.textContent ?? '').toLowerCase();
  const found: string[] = [];
  let score = 0;

  for (const keyword of TC_KEYWORDS) {
    if (text.includes(keyword)) {
      found.push(keyword);
      score += 0.2;
    }
  }

  if (text.includes('terms and conditions') || text.includes('terms of service')) {
    score += 0.3;
  }
  if (text.includes('privacy policy')) {
    score += 0.2;
  }

  return { keywords: found, score };
}

function findNearestLink(el: Element): string | null {
  const anchor = el.querySelector('a[href]');
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
      const text = (link.textContent ?? '').toLowerCase();
      if (TC_KEYWORDS.some((kw) => text.includes(kw))) {
        nearby.push(link as HTMLAnchorElement);
      }
    }
  }

  return nearby;
}
