import { appendChildren, createElement, createSectionHeading } from '@popup/ui';
import { getStorage, setStorage } from '@shared/storage';

export async function renderCorpusSettings(container: HTMLElement): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  const settings = settingsResult.data;

  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Anonymous corpus contribution',
      'Record a default-off preference for future public T&C corpus contribution.'
    )
  );

  const disclosure = createElement('div', 'tc-callout');
  appendChildren(
    disclosure,
    createElement('div', 'tc-callout-title', 'Public dataset disclosure'),
    createElement(
      'p',
      'tc-callout-copy',
      'When launched after legal review, this would submit only legal text, hostname, timestamp, and summary/diff metadata. Cookies, headers, account data, full URLs, query params, and arbitrary page fields are not allowed. This build does not upload corpus data.'
    )
  );

  const row = createElement('label', 'tc-domain-row');
  const check = createElement('input') as HTMLInputElement;
  check.type = 'checkbox';
  check.checked = settings.corpusContribution.enabled;
  check.addEventListener('change', async () => {
    const nextSettings = await getStorage('settings');
    if (!nextSettings.ok) return;
    await setStorage('settings', {
      ...nextSettings.data,
      corpusContribution: { enabled: check.checked },
    });
  });

  const body = createElement('div', 'tc-domain-label');
  appendChildren(
    body,
    createElement('div', 'tc-option-title', 'Contribute anonymized T&C records'),
    createElement(
      'div',
      'tc-option-copy',
      'Default off. Enabling stores your preference only; uploads remain unavailable until the public corpus gate is cleared.'
    )
  );
  appendChildren(row, check, body);
  appendChildren(container, disclosure, row);
}
