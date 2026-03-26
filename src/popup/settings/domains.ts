import {
  appendChildren,
  createButton,
  createElement,
  createEmptyMessage,
  createInput,
  createSectionHeading,
} from '@popup/ui';
import { getStorage, setStorage } from '@shared/storage';

export async function renderDomainSettings(container: HTMLElement): Promise<void> {
  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Domain blocklist',
      'Domains listed here are skipped during automatic T&C detection.'
    )
  );

  const blacklistResult = await getStorage('domainBlacklist');
  const blacklist = blacklistResult.ok ? blacklistResult.data : [];

  const addRow = createElement('div', 'tc-domain-add-row');
  const input = createInput('text', 'e.g. mail.google.com', '');
  input.style.flex = '1 1 180px';
  const addButton = createButton('Add', 'primary', () => {
    const domain = input.value.trim().toLowerCase();
    if (!domain || blacklist.includes(domain)) return;
    void addDomain(domain, container).catch(e => console.warn('[Goodman] add domain failed:', e));
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addButton.click();
  });
  appendChildren(addRow, input, addButton);
  container.appendChild(addRow);

  if (blacklist.length === 0) {
    container.appendChild(createEmptyMessage('No blocked domains.'));
    return;
  }

  for (const domain of blacklist) {
    const row = createElement('div', 'tc-domain-row');
    const label = createElement('div', 'tc-domain-label');
    appendChildren(
      label,
      createElement('div', 'tc-domain-name', domain)
    );
    const removeButton = createButton('Remove', 'secondary', () => {
      void removeDomain(domain, container).catch(e => console.warn('[Goodman] remove domain failed:', e));
    });
    appendChildren(row, label, removeButton);
    container.appendChild(row);
  }
}

async function addDomain(domain: string, container: HTMLElement): Promise<void> {
  const result = await getStorage('domainBlacklist');
  const list = result.ok ? [...result.data] : [];
  if (!list.includes(domain)) list.push(domain);
  await setStorage('domainBlacklist', list);
  await renderDomainSettings(container);
}

async function removeDomain(domain: string, container: HTMLElement): Promise<void> {
  const result = await getStorage('domainBlacklist');
  const list = result.ok ? result.data.filter((d) => d !== domain) : [];
  await setStorage('domainBlacklist', list);
  await renderDomainSettings(container);
}
