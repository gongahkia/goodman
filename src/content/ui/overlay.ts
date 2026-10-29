import { sourceQuoteUrl, type AgreementDocument } from '@shared/documents';
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
  themePreference: 'auto' | 'light' | 'dark',
  sourceDocument?: AgreementDocument
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
    container.appendChild(createRedFlags(summary.redFlags, sourceDocument));
  }

  container.appendChild(createOverlayFooter());

  shadow.appendChild(container);
  document.body.appendChild(host);
  positionCleanup = positionOverlay(host, detection.element, container);
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
  header.className = 'goodman-header';

  const left = document.createElement('div');
  left.className = 'goodman-header-left';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'goodman-eyebrow';
  eyebrow.textContent = 'T&C Analysis';

  const titleRow = document.createElement('div');
  titleRow.className = 'goodman-title-row';

  const title = document.createElement('span');
  title.className = 'goodman-title';
  title.textContent = 'Goodman';

  const severityBadge = document.createElement('span');
  severityBadge.className = `goodman-severity-pill goodman-severity-${normalizeSeverity(
    severityValue
  )}`;
  const severityIndicator: Record<string, string> = {
    low: '\u25cf ',
    medium: '\u25c6 ',
    high: '\u25b2 ',
    critical: '\u25b2 ',
  };
  severityBadge.textContent =
    (severityIndicator[normalizeSeverity(severityValue)] ?? '') + severityValue.toUpperCase();

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
  flags: Array<{ category: string; description: string; severity: string; quote: string }>,
  sourceDocument?: AgreementDocument
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
    pill.className = `goodman-severity-pill goodman-severity-${normalizeSeverity(flag.severity)}`;
    pill.textContent = flag.severity.toUpperCase();

    const chevron = document.createElement('span');
    chevron.className = 'goodman-flag-chevron';
    chevron.textContent = '\u203a';
    cardHeader.appendChild(name);
    cardHeader.appendChild(pill);
    cardHeader.appendChild(chevron);
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
      if (sourceDocument) {
        const link = document.createElement('a');
        link.href = sourceQuoteUrl(sourceDocument, flag.quote);
        link.textContent = 'View original clause';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.color = 'inherit';
        link.addEventListener('click', (event) => event.stopPropagation());
        details.appendChild(link);
      }
    }

    details.hidden = true;
    if (!flag.quote) {
      const note = document.createElement('p');
      note.textContent =
        'No verified quotation available. Check the original before relying on this finding.';
      details.appendChild(note);
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
  details.hidden = expanded;
  details.style.maxHeight = expanded ? '0' : 'none';
}

function createOverlayFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.className = 'goodman-footer';

  const note = document.createElement('p');
  note.className = 'goodman-footer-note';
  note.textContent = 'Open Goodman for settings, history, and a full persisted snapshot.';
  footer.appendChild(note);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'goodman-copy-btn';
  copyBtn.textContent = 'Copy summary';
  copyBtn.addEventListener('click', handleCopy);
  footer.appendChild(copyBtn);
  return footer;
}

function handleCopy(): void {
  if (!cachedSummary) return;
  const lines = [cachedSummary.summary];
  if (cachedSummary.keyPoints.length > 0) {
    lines.push('', 'Key Points:', ...cachedSummary.keyPoints.map((p) => `- ${p}`));
  }
  if (cachedSummary.redFlags.length > 0) {
    lines.push('', 'Red Flags:');
    for (const f of cachedSummary.redFlags) {
      lines.push(
        `- [${f.severity.toUpperCase()}] ${f.category.replace(/_/g, ' ')}: ${f.description}`
      );
    }
  }
  const button = currentShadow?.querySelector<HTMLButtonElement>('.goodman-copy-btn');
  void navigator.clipboard
    .writeText(lines.join('\n'))
    .then(() => {
      if (button) button.textContent = 'Copied';
    })
    .catch(() => {
      if (button) button.textContent = 'Copy failed — try again';
    });
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

let chipHost: HTMLElement | null = null;
let chipCleanup: (() => void) | null = null;
export function removeSummaryChip(): void {
  chipCleanup?.();
  chipCleanup = null;
  chipHost?.remove();
  chipHost = null;
}
export function createSummaryChip(
  detection: ScoredDetection,
  label: string,
  open: () => void
): void {
  removeSummaryChip();
  const host = document.createElement('div');
  host.id = 'goodman-summary-chip';
  host.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{all:initial}button{font:13px/1.4 system-ui,sans-serif;color:#30261b;background:#fffaf1;border:1px solid #cbbfa9;border-radius:20px;min-height:40px;padding:8px 14px;cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px #0002;max-width:calc(100vw - 24px)}button:hover{background:#f0e8d8}button:focus-visible{outline:3px solid #976129;outline-offset:2px}';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `Goodman · ${label}`;
  button.addEventListener('click', open);
  shadow.append(style, button);
  document.body.append(host);
  chipHost = host;
  chipCleanup = positionOverlay(host, detection.element, button);
}
