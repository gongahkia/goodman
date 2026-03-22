import type { DetectedElement } from './checkbox';

const CONSENT_CLASS_PATTERN = /cookie|consent|gdpr|privacy|banner|notice/i;
const TC_KEYWORDS = ['terms', 'conditions', 'privacy', 'policy', 'agree', 'consent', 'cookie'];
const ACTION_KEYWORDS = ['accept', 'agree', 'reject', 'manage', 'close', 'decline', 'allow', 'deny', 'got it', 'i understand'];

export function detectModals(root: Element): DetectedElement[] {
  const results: DetectedElement[] = [];

  const byClassOrId = findByClassOrId(root);
  results.push(...byClassOrId);

  const byRole = findByRole(root);
  results.push(...byRole);

  const byPosition = findByPosition(root);
  results.push(...byPosition);

  return deduplicateByElement(results);
}

function findByClassOrId(root: Element): DetectedElement[] {
  const results: DetectedElement[] = [];
  const allElements = root.querySelectorAll('*');

  for (const el of allElements) {
    const className = el.className.toString();
    const id = el.id;
    if (CONSENT_CLASS_PATTERN.test(className) || CONSENT_CLASS_PATTERN.test(id)) {
      const analysis = analyzeCandidate(el as HTMLElement);
      if (analysis) results.push(analysis);
    }
  }

  return results;
}

function findByRole(root: Element): DetectedElement[] {
  const results: DetectedElement[] = [];
  const dialogs = root.querySelectorAll('[role="dialog"], [role="alertdialog"]');

  for (const dialog of dialogs) {
    const text = (dialog.textContent ?? '').toLowerCase();
    if (TC_KEYWORDS.some((kw) => text.includes(kw))) {
      const analysis = analyzeCandidate(dialog as HTMLElement);
      if (analysis) results.push(analysis);
    }
  }

  return results;
}

function findByPosition(root: Element): DetectedElement[] {
  const results: DetectedElement[] = [];
  const allElements = root.querySelectorAll('*');

  for (const el of allElements) {
    const htmlEl = el as HTMLElement;
    const style = getComputedStyle(htmlEl);
    const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';

    if (!isFixedOrSticky) continue;

    const text = (htmlEl.textContent ?? '').toLowerCase();
    if (TC_KEYWORDS.some((kw) => text.includes(kw))) {
      const analysis = analyzeCandidate(htmlEl);
      if (analysis) results.push(analysis);
    }
  }

  return results;
}

function analyzeCandidate(el: HTMLElement): DetectedElement | null {
  const text = (el.textContent ?? '').toLowerCase();
  const foundKeywords: string[] = [];
  let score = 0;

  for (const keyword of TC_KEYWORDS) {
    if (text.includes(keyword)) {
      foundKeywords.push(keyword);
      score += 0.15;
    }
  }

  if (foundKeywords.length === 0) return null;

  const hasActionButton = hasAction(el);
  if (!hasActionButton) return null;

  score += 0.2;

  const style = getComputedStyle(el);
  const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';
  if (isFixedOrSticky) score += 0.15;

  const isDialog =
    el.getAttribute('role') === 'dialog' || el.getAttribute('role') === 'alertdialog';
  if (isDialog) score += 0.2;

  const type = classifyType(el);
  const confidence = Math.min(score, 1.0);
  const nearestLink = el.querySelector('a[href]')?.getAttribute('href') ?? null;

  return {
    element: el,
    type,
    confidence,
    keywords: foundKeywords,
    nearestLink,
  };
}

function hasAction(el: HTMLElement): boolean {
  const buttons = el.querySelectorAll('button, [role="button"], input[type="submit"], a');
  for (const btn of buttons) {
    const btnText = (btn.textContent ?? '').toLowerCase();
    if (ACTION_KEYWORDS.some((kw) => btnText.includes(kw))) {
      return true;
    }
  }
  return false;
}

function classifyType(el: HTMLElement): 'modal' | 'banner' {
  const role = el.getAttribute('role');
  if (role === 'dialog' || role === 'alertdialog') return 'modal';

  const style = getComputedStyle(el);
  if (style.position === 'fixed' || style.position === 'sticky') {
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.top < viewportHeight * 0.3 || rect.bottom > viewportHeight * 0.7) {
      return 'banner';
    }
  }

  return 'modal';
}

function deduplicateByElement(results: DetectedElement[]): DetectedElement[] {
  const seen = new Set<HTMLElement>();
  return results.filter((r) => {
    if (seen.has(r.element)) return false;
    seen.add(r.element);
    return true;
  });
}
