import {
  appendChildren,
  createElement,
  createEmptyMessage,
  createPill,
  createSectionHeading,
} from '@popup/ui';
import type { VersionEntry } from '@shared/storage';
import type { Summary } from '@providers/types';
import { compareSummaries } from '../summary-diff';
import { getVersionHistory } from '../schema';
import { computeDiff, type DiffSection } from '../diff';

export async function renderTimeline(
  domain: string,
  expandedEntries = new Set<string>()
): Promise<HTMLElement> {
  const container = createElement('div', 'tc-timeline');
  container.setAttribute('aria-label', `Version history for ${domain}`);
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
    container.appendChild(createTimelineItem(entry, prevEntry, isLatest, expandedEntries));
  }

  return container;
}

function createTimelineItem(
  entry: VersionEntry,
  previousEntry: VersionEntry | undefined,
  isLatest: boolean,
  expandedEntries: Set<string>
): HTMLElement {
  const expansionKey = JSON.stringify([entry.domain, entry.version, entry.textHash]);
  const node = createElement('div', 'tc-timeline-item');
  const trigger = createElement('button', 'tc-timeline-trigger');
  trigger.type = 'button';
  const detailsId = `tc-timeline-summary-${entry.domain.replace(/[^a-z0-9_-]/gi, '-')}-${entry.version}`;
  node.style.setProperty('--tc-line-color', getSeverityColor(entry.summary.severity));
  trigger.setAttribute('role', 'button');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', detailsId);
  trigger.setAttribute('aria-label', `Expand version ${entry.version} summary for ${entry.domain}`);

  const topline = createElement('div', 'tc-timeline-topline');
  appendChildren(
    topline,
    createElement('span', 'tc-timeline-label', `v${entry.version}`),
    createElement('span', 'tc-timeline-date', formatDate(entry.timestamp)),
    createPill(entry.summary.severity.toUpperCase(), mapSeverity(entry.summary.severity)),
    isLatest ? createPill('LATEST', 'blue') : null
  );

  const annotation = previousEntry
    ? createElement('p', 'tc-timeline-annotation', formatAnnotation(previousEntry, entry))
    : createElement('p', 'tc-timeline-annotation', 'First recorded version');

  const details = createElement('div', 'tc-timeline-summary');
  details.id = detailsId;
  details.setAttribute('aria-hidden', 'true');
  const summaryText = createElement('p', '', entry.summary.summary);
  details.appendChild(summaryText);

  if (previousEntry) {
    const prevSummary = toSummary(previousEntry.summary);
    const currSummary = toSummary(entry.summary);
    const diff = compareSummaries(prevSummary, currSummary);
    if (
      diff.addedRedFlags.length > 0 ||
      diff.removedRedFlags.length > 0 ||
      diff.changedRedFlags.length > 0 ||
      diff.newKeyPoints.length > 0 ||
      diff.removedKeyPoints.length > 0 ||
      diff.severityChange
    ) {
      const changesSection = createElement('div', 'tc-timeline-changes');
      if (diff.severityChange) {
        changesSection.appendChild(
          createElement(
            'p',
            'tc-timeline-change',
            `Severity: ${diff.severityChange.old} \u2192 ${diff.severityChange.new}`
          )
        );
      }
      for (const flag of diff.addedRedFlags) {
        changesSection.appendChild(
          createElement(
            'p',
            'tc-timeline-change tc-timeline-change--added',
            `+ ${flag.category.replace(/_/g, ' ')} (${flag.severity})`
          )
        );
      }
      for (const flag of diff.removedRedFlags) {
        changesSection.appendChild(
          createElement(
            'p',
            'tc-timeline-change tc-timeline-change--removed',
            `\u2212 ${flag.category.replace(/_/g, ' ')} (${flag.severity})`
          )
        );
      }
      for (const flag of diff.changedRedFlags) {
        changesSection.appendChild(
          createElement(
            'p',
            'tc-timeline-change',
            `Updated ${flag.new.category.replace(/_/g, ' ')}: ${flag.old.description} (${flag.old.severity}) → ${flag.new.description} (${flag.new.severity})`
          )
        );
        if (flag.old.quote !== flag.new.quote)
          changesSection.appendChild(
            createElement('p', 'tc-timeline-change', `Quote: ${flag.old.quote} → ${flag.new.quote}`)
          );
      }
      for (const point of diff.newKeyPoints)
        changesSection.appendChild(
          createElement('p', 'tc-timeline-change tc-timeline-change--added', `+ ${point}`)
        );
      for (const point of diff.removedKeyPoints)
        changesSection.appendChild(
          createElement('p', 'tc-timeline-change tc-timeline-change--removed', `− ${point}`)
        );
      details.appendChild(changesSection);
    }
  }

  appendChildren(trigger, topline, annotation);
  appendChildren(node, trigger, details);

  let comparisonRendered = false;
  const setExpanded = (expanded: boolean): void => {
    if (expanded) {
      expandedEntries.add(expansionKey);
      if (expandedEntries.size > 100)
        expandedEntries.delete(expandedEntries.values().next().value!);
    } else expandedEntries.delete(expansionKey);
    if (expanded && previousEntry && !comparisonRendered) {
      comparisonRendered = true;
      details.appendChild(renderTextComparison(previousEntry, entry));
    }
    trigger.setAttribute('aria-expanded', String(expanded));
    trigger.setAttribute(
      'aria-label',
      `${expanded ? 'Collapse' : 'Expand'} version ${entry.version} summary for ${entry.domain}`
    );
    details.setAttribute('aria-hidden', String(!expanded));
    details.style.display = expanded ? 'block' : 'none';
  };
  const toggle = (): void => setExpanded(trigger.getAttribute('aria-expanded') !== 'true');
  trigger.addEventListener('click', toggle);
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });
  setExpanded(expandedEntries.has(expansionKey));

  return node;
}

