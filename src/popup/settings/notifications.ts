import { appendChildren, createElement, createEmptyMessage, createSectionHeading } from '@popup/ui';
import {
  getDomainNotificationPreference,
  getStorage,
  setDomainNotificationPreference,
  setStorage,
} from '@shared/storage';
import { getAllTrackedDomains } from '@versioning/schema';

export async function renderNotificationSettings(container: HTMLElement): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  const settings = settingsResult.data;

  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Notification settings',
      'Choose when Goodman should surface stored terms changes for domains you revisit.'
    )
  );

  const globalRow = createElement('label', 'tc-domain-row');
  const globalCheck = createElement('input') as HTMLInputElement;
  globalCheck.type = 'checkbox';
  globalCheck.checked = settings.notifyOnChange;
  globalCheck.addEventListener('change', async () => {
    const nextSettings = await getStorage('settings');
    if (!nextSettings.ok) return;
    await setStorage('settings', {
      ...nextSettings.data,
      notifyOnChange: globalCheck.checked,
    });
  });

  const globalBody = createElement('div', 'tc-domain-label');
  appendChildren(
    globalBody,
    createElement('div', 'tc-option-title', 'Notify when tracked T&C change'),
    createElement(
      'div',
      'tc-option-copy',
      'This controls the top-level banner and pending change reminders in the popup.'
    )
  );
  appendChildren(globalRow, globalCheck, globalBody);
  container.appendChild(globalRow);

  container.appendChild(
    createSectionHeading(
      'Tracked domains',
      'Override notifications domain by domain once Goodman has saved version history for them.'
    )
  );

  const domains = await getAllTrackedDomains();
  if (domains.length === 0) {
    container.appendChild(createEmptyMessage('No domains tracked yet.'));
    return;
  }

  for (const domain of domains) {
    const row = createElement('label', 'tc-domain-row');
    const check = createElement('input') as HTMLInputElement;
    check.type = 'checkbox';
    check.checked = await getDomainNotificationPreference(domain);
    check.addEventListener('change', async () => {
      await setDomainNotificationPreference(domain, check.checked);
    });

    const label = createElement('div', 'tc-domain-label');
    appendChildren(
      label,
      createElement('div', 'tc-domain-name', domain),
      createElement(
        'div',
        'tc-option-copy',
        'Show alerts and pending review banners when new terms are detected.'
      )
    );

    appendChildren(row, check, label);
    container.appendChild(row);
  }
}
