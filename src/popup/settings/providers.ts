import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import {
  appendChildren,
  createButton,
  createElement,
  createFieldLabel,
  createInput,
  createSectionHeading,
  createSkeletonGroup,
} from '@popup/ui';
import { validateProvider } from '@providers/factory';
import type { Settings, ProviderConfig } from '@shared/messages';
import { getStorage, setStorage } from '@shared/storage';

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

const ADVANCED_PROVIDERS = ['openai', 'claude', 'gemini', 'ollama', 'custom'] as const;
type ProviderName = (typeof ADVANCED_PROVIDERS)[number];

const PROVIDER_LABELS: Record<ProviderName, string> = {
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  custom: 'Custom Endpoint',
};

const PROVIDER_DESCRIPTIONS: Record<ProviderName, string> = {
  openai: 'Use your own OpenAI account and model selection.',
  claude: 'Point Goodman at Anthropic for stronger legal summarization.',
  gemini: 'Use a Gemini model if that is already in your workflow.',
  ollama: 'Run analysis against a local Ollama model on your machine.',
  custom: 'Connect any OpenAI-compatible endpoint or internal proxy.',
};

export async function renderProviderSettings(
  container: HTMLElement,
  onComplete?: () => void
): Promise<void> {
  container.textContent = '';
  container.appendChild(createSkeletonGroup());
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  renderProviderSettingsView(container, settingsResult.data);
  if (onComplete) container.addEventListener('goodman-provider-ready', onComplete, { once: true });
}

function renderProviderSettingsView(container: HTMLElement, settings: Settings): void {
  container.textContent = '';
  container.appendChild(
    createSectionHeading(
      'Provider configuration',
      'Choose the provider Goodman should call with your own credentials or local endpoint.'
    )
  );

  const picker = createElement('div', 'tc-provider-picker');
  picker.setAttribute('role', 'radiogroup');
  picker.setAttribute('aria-label', 'Provider');
  const configSection = createElement('div', 'tc-callout');
  configSection.setAttribute('role', 'region');
  configSection.setAttribute('aria-live', 'polite');
  configSection.setAttribute('aria-label', 'Provider configuration');
  const activeAdvancedProvider = isVisibleProvider(settings.activeProvider)
    ? settings.activeProvider
    : 'openai';

  for (const name of ADVANCED_PROVIDERS) {
    picker.appendChild(createProviderOption(name, settings, configSection));
  }

  renderProviderConfigSection(configSection, activeAdvancedProvider, settings);
  appendChildren(container, picker, configSection);
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
    createElement('div', 'tc-callout-title', `${PROVIDER_LABELS[name] ?? name} Configuration`),
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
  const test = createButton('Test', 'secondary', () => {
    void runProviderValidation(name, test, draftConfig);
  });
  test.setAttribute('aria-label', `Test ${name} provider connection`);
  const status = createElement('p', 'tc-option-copy');
  status.setAttribute('role', 'status');
  const sample = createButton('Analyze a sample', 'primary', () => {
    sample.disabled = true;
    status.textContent = 'Testing the selected model with a short sample…';
    void (async () => {
      await saveProviderConfig(name, draftConfig);
      const result = await singleShotSummarizeWithProvider(
        'The subscription automatically renews monthly. You can cancel at any time in account settings before the next billing date. Cancellation stops future renewal but does not refund the current month.',
        name
      );
      if (!result.ok) throw new Error(result.error.userMessage ?? result.error.message);
      status.textContent = `Sample analysis: ${result.data.summary}`;
      container.appendChild(
        createButton('Return to current page', 'primary', () =>
          container.dispatchEvent(new CustomEvent('goodman-provider-ready', { bubbles: true }))
        )
      );
    })()
      .catch((error) => {
        status.textContent = String(error);
      })
      .finally(() => {
        sample.disabled = false;
      });
  });
  appendChildren(
    container,
    test,
    createElement(
      'p',
      'tc-option-copy',
      'The sample sends only example text to this provider and may incur a small usage charge.'
    ),
    sample,
    status
  );
}

