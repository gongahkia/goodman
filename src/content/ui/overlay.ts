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
  host.id = 'goodman-overlay-host';
  host.style.cssText = 'position:fixed;z-index:2147483647;top:0;left:0;pointer-events:none';
  // pointer-events:none on host so page remains clickable; overlay content re-enables it via CSS

  const shadow = host.attachShadow({ mode: 'closed' });
  currentShadow = shadow;

  const style = document.createElement('style');
  style.textContent = getOverlayStyles();
  shadow.appendChild(style);

  const themeClass = `tc-theme-${getTheme(themePreference)}`;
  const container = document.createElement('div');
  container.className = `goodman-overlay ${themeClass}`;
  container.setAttribute('role', 'complementary');
  container.setAttribute('aria-label', 'Goodman summary');

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
  showSaulToast();

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
  header.className = 'goodman-header';

  const left = document.createElement('div');
  left.className = 'goodman-header-left';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'goodman-eyebrow';
  eyebrow.textContent = 'Page snapshot';

  const titleRow = document.createElement('div');
  titleRow.className = 'goodman-title-row';

  const title = document.createElement('span');
  title.className = 'goodman-title';
  title.textContent = 'Goodman';

  const severityBadge = document.createElement('span');
  severityBadge.className = `goodman-severity-pill goodman-severity-${normalizeSeverity(
    severityValue
  )}`;
  severityBadge.textContent = severityValue.toUpperCase();

  titleRow.appendChild(title);
  titleRow.appendChild(severityBadge);
  left.appendChild(eyebrow);
  left.appendChild(titleRow);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'goodman-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = 'x';
  closeBtn.addEventListener('click', handleDismiss);

  header.appendChild(left);
  header.appendChild(closeBtn);
  return header;
}

function createSummarySection(text: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'goodman-section goodman-summary-card';

  const heading = document.createElement('h3');
  heading.className = 'goodman-section-title';
  heading.textContent = 'Summary';

  const p = document.createElement('p');
  p.className = 'goodman-summary-text';
  p.textContent = text;

  section.appendChild(heading);
  section.appendChild(p);
  return section;
}

function createKeyPoints(points: string[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'goodman-section';

  const heading = document.createElement('h3');
  heading.className = 'goodman-section-title';
  heading.textContent = 'Key Points';
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'goodman-keypoints';

  for (const point of points) {
    const row = document.createElement('div');
    row.className = 'goodman-keypoint-row';

    const bullet = document.createElement('span');
    bullet.className = 'goodman-keypoint-bullet';
    bullet.textContent = '+';

    const copy = document.createElement('p');
    copy.className = 'goodman-keypoint-copy';
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
  section.className = 'goodman-section';

  const heading = document.createElement('h3');
  heading.className = 'goodman-section-title';
  heading.textContent = `Red Flags (${flags.length})`;
  section.appendChild(heading);

  for (const flag of flags) {
    const card = document.createElement('div');
    card.className = `goodman-flag-card goodman-flag-${normalizeSeverity(flag.severity)}`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-expanded', 'false');

    const cardHeader = document.createElement('div');
    cardHeader.className = 'goodman-flag-header';

    const name = document.createElement('span');
    name.className = 'goodman-flag-name';
    name.textContent = flag.category.replace(/_/g, ' ');

    const pill = document.createElement('span');
    pill.className = `goodman-severity-pill goodman-severity-${normalizeSeverity(
      flag.severity
    )}`;
    pill.textContent = flag.severity.toUpperCase();

    cardHeader.appendChild(name);
    cardHeader.appendChild(pill);
    card.appendChild(cardHeader);

    const details = document.createElement('div');
    details.className = 'goodman-flag-details';

    const desc = document.createElement('p');
    desc.className = 'goodman-flag-description';
    desc.textContent = flag.description;
    details.appendChild(desc);

    if (flag.quote) {
      const quote = document.createElement('blockquote');
      quote.className = 'goodman-flag-quote';
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
  footer.className = 'goodman-footer';

  const note = document.createElement('p');
  note.className = 'goodman-footer-note';
  note.textContent = 'Open Goodman for settings, history, and a full persisted snapshot.';
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
    const overlay = currentShadow.querySelector('.goodman-overlay');
    if (overlay) {
      (overlay as HTMLElement).classList.add('goodman-overlay--dismissing');
      setTimeout(removeOverlay, 150);
    }
  }
}

function showSaulToast(): void {
  const existing = document.getElementById('goodman-saul-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'goodman-saul-toast';
  const imgUrl = chrome.runtime?.getURL?.('icons/saul.png') ?? '';
  if (!imgUrl) return;
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px', 'z-index:2147483646',
    'display:flex', 'align-items:center', 'gap:12px',
    'padding:12px 18px', 'border-radius:16px',
    'background:#fffbf5', 'border:1px solid #e6ddd0',
    'box-shadow:0 12px 40px rgba(0,0,0,0.15)',
    'font-family:ui-sans-serif,-apple-system,sans-serif', 'font-size:14px', 'color:#2c2c2c',
    'animation:goodman-saul-in 400ms cubic-bezier(0.16,1,0.3,1)',
    'cursor:pointer',
  ].join(';');
  const img = document.createElement('img');
  img.src = imgUrl;
  img.alt = 'Saul Goodman';
  img.style.cssText = 'width:48px;height:48px;border-radius:10px;object-fit:cover';
  const text = document.createElement('span');
  text.textContent = 'Better call Goodman!';
  text.style.fontWeight = '600';
  toast.appendChild(img);
  toast.appendChild(text);
  const style = document.createElement('style');
  style.textContent = `
    @keyframes goodman-saul-in { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
    @keyframes goodman-saul-out { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(10px); } }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  toast.addEventListener('click', () => {
    toast.style.animation = 'goodman-saul-out 200ms ease forwards';
    setTimeout(() => toast.remove(), 200);
  });
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'goodman-saul-out 300ms ease forwards';
      setTimeout(() => toast.remove(), 300);
    }
  }, 4000);
}
