import type { DetectedElement } from './checkbox';

const LEGAL_KEYWORDS = [
  'terms', 'conditions', 'privacy', 'policy', 'agreement', 'license',
  'consent', 'liability', 'indemnify', 'arbitration', 'governing law',
  'warranty', 'disclaimer', 'intellectual property', 'termination',
  'confidential', 'jurisdiction', 'binding', 'waiver', 'compliance',
];

const LEGAL_PATH_SEGMENTS = ['/terms', '/tos', '/legal', '/privacy', '/eula', '/conditions', '/agreement'];

const KEYWORD_DENSITY_THRESHOLD = 0.02;
const MIN_TEXT_LENGTH = 2000;

export function detectFullPageTC(root: Element): DetectedElement | null {
  const bodyText = root.textContent ?? '';
  if (bodyText.length < MIN_TEXT_LENGTH) return null;

  let score = 0;

  const density = computeKeywordDensity(bodyText);
  if (density > KEYWORD_DENSITY_THRESHOLD) {
    score += 0.4;
  } else if (density > 0.01) {
    score += 0.2;
  }

  const urlScore = checkUrlPath();
  score += urlScore;

  const titleScore = checkTitleAndHeadings(root);
  score += titleScore;

  if (score < 0.3) return null;

  const confidence = Math.min(score, 1.0);

  return {
    element: root as HTMLElement,
    type: 'fullpage',
    confidence,
    keywords: findPresentKeywords(bodyText),
    nearestLink: null,
  };
}

function computeKeywordDensity(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  let keywordCount = 0;
  const lowerText = text.toLowerCase();
  for (const keyword of LEGAL_KEYWORDS) {
    const regex = new RegExp(keyword, 'gi');
    const matches = lowerText.match(regex);
    keywordCount += matches?.length ?? 0;
  }

  return keywordCount / words.length;
}

function checkUrlPath(): number {
  try {
    const path = window.location.pathname.toLowerCase();
    for (const segment of LEGAL_PATH_SEGMENTS) {
      if (path.includes(segment)) {
        return 0.4;
      }
    }
  } catch {
    // not in browser context
  }
  return 0;
}

function checkTitleAndHeadings(root: Element): number {
  let score = 0;

  try {
    const title = document.title.toLowerCase();
    if (LEGAL_KEYWORDS.some((kw) => title.includes(kw))) {
      score += 0.15;
    }
  } catch {
    // not in browser context
  }

  const h1 = root.querySelector('h1');
  if (h1) {
    const h1Text = (h1.textContent ?? '').toLowerCase();
    if (LEGAL_KEYWORDS.some((kw) => h1Text.includes(kw))) {
      score += 0.15;
    }
  }

  return score;
}

function findPresentKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return LEGAL_KEYWORDS.filter((kw) => lower.includes(kw));
}
