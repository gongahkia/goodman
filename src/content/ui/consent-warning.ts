import type { ScoredDetection } from '@content/detectors/scoring';
import type { Summary } from '@providers/types';
import type { DarkPatternFinding, DarkPatternSeverity } from '@shared/dark-patterns';
import { getStorage, setStorage } from '@shared/storage';
import { positionOverlay } from './positioning';
import { getTheme } from './theme';

let currentBadge: HTMLElement | null = null;
let currentCleanup: (() => void) | null = null;

export async function renderConsentWarningBadge(
  detection: ScoredDetection,
  summary: Summary | null,
  domain: string,
  themePreference: 'auto' | 'light' | 'dark'
): Promise<void> {
  const findings = detection.darkPatterns ?? [];
  if (findings.length === 0 || await isDismissed(domain)) {
    removeConsentWarningBadge();
    return;
  }

  removeConsentWarningBadge();

  const topFinding = getHighestSeverityFinding(findings);
  const severity = topFinding.severity;
  const host = document.createElement('div');
  host.id = 'goodman-consent-warning-host';
  host.style.cssText = 'position:fixed;z-index:2147483646;top:0;left:0;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = getConsentWarningStyles();
  shadow.appendChild(style);

  const badge = document.createElement('aside');
  badge.className = `goodman-consent-warning tc-theme-${getTheme(themePreference)} goodman-consent-warning--${severity}`;
  badge.style.pointerEvents = 'none';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-label', `Goodman consent pattern warning: ${severity}`);

  const label = document.createElement('div');
  label.className = 'goodman-consent-warning-label';
  label.textContent = `${severity.toUpperCase()} consent pattern`;

  const body = document.createElement('p');
  body.className = 'goodman-consent-warning-copy';
  body.textContent = getBadgeCopy(topFinding, summary);

  const dismiss = document.createElement('button');
  dismiss.className = 'goodman-consent-warning-dismiss';
  dismiss.type = 'button';
  dismiss.style.pointerEvents = 'auto';
  dismiss.textContent = 'Dismiss for this site';
  dismiss.addEventListener('click', () => {
    removeConsentWarningBadge();
    void dismissForSite(domain).catch(e => console.warn('[Goodman] dismiss consent warning failed:', e));
  });

  badge.appendChild(label);
  badge.appendChild(body);
  badge.appendChild(dismiss);
  shadow.appendChild(badge);
  document.body.appendChild(host);
  currentCleanup = positionOverlay(host, detection.element);
  currentBadge = host;
}

export function removeConsentWarningBadge(): void {
  currentBadge?.remove();
  currentBadge = null;
  currentCleanup?.();
  currentCleanup = null;
}

async function isDismissed(domain: string): Promise<boolean> {
  const result = await getStorage('dismissedConsentWarnings');
  return result.ok && Boolean(result.data[domain]);
}

async function dismissForSite(domain: string): Promise<void> {
  const result = await getStorage('dismissedConsentWarnings');
  const dismissed = result.ok ? result.data : {};
  await setStorage('dismissedConsentWarnings', {
    ...dismissed,
    [domain]: Date.now(),
  });
}

function getHighestSeverityFinding(findings: DarkPatternFinding[]): DarkPatternFinding {
  return [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]!;
}

function severityRank(severity: DarkPatternSeverity): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function getBadgeCopy(finding: DarkPatternFinding, summary: Summary | null): string {
  const summaryLine = summary?.summary ? toSingleLine(summary.summary) : '';
  if (summaryLine) return `Summary: ${summaryLine}`;
  return `Evidence: ${toSingleLine(finding.evidence)}`;
}

function toSingleLine(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function getConsentWarningStyles(): string {
  return `
    :host { all: initial; }
    .goodman-consent-warning {
      --warn-low: #3f8f63;
      --warn-medium: #b07b12;
      --warn-high: #b54745;
      box-sizing: border-box;
      width: min(320px, calc(100vw - 24px));
      padding: 10px 12px;
      border-radius: 12px;
      font-family: "DM Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      pointer-events: none;
      box-shadow: 0 8px 22px rgba(15, 15, 15, 0.14);
    }
    .tc-theme-light {
      color: #2f2d29;
      background: #fffbf5;
      border: 1px solid #e4d7c4;
    }
    .tc-theme-dark {
      color: #eee8dd;
      background: #28231d;
      border: 1px solid #514333;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
    }
    .goodman-consent-warning--low { border-left: 4px solid var(--warn-low); }
    .goodman-consent-warning--medium { border-left: 4px solid var(--warn-medium); }
    .goodman-consent-warning--high { border-left: 4px solid var(--warn-high); }
    .goodman-consent-warning-label {
      margin-bottom: 4px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .goodman-consent-warning-copy { margin: 0; }
    .goodman-consent-warning-dismiss {
      margin-top: 8px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
      pointer-events: auto;
    }
    .goodman-consent-warning-dismiss:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
      border-radius: 4px;
    }
  `;
}
