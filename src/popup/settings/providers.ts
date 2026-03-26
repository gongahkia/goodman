import {
  appendChildren,
  createButton,
  createElement,
  createFieldLabel,
  createInput,
  createPill,
  createSectionHeading,
  createSkeletonGroup,
} from '@popup/ui';
import { validateProvider } from '@providers/factory';
import { HostedProvider } from '@providers/hosted';
import type { Settings, ProviderConfig } from '@shared/messages';
import { getStorage, setStorage } from '@shared/storage';

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => { clearTimeout(timer); timer = setTimeout(fn, ms); };
}

const ADVANCED_PROVIDERS = ['openai', 'claude', 'gemini', 'ollama', 'custom'] as const;
type ProviderName = (typeof ADVANCED_PROVIDERS)[number];

const PROVIDER_LABELS: Record<string, string> = {
  hosted: 'Goodman Cloud',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  custom: 'Custom Endpoint',
};

const PROVIDER_DESCRIPTIONS: Record<ProviderName, string> = {
  openai: 'Use your own OpenAI account and model selection.',
  claude: 'Point Goodman at Anthropic for stronger legal summarization.',
  gemini: 'Use a Google-hosted model if that is already in your workflow.',
  ollama: 'Run analysis against a local Ollama model on your machine.',
  custom: 'Connect any OpenAI-compatible endpoint or internal proxy.',
};

export async function renderProviderSettings(container: HTMLElement): Promise<void> {
  container.textContent = '';
  container.appendChild(createSkeletonGroup());
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  renderProviderSettingsView(container, settingsResult.data);
}

function renderProviderSettingsView(
  container: HTMLElement,
  settings: Settings
): void {
  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Provider configuration',
      'Choose the analysis backend you want Goodman to call when it summarizes detected agreements.'
    )
  );

  container.appendChild(createHostedProviderCard(container, settings));

  container.appendChild(
    createSectionHeading(
      'Advanced providers',
      'Use these when you want to bring your own credentials or route requests to a local model.'
    )
  );

  const picker = createElement('div', 'tc-provider-picker');
  const configSection = createElement('div', 'tc-callout');
  const activeAdvancedProvider = isVisibleProvider(settings.activeProvider)
    ? settings.activeProvider
    : 'openai';

  for (const name of ADVANCED_PROVIDERS) {
    picker.appendChild(createProviderOption(name, settings, configSection));
  }

  renderProviderConfigSection(configSection, activeAdvancedProvider, settings);
  appendChildren(container, picker, configSection);
}

function createHostedProviderCard(
  container: HTMLElement,
  settings: Settings
): HTMLElement {
  const card = createElement('section', 'tc-callout');
  const topRow = createElement('div', 'tc-split-row');
  const copy = createElement('div');
  appendChildren(
    copy,
    createElement('div', 'tc-callout-title', 'Goodman Cloud'),
    createElement(
      'p',
      'tc-callout-copy',
      'No API key required. Analysis runs through the Goodman hosted service.'
    )
  );

  const button = createButton(
    settings.activeProvider === 'hosted' ? 'Selected' : 'Use Goodman Cloud',
    settings.activeProvider === 'hosted' ? 'secondary' : 'primary',
    () => {
      void saveActiveProvider('hosted').then((updatedSettings) => {
        if (!updatedSettings) return;
        renderProviderSettingsView(container, updatedSettings);
      }).catch(e => console.warn('[Goodman] save hosted provider failed:', e));
    }
  );
  button.disabled = settings.activeProvider === 'hosted';

  appendChildren(topRow, copy, button);
  card.appendChild(topRow);

  const pillRow = createElement('div', 'tc-pill-row');
  pillRow.appendChild(
    settings.hostedConsentAccepted
      ? createPill('Privacy disclosure accepted', 'blue')
      : createPill('Privacy disclosure pending', 'muted')
  );
  const healthPill = createPill('Checking...', 'muted');
  pillRow.appendChild(healthPill);
  card.appendChild(pillRow);

  const hostedConfig = settings.providers['hosted'];
  const hosted = new HostedProvider(hostedConfig?.baseUrl);
  void hosted.checkHealth().then((online: boolean) => {
    healthPill.textContent = online ? 'Online' : 'Unreachable';
    healthPill.className = online ? 'tc-pill tc-pill--low' : 'tc-pill tc-pill--critical';
    if (!online && settings.activeProvider !== 'hosted') {
      button.disabled = true;
    }
  }).catch(e => console.warn('[Goodman] hosted health check UI failed:', e));

  return card;
}

function createProviderOption(
  name: ProviderName,
  settings: Settings,
  configSection: HTMLElement
): HTMLElement {
  const label = createElement('label', 'tc-provider-option');
  const radio = createElement('input') as HTMLInputElement;
  radio.type = 'radio';
  radio.name = 'activeProvider';
  radio.value = name;
  radio.checked = settings.activeProvider === name;
  radio.addEventListener('change', async () => {
    const updatedSettings = await saveActiveProvider(name);
    if (!updatedSettings) return;
    renderProviderConfigSection(configSection, name, updatedSettings);
  });

  const body = createElement('div', 'tc-option-body');
  appendChildren(
    body,
    createElement('div', 'tc-option-title', PROVIDER_LABELS[name] ?? name),
    createElement('div', 'tc-option-copy', PROVIDER_DESCRIPTIONS[name])
  );

  appendChildren(label, radio, body);
  return label;
}