function renderTextComparison(previous: VersionEntry, current: VersionEntry): HTMLElement {
  const section = createElement('section', 'tc-text-comparison');
  section.setAttribute(
    'aria-label',
    `Agreement text changes from version ${previous.version} to ${current.version}`
  );
  section.appendChild(
    createElement(
      'h4',
      'tc-field-label',
      `Agreement text · v${previous.version} → v${current.version}`
    )
  );
  if (previous.sourceText === undefined || current.sourceText === undefined) {
    section.appendChild(
      createElement(
        'p',
        'tc-option-copy',
        'Text was not saved for both versions. Enable saving agreement text in Monitoring to compare future versions.'
      )
    );
    return section;
  }
  const diff = computeDiff(previous.sourceText, current.sourceText);
  if (diff.limited) {
    section.appendChild(
      createElement(
        'p',
        'tc-option-copy',
        'This comparison exceeds the display limit. Export your saved history to review the complete agreement text.'
      )
    );
    return section;
  }
  if (diff.totalChanges === 0)
    section.appendChild(createElement('p', 'tc-option-copy', 'No agreement text changes.'));
  const changes = [
    ...diff.changes.map((change) => ({ change, kind: 'Replaced' })),
    ...diff.additions.map((change) => ({ change, kind: 'Added' })),
    ...diff.removals.map((change) => ({ change, kind: 'Removed' })),
  ];
  let shown = 0;
  const more = createElement('button', 'tc-button tc-button--secondary', 'Show more text changes');
  more.type = 'button';
  const showNext = (): void => {
    more.remove();
    for (const { change, kind } of changes.slice(shown, shown + 100))
      section.appendChild(renderTextChange(change, kind));
    shown += 100;
    if (shown < changes.length) section.appendChild(more);
  };
  more.addEventListener('click', showNext);
  showNext();
  return section;
}

function renderTextChange(change: DiffSection, kind: string): HTMLElement {
  const block = createElement('div', 'tc-text-change');
  block.appendChild(
    createElement(
      'p',
      'tc-field-label',
      `${kind} · ${change.previousText !== undefined ? `old line ${change.previousLineNumber}, new line ${change.lineNumber}` : `line ${change.lineNumber}`}`
    )
  );
  if (change.previousText !== undefined) {
    block.appendChild(createElement('p', 'tc-timeline-change', 'Before'));
    block.appendChild(
      createElement('pre', 'tc-text-diff tc-text-diff--removed', change.previousText)
    );
    block.appendChild(createElement('p', 'tc-timeline-change', 'After'));
  }
  block.appendChild(
    createElement(
      'pre',
      `tc-text-diff ${kind === 'Removed' ? 'tc-text-diff--removed' : 'tc-text-diff--added'}`,
      change.text
    )
  );
  return block;
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

function formatAnnotation(oldEntry: VersionEntry, newEntry: VersionEntry): string {
  const parts: string[] = [];
  const summaryDiff = compareSummaries(toSummary(oldEntry.summary), toSummary(newEntry.summary));

  const oldFlags = oldEntry.summary.redFlags.length;
  const newFlags = newEntry.summary.redFlags.length;
  const diff = newFlags - oldFlags;

  if (diff > 0) parts.push(`+${diff} red flag${diff > 1 ? 's' : ''}`);
  if (diff < 0) parts.push(`${diff} red flag${Math.abs(diff) > 1 ? 's' : ''}`);

  if (oldEntry.summary.severity !== newEntry.summary.severity) {
    parts.push(`severity: ${oldEntry.summary.severity} to ${newEntry.summary.severity}`);
  }
  if (summaryDiff.changedRedFlags.length)
    parts.push(`${summaryDiff.changedRedFlags.length} updated red flag(s)`);
  if (summaryDiff.newKeyPoints.length)
    parts.push(`+${summaryDiff.newKeyPoints.length} key point(s)`);
  if (summaryDiff.removedKeyPoints.length)
    parts.push(`−${summaryDiff.removedKeyPoints.length} key point(s)`);

  return parts.length === 0 ? 'No major summary delta captured.' : parts.join(', ');
}

function mapSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' | 'default' {
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