function createApiKeyField(providerName: ProviderName, draftConfig: ProviderConfig): HTMLElement {
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
  const debouncedSaveApiKey = debounce(
    () =>
      void saveProviderConfig(providerName, draftConfig).catch((e) =>
        console.warn('[Goodman] save provider config failed:', e)
      ),
    400
  );
  input.addEventListener('input', () => {
    draftConfig.apiKey = input.value;
    debouncedSaveApiKey();
  });

  const showButton = createButton('Show', 'secondary', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    showButton.textContent = input.type === 'password' ? 'Show' : 'Hide';
    showButton.setAttribute(
      'aria-label',
      `${input.type === 'password' ? 'Show' : 'Hide'} ${providerName} API key`
    );
    showButton.setAttribute('aria-pressed', String(input.type !== 'password'));
  });
  showButton.setAttribute('aria-controls', inputId);
  showButton.setAttribute('aria-label', `Show ${providerName} API key`);
  showButton.setAttribute('aria-pressed', 'false');

  appendChildren(field, label);
  appendChildren(controls, input, showButton);
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
  const debouncedSaveBaseUrl = debounce(
    () =>
      void saveProviderConfig(providerName, draftConfig).catch((e) =>
        console.warn('[Goodman] save provider config failed:', e)
      ),
    400
  );
  input.addEventListener('input', () => {
    draftConfig.baseUrl = input.value;
    debouncedSaveBaseUrl();
  });

  appendChildren(field, label, input);
  return field;
}

function createModelField(providerName: ProviderName, draftConfig: ProviderConfig): HTMLElement {
  const field = createElement('div', 'tc-field');
  const inputId = `tc-model-${providerName}`;
  const label = createFieldLabel('Model', inputId);
  const input = createInput('text', 'Model name', draftConfig.model, inputId);
  const debouncedSaveModel = debounce(
    () =>
      void saveProviderConfig(providerName, draftConfig).catch((e) =>
        console.warn('[Goodman] save provider config failed:', e)
      ),
    400
  );
  input.addEventListener('input', () => {
    draftConfig.model = input.value;
    debouncedSaveModel();
  });

  appendChildren(field, label, input);
  return field;
}

async function runProviderValidation(
  providerName: ProviderName,
  button: HTMLButtonElement,
  draftConfig?: ProviderConfig
): Promise<void> {
  button.textContent = 'Testing...';
  button.setAttribute('aria-label', `Testing ${providerName} provider connection`);
  button.disabled = true;

  try {
    if (draftConfig) await saveProviderConfig(providerName, draftConfig);
    const valid = await validateProvider(providerName);
    button.textContent = valid ? 'Valid' : 'Invalid — check key';
    button.setAttribute(
      'aria-label',
      `${providerName} provider connection ${valid ? 'valid' : 'invalid'}`
    );
    button.style.color = valid ? '#3f8f63' : '#b54745';
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const statusLabel = msg.includes('fetch') || msg.includes('network') ? 'Unreachable' : 'Error';
    button.textContent = statusLabel;
    button.setAttribute(
      'aria-label',
      `${providerName} provider connection ${statusLabel.toLowerCase()}`
    );
    button.style.color = '#b54745';
  }

  button.disabled = false;
}

async function saveActiveProvider(name: ProviderName): Promise<Settings | null> {
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

async function saveProviderConfig(name: ProviderName, config: ProviderConfig): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;

  const providers = {
    ...settingsResult.data.providers,
    [name]: config,
  };

  const saved = await setStorage('settings', { ...settingsResult.data, providers });
  if (!saved.ok) throw saved.error;
}

function isVisibleProvider(name: Settings['activeProvider']): name is ProviderName {
  return ADVANCED_PROVIDERS.includes(name as ProviderName);
}
