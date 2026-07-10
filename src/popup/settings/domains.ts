import {
  appendChildren,
  createButton,
  createElement,
  createEmptyMessage,
  createInput,
  createSectionHeading,
} from '@popup/ui';
import {
  getDomainPreferences,
  getStorage,
  setDomainPreferences,
  setStorage,
} from '@shared/storage';
import {
  DEFAULT_DOMAIN_PREFERENCES,
  WATCH_CLAUSE_OPTIONS,
  type DomainPreferences,
  type NotificationThreshold,
  type WatchClauseId,
} from '@shared/domain-preferences';
import { getAllTrackedDomains } from '@versioning/schema';

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
  input.setAttribute('aria-label', 'Domain to block');
  input.style.flex = '1 1 180px';
  const addButton = createButton('Add', 'primary', () => {
    const domain = input.value.trim().toLowerCase();
    if (!domain || blacklist.includes(domain)) return;
    void addDomain(domain, container).catch(e => console.warn('[Goodman] add domain failed:', e));
  });
  addButton.setAttribute('aria-label', 'Add domain to blocklist');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addButton.click();
  });
  appendChildren(addRow, input, addButton);
  container.appendChild(addRow);

  if (blacklist.length === 0) {
    container.appendChild(createEmptyMessage('No blocked domains.'));
  } else {
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
      removeButton.setAttribute('aria-label', `Remove ${domain} from blocklist`);
      appendChildren(row, label, removeButton);
      container.appendChild(row);
    }
  }

  await renderDomainPreferences(container);
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

async function renderDomainPreferences(container: HTMLElement): Promise<void> {
  container.appendChild(
    createSectionHeading(
      'Per-domain preferences',
      'Override clause watches, notification thresholds, summary language, and ignored summary patterns.'
    )
  );

  const domains = await getAllTrackedDomains();
  if (domains.length === 0) {
    container.appendChild(createEmptyMessage('No tracked domains yet.'));
    return;
  }

  for (const domain of domains) {
    container.appendChild(await createDomainPreferenceRow(domain));
  }
}

async function createDomainPreferenceRow(domain: string): Promise<HTMLElement> {
  const preferences = await getDomainPreferences(domain);
  const row = createElement('div', 'tc-domain-row tc-domain-preference-row');
  const body = createElement('div', 'tc-domain-label');
  appendChildren(
    body,
    createElement('div', 'tc-domain-name', domain),
    createThresholdField(domain, preferences),
    createClauseWatchField(domain, preferences),
    createLanguageField(domain, preferences),
    createIgnorePatternsField(domain, preferences)
  );
  row.appendChild(body);
  return row;
}

function createThresholdField(domain: string, preferences: DomainPreferences): HTMLElement {
  const field = createElement('div', 'tc-field');
  const label = createElement('label', 'tc-field-label', 'Notification threshold');
  const select = createElement('select', 'tc-select') as HTMLSelectElement;
  select.setAttribute('aria-label', `${domain} notification threshold`);
  for (const option of [
    ['any', 'Any meaningful change'],
    ['material', 'Material only'],
    ['red_flag_only', 'Red flags only'],
  ] as Array<[NotificationThreshold, string]>) {
    const item = createElement('option') as HTMLOptionElement;
    item.value = option[0];
    item.textContent = option[1];
    select.appendChild(item);
  }
  select.value = preferences.notificationThreshold;
  select.addEventListener('change', () => {
    void saveDomainPreferencePatch(domain, {
      notificationThreshold: select.value as NotificationThreshold,
    });
  });
  appendChildren(field, label, select);
  return field;
}

function createClauseWatchField(domain: string, preferences: DomainPreferences): HTMLElement {
  const field = createElement('div', 'tc-field');
  appendChildren(
    field,
    createElement('div', 'tc-field-label', 'Watch clauses')
  );
  const grid = createElement('div', 'tc-clause-grid');
  for (const option of WATCH_CLAUSE_OPTIONS) {
    const label = createElement('label', 'tc-clause-option');
    const check = createElement('input') as HTMLInputElement;
    check.type = 'checkbox';
    check.value = option.id;
    check.checked = preferences.watchClauses.includes(option.id);
    check.addEventListener('change', () => {
      const watchClauses = getSelectedWatchClauses(grid);
      void saveDomainPreferencePatch(domain, {
        watchClauses,
      });
    });
    appendChildren(label, check, document.createTextNode(option.label));
    grid.appendChild(label);
  }
  field.appendChild(grid);
  return field;
}

function createLanguageField(domain: string, preferences: DomainPreferences): HTMLElement {
  const field = createElement('div', 'tc-field');
  const input = createInput('text', 'e.g. English, Spanish, Japanese', preferences.summaryLanguage);
  input.setAttribute('aria-label', `${domain} summary language`);
  input.addEventListener('change', () => {
    void saveDomainPreferencePatch(domain, {
      summaryLanguage: input.value.trim(),
    });
  });
  appendChildren(
    field,
    createElement('label', 'tc-field-label', 'Summary language'),
    input
  );
  return field;
}

function createIgnorePatternsField(domain: string, preferences: DomainPreferences): HTMLElement {
  const field = createElement('div', 'tc-field');
  const input = createInput('text', 'regex, comma-separated', preferences.ignorePatterns.join(', '));
  input.setAttribute('aria-label', `${domain} ignore patterns`);
  input.addEventListener('change', () => {
    void saveDomainPreferencePatch(domain, {
      ignorePatterns: splitIgnorePatterns(input.value),
    });
  });
  appendChildren(
    field,
    createElement('label', 'tc-field-label', 'Ignore patterns'),
    input
  );
  return field;
}

function getSelectedWatchClauses(container: HTMLElement): WatchClauseId[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'))
    .map(input => input.value)
    .filter((value): value is WatchClauseId =>
      WATCH_CLAUSE_OPTIONS.some(option => option.id === value)
    );
}

function splitIgnorePatterns(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

async function saveDomainPreferencePatch(
  domain: string,
  patch: Partial<DomainPreferences>
): Promise<unknown> {
  const preferences = await getDomainPreferences(domain);
  return setDomainPreferences(domain, {
    ...DEFAULT_DOMAIN_PREFERENCES,
    ...preferences,
    ...patch,
  });
}
