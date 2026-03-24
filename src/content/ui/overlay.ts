import type { ScoredDetection } from '@content/detectors/scoring';
import type { Summary } from '@providers/types';
import { positionOverlay } from './positioning';
import { getOverlayStyles } from './styles';
import { getTheme } from './theme';

let currentOverlay: HTMLElement | null = null;
let currentShadow: ShadowRoot | null = null;
let cachedSummary: Summary | null = null;
let positionCleanup: (() => void) | null = null;

export function createOverlay(
  detection: ScoredDetection,
  summary: Summary,
  themePreference: 'auto' | 'light' | 'dark'
): HTMLElement {
  removeOverlay();
  cachedSummary = summary;

  const host = document.createElement('div');
  host.id = 'tc-guard-overlay-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none';
  // pointer-events:none on host so page remains clickable; overlay content re-enables it via CSS

  const shadow = host.attachShadow({ mode: 'closed' });
  currentShadow = shadow;

  const style = document.createElement('style');
  style.textContent = getOverlayStyles();
  shadow.appendChild(style);

  const themeClass = `tc-theme-${getTheme(themePreference)}`;
  const container = document.createElement('div');
  container.className = `tc-guard-overlay ${themeClass}`;
  container.setAttribute('role', 'complementary');
  container.setAttribute('aria-label', 'TC Guard summary');

  container.appendChild(createHeader(summary.severity));
  container.appendChild(createSummarySection(summary.summary));

  if (summary.keyPoints.length > 0) {
    container.appendChild(createKeyPoints(summary.keyPoints));
  }

  if (summary.redFlags.length > 0) {
    container.appendChild(createRedFlags(summary.redFlags));
  }

  container.appendChild(createOverlayFooter());

  shadow.appendChild(container);
  document.body.appendChild(host);
  positionCleanup = positionOverlay(host, detection.element);
  currentOverlay = host;
  document.addEventListener('keydown', handleEscape);

  return host;
}

export function removeOverlay(): void {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
    currentShadow = null;
    positionCleanup?.();
    positionCleanup = null;
    document.removeEventListener('keydown', handleEscape);
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') handleDismiss();
}

export function getCachedSummaryData(): Summary | null {
  return cachedSummary;
}

function createHeader(severityValue: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'tc-guard-header';

  const left = document.createElement('div');
  left.className = 'tc-guard-header-left';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'tc-guard-eyebrow';
  eyebrow.textContent = 'Page snapshot';

  const titleRow = document.createElement('div');
  titleRow.className = 'tc-guard-title-row';

  const title = document.createElement('span');
  title.className = 'tc-guard-title';
  title.textContent = 'TC Guard';

  const severityBadge = document.createElement('span');
  severityBadge.className = `tc-guard-severity-pill tc-guard-severity-${normalizeSeverity(
    severityValue
  )}`;
  severityBadge.textContent = severityValue.toUpperCase();

  titleRow.appendChild(title);
  titleRow.appendChild(severityBadge);
  left.appendChild(eyebrow);
  left.appendChild(titleRow);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tc-guard-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = 'x';
  closeBtn.addEventListener('click', handleDismiss);

  header.appendChild(left);
  header.appendChild(closeBtn);
  return header;
}

function createSummarySection(text: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'tc-guard-section tc-guard-summary-card';

  const heading = document.createElement('h3');
  heading.className = 'tc-guard-section-title';
  heading.textContent = 'Summary';

  const p = document.createElement('p');
  p.className = 'tc-guard-summary-text';
  p.textContent = text;

  section.appendChild(heading);
  section.appendChild(p);
  return section;
}

function createKeyPoints(points: string[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'tc-guard-section';

  const heading = document.createElement('h3');
  heading.className = 'tc-guard-section-title';
  heading.textContent = 'Key Points';
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'tc-guard-keypoints';

  for (const point of points) {
    const row = document.createElement('div');
    row.className = 'tc-guard-keypoint-row';

    const bullet = document.createElement('span');
    bullet.className = 'tc-guard-keypoint-bullet';
    bullet.textContent = '+';

    const copy = document.createElement('p');
    copy.className = 'tc-guard-keypoint-copy';
    copy.textContent = point;

    row.appendChild(bullet);
    row.appendChild(copy);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}

function createRedFlags(
  flags: Array<{ category: string; description: string; severity: string; quote: string }>
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'tc-guard-section';

  const heading = document.createElement('h3');
  heading.className = 'tc-guard-section-title';
  heading.textContent = `Red Flags (${flags.length})`;
  section.appendChild(heading);

  for (const flag of flags) {
    const card = document.createElement('div');
    card.className = `tc-guard-flag-card tc-guard-flag-${normalizeSeverity(flag.severity)}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');

    const cardHeader = document.createElement('div');
    cardHeader.className = 'tc-guard-flag-header';

    const name = document.createElement('span');
    name.className = 'tc-guard-flag-name';
    name.textContent = flag.category.replace(/_/g, ' ');

    const pill = document.createElement('span');
    pill.className = `tc-guard-severity-pill tc-guard-severity-${normalizeSeverity(
      flag.severity
    )}`;
    pill.textContent = flag.severity.toUpperCase();

    cardHeader.appendChild(name);
    cardHeader.appendChild(pill);
    card.appendChild(cardHeader);

    const details = document.createElement('div');
    details.className = 'tc-guard-flag-details';

    const desc = document.createElement('p');
    desc.className = 'tc-guard-flag-description';
    desc.textContent = flag.description;
    details.appendChild(desc);

    if (flag.quote) {
      const quote = document.createElement('blockquote');
      quote.className = 'tc-guard-flag-quote';
      quote.textContent = flag.quote;
      details.appendChild(quote);
    }

    card.appendChild(details);

    card.addEventListener('click', () => toggleCard(card, details));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCard(card, details);
      }
    });

    section.appendChild(card);
  }

  return section;
}

function toggleCard(card: HTMLElement, details: HTMLElement): void {
  const expanded = card.getAttribute('aria-expanded') === 'true';
  card.setAttribute('aria-expanded', String(!expanded));
  details.style.maxHeight = expanded ? '0' : '320px';
}

function createOverlayFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'tc-guard-footer';

  const note = document.createElement('p');
  note.className = 'tc-guard-footer-note';
  note.textContent = 'Open TC Guard for settings, history, and a full persisted snapshot.';
  footer.appendChild(note);
  return footer;
}

function normalizeSeverity(value: string): 'low' | 'medium' | 'high' | 'critical' {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value;
  }
  return 'medium';
}

function handleDismiss(): void {
  if (currentShadow) {
    const overlay = currentShadow.querySelector('.tc-guard-overlay');
    if (overlay) {
      (overlay as HTMLElement).classList.add('tc-guard-overlay--dismissing');
      setTimeout(removeOverlay, 150);
    }
  }
}
