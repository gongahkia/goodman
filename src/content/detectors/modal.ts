import { isVisibleSurface, type DetectionRoot } from './roots';
import { CONSENT_ACTION, LEGAL_PHRASES } from './signals';
import type { DetectedElement } from './checkbox';
import { detectConsentDarkPatterns } from './dark-patterns';
import { MIN_MODAL_TEXT_LENGTH } from '@shared/constants';

const CONSENT_CLASS_PATTERN = /cookie|consent|gdpr|privacy|banner|notice/i;
const TC_KEYWORDS = [...LEGAL_PHRASES, 'agree', 'consent', 'cookie'];
const ACTION_PATTERN = CONSENT_ACTION;

export function detectModals(root: DetectionRoot): DetectedElement[] {
  const results: DetectedElement[] = [];

  const byClassOrId = findByClassOrId(root);
  results.push(...byClassOrId);

  const byRole = findByRole(root);
  results.push(...byRole);

  const byPosition = findByPosition(root);
  results.push(...byPosition);

  return deduplicateByElement(results);
}

function findByClassOrId(root: DetectionRoot): DetectedElement[] {
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

function findByRole(root: DetectionRoot): DetectedElement[] {
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

function findByPosition(root: DetectionRoot): DetectedElement[] {
  const results: DetectedElement[] = [];
  // Examine ancestors of actual consent actions, not computed styles for every DOM node.
  const visited = new Set<Element>();
  for (const action of root.querySelectorAll('button,[role="button"],input[type="submit"],a')) {
    if (!ACTION_PATTERN.test(action.textContent ?? action.getAttribute('value') ?? '')) continue;
    let el: Element | null = action.parentElement;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      if (visited.has(el)) continue;
      visited.add(el);
      const text = (el.textContent ?? '').toLowerCase();
      if (!TC_KEYWORDS.some((kw) => text.includes(kw))) continue;
      const style = getComputedStyle(el);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const analysis = analyzeCandidate(el as HTMLElement);
      if (analysis) results.push(analysis);
    }
  }

  return results;
}

function analyzeCandidate(el: HTMLElement): DetectedElement | null {
  if (el.closest('nav,[role="navigation"]') || !isVisibleSurface(el)) return null;
  const text = (el.textContent ?? '').toLowerCase();
  if (text.trim().length < MIN_MODAL_TEXT_LENGTH) return null;
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
  const darkPatterns = detectConsentDarkPatterns(el);
  score += getDarkPatternConfidenceBoost(darkPatterns);
  const confidence = Math.min(score, 1.0);
  const nearestLink =
    [...el.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) =>
      TC_KEYWORDS.some((word) => (a.textContent + ' ' + a.href).toLowerCase().includes(word))
    )?.href ?? null;

  const result: DetectedElement = {
    element: el,
    type,
    confidence,
    keywords: foundKeywords,
    nearestLink,
  };
  if (darkPatterns.length > 0) result.darkPatterns = darkPatterns;
  return result;
}

function hasAction(el: HTMLElement): boolean {
  const buttons = el.querySelectorAll('button, [role="button"], input[type="submit"], a');
  for (const btn of buttons) {
    if (btn.closest('nav,[role="navigation"]')) continue;
    const btnText = (btn.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (ACTION_PATTERN.test(btnText)) {
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

function getDarkPatternConfidenceBoost(
  findings: NonNullable<DetectedElement['darkPatterns']>
): number {
  if (findings.some((finding) => finding.severity === 'high')) return 0.15;
  if (findings.some((finding) => finding.severity === 'medium')) return 0.1;
  if (findings.length > 0) return 0.05;
  return 0;
}

function deduplicateByElement(results: DetectedElement[]): DetectedElement[] {
  const seen = new Set<HTMLElement>();
  return results.filter((r) => {
    if (seen.has(r.element)) return false;
    seen.add(r.element);
    return true;
  });
}
