import type { DetectedElement } from './checkbox';
import type { DetectionRoot } from './roots';
import { isVisibleSurface } from './roots';
import { isAgreementText, isLegalText } from './signals';

/** Consent tied to a signup/checkout action without a native checkbox. */
export function detectImplicitConsent(root: DetectionRoot): DetectedElement[] {
  const results: DetectedElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('p, label, small, [data-consent]')) {
    const text = element.textContent ?? '';
    if (
      text.length > 1800 ||
      !isLegalText(text) ||
      !isAgreementText(text) ||
      !isVisibleSurface(element)
    )
      continue;
    const container = element.closest('form') ?? element.parentElement;
    if (!container || container.querySelector('input[type="checkbox"], [role="checkbox"]'))
      continue;
    const action = container.querySelector('button, input[type="submit"], [role="button"]');
    if (!action || !isVisibleSurface(action) || element.closest('nav,footer,article')) continue;
    const link = [...element.querySelectorAll<HTMLAnchorElement>('a[href]')].find((a) =>
      isLegalText(a.textContent + ' ' + a.href)
    );
    results.push({
      element,
      type: 'implicit',
      confidence: link ? 0.95 : 0.85,
      keywords: ['agreement'],
      nearestLink: link?.href ?? null,
    });
  }
  return results;
}
