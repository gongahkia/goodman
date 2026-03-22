import { clearNotification } from '@versioning/notifications';
import { renderTimeline } from '@versioning/ui/timeline';
import { getAllTrackedDomains } from '@versioning/schema';

export async function renderHistoryPanel(
  container: HTMLElement,
  currentDomain: string
): Promise<void> {
  container.textContent = '';

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Version History';
  container.appendChild(heading);

  const domains = await getAllTrackedDomains();

  if (domains.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color:#6b7280;text-align:center;padding:20px';
    empty.textContent = 'No version history yet';
    container.appendChild(empty);
    return;
  }

  const select = document.createElement('select');
  select.style.cssText = 'width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:16px';
  for (const domain of domains) {
    const option = document.createElement('option');
    option.value = domain;
    option.textContent = domain;
    if (domain === currentDomain) option.selected = true;
    select.appendChild(option);
  }

  const timelineContainer = document.createElement('div');

  select.addEventListener('change', async () => {
    await clearNotification(select.value);
    const timeline = await renderTimeline(select.value);
    timelineContainer.textContent = '';
    timelineContainer.appendChild(timeline);
  });

  container.appendChild(select);
  container.appendChild(timelineContainer);

  const selectedDomain = domains.includes(currentDomain) ? currentDomain : (domains[0] ?? '');
  if (selectedDomain) {
    await clearNotification(selectedDomain);
    const timeline = await renderTimeline(selectedDomain);
    timelineContainer.appendChild(timeline);
  }
}
