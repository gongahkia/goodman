import { appendChildren, createElement, createEmptyMessage, createSectionHeading } from '@popup/ui';
import { clearNotification } from '@versioning/notifications';
import { getAllTrackedDomains } from '@versioning/schema';
import { renderTimeline } from '@versioning/ui/timeline';

export async function renderHistoryPanel(
  container: HTMLElement,
  currentDomain: string
): Promise<void> {
  container.textContent = '';

  appendChildren(
    container,
    createSectionHeading(
      'Version history',
      'Browse snapshots of previously detected terms and inspect what changed between versions.'
    )
  );

  const domains = await getAllTrackedDomains();
  if (domains.length === 0) {
    container.appendChild(createEmptyMessage('No version history yet'));
    return;
  }

  const selectRow = createElement('div', 'tc-select-row');
  const label = createElement('span', 'tc-select-label', `Domain (${domains.length} tracked):`);
  const select = createElement('select', 'tc-select') as HTMLSelectElement;
  for (const domain of domains) {
    const option = createElement('option', '', domain) as HTMLOptionElement;
    option.value = domain;
    option.selected = domain === currentDomain;
    select.appendChild(option);
  }
  appendChildren(selectRow, label, select);

  const timelineContainer = createElement('div');
  select.addEventListener('change', async () => {
    await clearNotification(select.value);
    const timeline = await renderTimeline(select.value);
    timelineContainer.textContent = '';
    timelineContainer.appendChild(timeline);
  });

  appendChildren(container, selectRow, timelineContainer);

  const selectedDomain = domains.includes(currentDomain) ? currentDomain : (domains[0] ?? '');
  if (selectedDomain) {
    await clearNotification(selectedDomain);
    const timeline = await renderTimeline(selectedDomain);
    timelineContainer.appendChild(timeline);
  }
}