function renderProviderConfigSection(
  container: HTMLElement,
  providerName: ProviderName,
  settings: Settings
): void {
  const activeConfig = settings.providers[providerName] ?? { apiKey: '', model: '' };
  renderProviderConfig(container, providerName, activeConfig);
}

function renderProviderConfig(
  container: HTMLElement,
  name: ProviderName,
  config: ProviderConfig
): void {
  container.textContent = '';

  appendChildren(
    container,
    createElement(
      'div',
      'tc-callout-title',
      `${PROVIDER_LABELS[name] ?? name} Configuration`
    ),
    createElement(
      'p',
      'tc-callout-copy',
      name === 'ollama'
        ? 'Set the local model endpoint and model name that Goodman should call.'
        : 'Fill in the credentials and model details that should be used for analysis.'
    )
  );

  const fieldGroup = createElement('div', 'tc-field-group');
  const draftConfig: ProviderConfig = { ...config };

  if (name !== 'ollama') {
    fieldGroup.appendChild(createApiKeyField(name, draftConfig));
  }

  if (name === 'ollama' || name === 'custom') {
    fieldGroup.appendChild(
      createBaseUrlField(
        name,
        draftConfig,
        name === 'ollama' ? 'http://localhost:11434' : 'https://your-endpoint.com'
      )
    );
  }

  fieldGroup.appendChild(createModelField(name, draftConfig));
  container.appendChild(fieldGroup);
}

function createApiKeyField(
  providerName: ProviderName,
  draftConfig: ProviderConfig
): HTMLElement {
  const field = createElement('div', 'tc-field');
  const inputId = `tc-apikey-${providerName}`;
  const label = createFieldLabel('API Key', inputId);
  const controls = createElement('div', 'tc-inline-controls');
  const input = createInput(
    'password',
    providerName === 'custom' ? 'Optional' : 'Enter API key',
    draftConfig.apiKey,
    inputId
  );
  input.style.flex = '1 1 180px';
  const debouncedSaveApiKey = debounce(() => void saveProviderConfig(providerName, draftConfig).catch(e => console.warn('[Goodman] save provider config failed:', e)), 400);
  input.addEventListener('input', () => {
    draftConfig.apiKey = input.value;
    debouncedSaveApiKey();
  });

  const showButton = createButton('Show', 'secondary', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    showButton.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });

  const testButton = createButton('Test', 'secondary', () => {
    void runProviderValidation(providerName, testButton).catch(e => console.warn('[Goodman] provider validation failed:', e));
  });

  appendChildren(field, label);
  appendChildren(controls, input, showButton, testButton);
  field.appendChild(controls);
  return field;
}

function createBaseUrlField(
  providerName: ProviderName,
  draftConfig: ProviderConfig,
  placeholder: string
): HTMLElement {
  const field = createElement('div', 'tc-field');
  const inputId = `tc-baseurl-${providerName}`;
  const label = createFieldLabel('Base URL', inputId);
  const input = createInput('text', placeholder, draftConfig.baseUrl ?? '', inputId);
  const debouncedSaveBaseUrl = debounce(() => void saveProviderConfig(providerName, draftConfig).catch(e => console.warn('[Goodman] save provider config failed:', e)), 400);
  input.addEventListener('input', () => {
    draftConfig.baseUrl = input.value;
    debouncedSaveBaseUrl();
  });

  appendChildren(field, label, input);
  return field;
}

function createModelField(
  providerName: ProviderName,
  draftConfig: ProviderConfig
): HTMLElement {
  const field = createElement('div', 'tc-field');
  const inputId = `tc-model-${providerName}`;
  const label = createFieldLabel('Model', inputId);
  const input = createInput('text', 'Model name', draftConfig.model, inputId);
  const debouncedSaveModel = debounce(() => void saveProviderConfig(providerName, draftConfig).catch(e => console.warn('[Goodman] save provider config failed:', e)), 400);
  input.addEventListener('input', () => {
    draftConfig.model = input.value;
    debouncedSaveModel();
  });

  appendChildren(field, label, input);
  return field;
}

async function runProviderValidation(
  providerName: ProviderName,
  button: HTMLButtonElement
): Promise<void> {
  button.textContent = 'Testing...';
  button.disabled = true;

  try {
    const valid = await validateProvider(providerName);
    button.textContent = valid ? 'Valid' : 'Invalid — check key';
    button.style.color = valid ? '#3f8f63' : '#b54745';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    button.textContent = msg.includes('fetch') || msg.includes('network')
      ? 'Unreachable'
      : 'Error';
    button.style.color = '#b54745';
  }

  button.disabled = false;
}

async function saveActiveProvider(
  name: Settings['activeProvider']
): Promise<Settings | null> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return null;

  const nextSettings = {
    ...settingsResult.data,
    activeProvider: name,
  };

  const saveResult = await setStorage('settings', nextSettings);
  if (!saveResult.ok) return null;
  return nextSettings;
}

async function saveProviderConfig(
  name: ProviderName,
  config: ProviderConfig
): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;

  const providers = {
    ...settingsResult.data.providers,
    [name]: config,
  };

  await setStorage('settings', { ...settingsResult.data, providers });
}

function isVisibleProvider(name: Settings['activeProvider']): name is ProviderName {
  return ADVANCED_PROVIDERS.includes(name as ProviderName);
}
