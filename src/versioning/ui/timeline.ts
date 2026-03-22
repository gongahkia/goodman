import { getVersionHistory } from '../schema';
import type { VersionEntry } from '@shared/storage';

export async function renderTimeline(domain: string): Promise<HTMLElement> {
  const container = document.createElement('div');
  container.className = 'tc-guard-timeline';

  const history = await getVersionHistory(domain);
  const reversed = [...history].reverse();

  if (reversed.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#6b7280;text-align:center;padding:20px';
    empty.textContent = 'No version history yet';
    container.appendChild(empty);
    return container;
  }

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = `Version History \u2014 ${domain}`;
  container.appendChild(heading);

  const line = document.createElement('div');
  line.style.cssText = 'position:relative;padding-left:24px';

  const lineBar = document.createElement('div');
  lineBar.style.cssText = 'position:absolute;left:5px;top:0;bottom:0;width:2px;background:#e5e7eb';
  line.appendChild(lineBar);

  for (let i = 0; i < reversed.length; i++) {
    const entry = reversed[i]!;
    const isFirst = i === 0;
    const prevEntry = reversed[i + 1];

    const node = document.createElement('div');
    node.style.cssText = 'position:relative;margin-bottom:24px;cursor:pointer';

    const dot = document.createElement('div');
    const severityColor = getSeverityColor(entry.summary.severity);
    dot.style.cssText = `position:absolute;left:-24px;top:2px;width:12px;height:12px;border-radius:50%;background:${severityColor};border:2px solid white;box-shadow:0 0 0 1px #e5e7eb`;
    node.appendChild(dot);

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:4px';

    const versionLabel = document.createElement('span');
    versionLabel.style.cssText = 'font-weight:600;font-size:14px';
    versionLabel.textContent = `v${entry.version}`;

    const dateLabel = document.createElement('span');
    dateLabel.style.cssText = 'font-size:12px;color:#6b7280';
    dateLabel.textContent = formatDate(entry.timestamp);

    const badge = document.createElement('span');
    badge.style.cssText = `font-size:11px;font-weight:600;text-transform:uppercase;padding:2px 6px;border-radius:9999px;color:${severityColor}`;
    badge.textContent = entry.summary.severity;

    if (isFirst) {
      const latest = document.createElement('span');
      latest.style.cssText = 'font-size:11px;color:#2563eb;font-weight:500';
      latest.textContent = '(latest)';
      header.appendChild(versionLabel);
      header.appendChild(dateLabel);
      header.appendChild(badge);
      header.appendChild(latest);
    } else {
      header.appendChild(versionLabel);
      header.appendChild(dateLabel);
      header.appendChild(badge);
    }

    node.appendChild(header);

    if (prevEntry) {
      const annotation = createAnnotation(prevEntry, entry);
      if (annotation) node.appendChild(annotation);
    } else if (reversed.length === 1) {
      const firstVersion = document.createElement('p');
      firstVersion.style.cssText = 'font-size:12px;color:#9ca3af;margin-top:4px';
      firstVersion.textContent = 'First recorded version';
      node.appendChild(firstVersion);
    }

    const details = document.createElement('div');
    details.style.cssText = 'display:none;margin-top:8px;padding:12px;background:#f8f9fa;border-radius:8px';
    const summaryText = document.createElement('p');
    summaryText.style.cssText = 'font-size:13px;line-height:1.4';
    summaryText.textContent = entry.summary.summary;
    details.appendChild(summaryText);
    node.appendChild(details);

    node.addEventListener('click', () => {
      details.style.display = details.style.display === 'none' ? 'block' : 'none';
    });

    line.appendChild(node);
  }

  container.appendChild(line);
  return container;
}

function createAnnotation(
  oldEntry: VersionEntry,
  newEntry: VersionEntry
): HTMLElement | null {
  const parts: string[] = [];

  const oldFlags = oldEntry.summary.redFlags.length;
  const newFlags = newEntry.summary.redFlags.length;
  const diff = newFlags - oldFlags;
  if (diff > 0) parts.push(`+${diff} red flag${diff > 1 ? 's' : ''}`);
  if (diff < 0) parts.push(`${diff} red flag${Math.abs(diff) > 1 ? 's' : ''}`);

  if (oldEntry.summary.severity !== newEntry.summary.severity) {
    parts.push(`severity: ${oldEntry.summary.severity} \u2192 ${newEntry.summary.severity}`);
  }

  if (parts.length === 0) return null;

  const annotation = document.createElement('p');
  annotation.style.cssText = 'font-size:12px;color:#6b7280;margin-top:4px';
  annotation.textContent = parts.join(', ');
  return annotation;
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#f97316',
    critical: '#ef4444',
  };
  return colors[severity] ?? '#6b7280';
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
