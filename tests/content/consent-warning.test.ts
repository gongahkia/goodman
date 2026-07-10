import { afterEach, describe, expect, it } from 'vitest';
import { renderConsentWarningBadge, removeConsentWarningBadge } from '@content/ui/consent-warning';
import type { ScoredDetection } from '@content/detectors/scoring';
import type { Summary } from '@providers/types';
import { mockStorage } from '../mocks/chrome';

describe('consent warning badge', () => {
  afterEach(() => {
    removeConsentWarningBadge();
    document.body.innerHTML = '';
  });

  it('renders only for detections with heuristic evidence', async () => {
    await renderConsentWarningBadge(makeDetection([]), null, 'example.com', 'light');
    expect(document.getElementById('goodman-consent-warning-host')).toBeNull();

    await renderConsentWarningBadge(makeDetection(), null, 'example.com', 'light');

    const host = getHost();
    const badge = getBadge(host);
    expect(badge?.textContent).toContain('HIGH consent pattern');
    expect(badge?.textContent).toContain('Evidence: Found "Accept All Cookies" without a visible reject-all action.');
  });

  it('uses the existing summary when available', async () => {
    await renderConsentWarningBadge(makeDetection(), makeSummary(), 'example.com', 'light');

    const badge = getBadge(getHost());

    expect(badge?.textContent).toContain('Summary: Optional cookies enable analytics and advertising data sharing.');
  });

  it('keeps page controls clickable except the dismiss button', async () => {
    await renderConsentWarningBadge(makeDetection(), null, 'example.com', 'light');

    const host = getHost();
    const badge = getBadge(host) as HTMLElement;
    const dismiss = badge.querySelector('button') as HTMLButtonElement;

    expect(host.style.pointerEvents).toBe('none');
    expect(getComputedStyle(badge).pointerEvents).toBe('none');
    expect(getComputedStyle(dismiss).pointerEvents).toBe('auto');
  });

  it('stores dismissals locally per domain', async () => {
    await renderConsentWarningBadge(makeDetection(), null, 'example.com', 'light');

    const dismiss = getBadge(getHost())?.querySelector('button') as HTMLButtonElement;
    dismiss.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockStorage.dismissedConsentWarnings).toMatchObject({
      'example.com': expect.any(Number),
    });
    expect(document.getElementById('goodman-consent-warning-host')).toBeNull();
  });

  it('does not render when the site was dismissed', async () => {
    mockStorage.dismissedConsentWarnings = { 'example.com': Date.now() };

    await renderConsentWarningBadge(makeDetection(), null, 'example.com', 'light');

    expect(document.getElementById('goodman-consent-warning-host')).toBeNull();
  });
});

function makeDetection(
  darkPatterns: ScoredDetection['darkPatterns'] = [
    {
      id: 'accept_all_without_equal_reject',
      label: 'Accept all without equal reject',
      severity: 'high',
      evidence: 'Found "Accept All Cookies" without a visible reject-all action.',
    },
  ]
): ScoredDetection {
  const element = document.createElement('div');
  element.textContent = 'Cookie banner';
  document.body.appendChild(element);
  return {
    element,
    type: 'banner',
    confidence: 0.9,
    weightedConfidence: 0.9,
    keywords: ['cookie'],
    nearestLink: null,
    darkPatterns,
  };
}

function makeSummary(): Summary {
  return {
    summary: 'Optional cookies enable analytics and advertising data sharing.',
    keyPoints: [],
    redFlags: [],
    severity: 'medium',
  };
}

function getHost(): HTMLElement {
  return document.getElementById('goodman-consent-warning-host') as HTMLElement;
}

function getBadge(host: HTMLElement): HTMLElement | null {
  return host.shadowRoot?.querySelector('.goodman-consent-warning') ?? null;
}
