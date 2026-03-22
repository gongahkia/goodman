import type { ScoredDetection } from '@content/detectors/scoring';
import type { Summary } from '@providers/types';
import { getTheme } from './theme';
import { getOverlayStyles } from './styles';

let currentOverlay: HTMLElement | null = null;
let currentShadow: ShadowRoot | null = null;
let cachedSummary: Summary | null = null;

export function createOverlay(
  detection: ScoredDetection,
  summary: Summary
): HTMLElement {
  removeOverlay();
  cachedSummary = summary;

  const host = document.createElement('div');
  host.id = 'tc-guard-overlay-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0';

  const shadow = host.attachShadow({ mode: 'closed' });
  currentShadow = shadow;

  const style = document.createElement('style');
  style.textContent = getOverlayStyles();
  shadow.appendChild(style);

  const themeClass = `tc-theme-${getTheme('auto')}`;
  const container = document.createElement('div');
  container.className = `tc-guard-overlay ${themeClass}`;
  container.setAttribute('role', 'complementary');
  container.setAttribute('aria-label', 'TC Guard summary');

  container.appendChild(createHeader(summary.severity));
  container.appendChild(createSummarySection(summary.summary));
  container.appendChild(createKeyPoints(summary.keyPoints));
  container.appendChild(createRedFlags(summary.redFlags));
  container.appendChild(createOverlayFooter());

  shadow.appendChild(container);
  document.body.appendChild(host);
  currentOverlay = host;

  return host;
}

export function removeOverlay(): void {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
    currentShadow = null;
  }
}

export function getCachedSummaryData(): Summary | null {
  return cachedSummary;
}

function createHeader(severity: string): HTMLElement {
  const header = document.createElement('div');
  header.className = 'tc-guard-header';

  const left = document.createElement('div');
  left.className = 'tc-guard-header-left';

  const dot = document.createElement('span');
  dot.className = `tc-guard-severity-dot tc-guard-severity-${severity}`;

  const title = document.createElement('span');
  title.className = 'tc-guard-title';
  title.textContent = 'TC Guard';

  left.appendChild(dot);
  left.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tc-guard-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', handleDismiss);

  header.appendChild(left);
  header.appendChild(closeBtn);
  return header;
}

function createSummarySection(text: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tc-guard-section';
  const p = document.createElement('p');
  p.className = 'tc-guard-summary-text';
  p.textContent = text;
  section.appendChild(p);
  return section;
}

function createKeyPoints(points: string[]): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tc-guard-section';
  const heading = document.createElement('h3');
  heading.className = 'tc-guard-section-title';
  heading.textContent = 'Key Points';
  section.appendChild(heading);
  const ul = document.createElement('ul');
  ul.className = 'tc-guard-keypoints';
  for (const point of points) {
    const li = document.createElement('li');
    li.textContent = point;
    ul.appendChild(li);
  }
  section.appendChild(ul);
  return section;
}

function createRedFlags(flags: Array<{ category: string; description: string; severity: string; quote: string }>): HTMLElement {
  const section = document.createElement('div');
  section.className = 'tc-guard-section';
  const heading = document.createElement('h3');
  heading.className = 'tc-guard-section-title';
  heading.textContent = `Red Flags (${flags.length})`;
  section.appendChild(heading);

  for (const flag of flags) {
    const card = document.createElement('div');
    card.className = `tc-guard-flag-card tc-guard-flag-${flag.severity}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');

    const cardHeader = document.createElement('div');
    cardHeader.className = 'tc-guard-flag-header';
    const name = document.createElement('span');
    name.className = 'tc-guard-flag-name';
    name.textContent = flag.category.replace(/_/g, ' ');
    const pill = document.createElement('span');
    pill.className = `tc-guard-severity-pill tc-guard-severity-${flag.severity}`;
    pill.textContent = flag.severity.toUpperCase();
    cardHeader.appendChild(name);
    cardHeader.appendChild(pill);
    card.appendChild(cardHeader);

    const details = document.createElement('div');
    details.className = 'tc-guard-flag-details';
    const desc = document.createElement('p');
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
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
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
  details.style.maxHeight = expanded ? '0' : '300px';
}

function createOverlayFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'tc-guard-footer';
  return footer;
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
