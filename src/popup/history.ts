import {
  appendChildren,
  createButton,
  createElement,
  createEmptyMessage,
  createPill,
  createSectionHeading,
} from '@popup/ui';
import { clearNotification } from '@versioning/notifications';
import {
  getAllTrackedDomains,
  getDomainHistorySummaries,
  getVersionHistorySnapshot,
  type DomainHistorySummary,
} from '@versioning/schema';
import { renderTimeline } from '@versioning/ui/timeline';

export async function renderHistoryPanel(
  container: HTMLElement,
  currentDomain: string
): Promise<void> {
  container.textContent = '';

  appendChildren(
    container,
    createSectionHeading(
      'Your T&C history',
      'Browse locally saved terms snapshots across domains and export your own history as JSON.'
    )
  );

  const domains = await getAllTrackedDomains();
  if (domains.length === 0) {
    container.appendChild(createEmptyMessage('No version history yet'));
    return;
  }

  const summaries = await getDomainHistorySummaries();
  container.appendChild(createHistoryToolbar());
  const timelineContainer = createElement('div');

  const selectRow = createElement('div', 'tc-select-row');
  const label = createElement('label', 'tc-select-label', `Domain (${domains.length} tracked):`);
  const select = createElement('select', 'tc-select') as HTMLSelectElement;
  select.id = 'tc-history-domain';
  label.htmlFor = select.id;
  for (const domain of domains) {
    const option = createElement('option', '', domain) as HTMLOptionElement;
    option.value = domain;
    option.selected = domain === currentDomain;
    select.appendChild(option);
  }
  appendChildren(selectRow, label, select);
  const domainList = createDomainList(summaries, select, timelineContainer);

  select.addEventListener('change', async () => {
    await clearNotification(select.value);
    const timeline = await renderTimeline(select.value);
    timelineContainer.textContent = '';
    timelineContainer.appendChild(timeline);
    updateActiveDomainCard(domainList, select.value);
  });

  appendChildren(container, domainList, selectRow, timelineContainer);

  const selectedDomain = domains.includes(currentDomain) ? currentDomain : (domains[0] ?? '');
  if (selectedDomain) {
    select.value = selectedDomain;
    updateActiveDomainCard(domainList, selectedDomain);
    await clearNotification(selectedDomain);
    const timeline = await renderTimeline(selectedDomain);
    timelineContainer.appendChild(timeline);
  }
}

function createHistoryToolbar(): HTMLElement {
  const toolbar = createElement('div', 'tc-history-toolbar');
  toolbar.appendChild(createButton('Export JSON', 'secondary', () => {
    void exportHistoryJson().catch(e => console.warn('[Goodman] history export failed:', e));
  }));
  return toolbar;
}

function createDomainList(
  summaries: DomainHistorySummary[],
  select: HTMLSelectElement,
  timelineContainer: HTMLElement
): HTMLElement {
  const list = createElement('div', 'tc-history-domain-list');
  for (const summary of summaries) {
    const card = createElement('button', 'tc-domain-row tc-history-domain-card') as HTMLButtonElement;
    card.type = 'button';
    card.dataset['domain'] = summary.domain;
    card.addEventListener('click', async () => {
      select.value = summary.domain;
      await clearNotification(summary.domain);
      timelineContainer.textContent = '';
      timelineContainer.appendChild(await renderTimeline(summary.domain));
      updateActiveDomainCard(list, summary.domain);
    });

    const label = createElement('div', 'tc-domain-label');
    appendChildren(
      label,
      createElement('div', 'tc-domain-name', summary.domain),
      createElement('div', 'tc-option-copy', getDomainMeta(summary)),
      createElement('p', 'tc-history-summary', summary.latest.summary.summary)
    );
    const pills = createElement('div', 'tc-history-pills');
    appendChildren(
      pills,
      createPill(summary.latest.summary.severity.toUpperCase(), summary.latest.summary.severity),
      createPill(getTrendLabel(summary.severityTrend), 'muted')
    );
    appendChildren(card, label, pills);
    list.appendChild(card);
  }
  return list;
}

function updateActiveDomainCard(list: HTMLElement, domain: string): void {
  for (const card of Array.from(list.querySelectorAll<HTMLElement>('.tc-history-domain-card'))) {
    card.classList.toggle('is-active', card.dataset['domain'] === domain);
  }
}

async function exportHistoryJson(): Promise<void> {
  const snapshot = await getVersionHistorySnapshot();
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'goodman-local-version-history',
    schemaVersion: 1,
    domains: snapshot,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `goodman-tc-history-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getDomainMeta(summary: DomainHistorySummary): string {
  const versionText = `${summary.versionCount} saved version${summary.versionCount === 1 ? '' : 's'}`;
  const dateText = summary.lastDiffAt
    ? `last diff ${formatDate(summary.lastDiffAt)}`
    : `first saved ${formatDate(summary.latest.timestamp)}`;
  return `${versionText} · ${dateText}`;
}

function getTrendLabel(trend: DomainHistorySummary['severityTrend']): string {
  switch (trend) {
    case 'up': return 'severity up';
    case 'down': return 'severity down';
    case 'unchanged': return 'severity unchanged';
    case 'new': return 'new';
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
