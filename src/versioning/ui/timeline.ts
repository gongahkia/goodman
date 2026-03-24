import { appendChildren, createElement, createEmptyMessage, createPill, createSectionHeading } from '@popup/ui';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { compareSummaries } from '../summary-diff';
import { getVersionHistory } from '../schema';

export async function renderTimeline(domain: string): Promise<HTMLElement> {
  const container = createElement('div', 'tc-timeline');
  const history = await getVersionHistory(domain);
  const reversed = [...history].reverse();

  if (reversed.length === 0) {
    container.appendChild(createEmptyMessage('No version history yet'));
    return container;
  }

  container.appendChild(
    createSectionHeading(
      `Version History - ${domain}`,
      'Select an entry to expand the saved summary for that version.'
    )
  );

  for (let index = 0; index < reversed.length; index += 1) {
    const entry = reversed[index]!;
    const isLatest = index === 0;
    const prevEntry = reversed[index + 1];
    container.appendChild(createTimelineItem(entry, prevEntry, isLatest));
  }

  return container;
}

function createTimelineItem(
  entry: VersionEntry,
  previousEntry: VersionEntry | undefined,
  isLatest: boolean
): HTMLElement {
  const node = createElement('div', 'tc-timeline-item');
  node.style.setProperty('--tc-line-color', getSeverityColor(entry.summary.severity));

  const topline = createElement('div', 'tc-timeline-topline');
  appendChildren(
    topline,
    createElement('span', 'tc-timeline-label', `v${entry.version}`),
    createElement('span', 'tc-timeline-date', formatDate(entry.timestamp)),
    createPill(entry.summary.severity.toUpperCase(), mapSeverity(entry.summary.severity)),
    isLatest ? createPill('LATEST', 'blue') : null
  );

  const annotation = previousEntry
    ? createElement(
        'p',
        'tc-timeline-annotation',
        formatAnnotation(previousEntry, entry)
      )
    : createElement('p', 'tc-timeline-annotation', 'First recorded version');

  const details = createElement('div', 'tc-timeline-summary');
  const summaryText = createElement('p', '', entry.summary.summary);
  details.appendChild(summaryText);

  if (previousEntry) {
    const prevSummary = toSummary(previousEntry.summary);
    const currSummary = toSummary(entry.summary);
    const diff = compareSummaries(prevSummary, currSummary);
    if (diff.addedRedFlags.length > 0 || diff.removedRedFlags.length > 0 || diff.severityChange) {
      const changesSection = createElement('div', 'tc-timeline-changes');
      if (diff.severityChange) {
        changesSection.appendChild(
          createElement('p', 'tc-timeline-change',
            `Severity: ${diff.severityChange.old} \u2192 ${diff.severityChange.new}`)
        );
      }
      for (const flag of diff.addedRedFlags) {
        changesSection.appendChild(
          createElement('p', 'tc-timeline-change tc-timeline-change--added',
            `+ ${flag.category.replace(/_/g, ' ')} (${flag.severity})`)
        );
      }
      for (const flag of diff.removedRedFlags) {
        changesSection.appendChild(
          createElement('p', 'tc-timeline-change tc-timeline-change--removed',
            `\u2212 ${flag.category.replace(/_/g, ' ')} (${flag.severity})`)
        );
      }
      details.appendChild(changesSection);
    }
  }

  appendChildren(node, topline, annotation, details);

  node.addEventListener('click', () => {
    details.style.display = details.style.display === 'block' ? 'none' : 'block';
  });

  return node;
}

function toSummary(stored: VersionEntry['summary']): Summary {
  return {
    ...stored,
    redFlags: stored.redFlags.map((f) => ({
      ...f,
      category: f.category as Summary['redFlags'][number]['category'],
    })),
  };
}

function formatAnnotation(
  oldEntry: VersionEntry,
  newEntry: VersionEntry
): string {
  const parts: string[] = [];

  const oldFlags = oldEntry.summary.redFlags.length;
  const newFlags = newEntry.summary.redFlags.length;
  const diff = newFlags - oldFlags;

  if (diff > 0) parts.push(`+${diff} red flag${diff > 1 ? 's' : ''}`);
  if (diff < 0) parts.push(`${diff} red flag${Math.abs(diff) > 1 ? 's' : ''}`);

  if (oldEntry.summary.severity !== newEntry.summary.severity) {
    parts.push(`severity: ${oldEntry.summary.severity} to ${newEntry.summary.severity}`);
  }

  return parts.length === 0 ? 'No major summary delta captured.' : parts.join(', ');
}

function mapSeverity(
  severity: string
): 'low' | 'medium' | 'high' | 'critical' | 'default' {
  return severity === 'low' ||
    severity === 'medium' ||
    severity === 'high' ||
    severity === 'critical'
    ? severity
    : 'default';
}

function getSeverityColor(severity: string): string {
  const colors: Record<string, string> = {
    low: '#3f8f63',
    medium: '#b07b12',
    high: '#c4662d',
    critical: '#b54745',
  };
  return colors[severity] ?? '#d8d5cf';
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
