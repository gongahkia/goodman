import { getStorage, setStorage } from '@shared/storage';
import type { Settings, ProviderConfig } from '@shared/messages';
import { validateProvider } from '@providers/factory';

const ADVANCED_PROVIDERS = ['openai', 'claude', 'gemini', 'ollama', 'custom'] as const;
type ProviderName = (typeof ADVANCED_PROVIDERS)[number];
const PROVIDER_LABELS: Record<string, string> = {
  hosted: 'TC Guard Cloud',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
  ollama: 'Ollama (Local)',
  custom: 'Custom Endpoint',
};

export async function renderProviderSettings(container: HTMLElement): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  renderProviderSettingsView(container, settingsResult.data);
}

function renderProviderConfig(
  container: HTMLElement,
  name: ProviderName,
  config: ProviderConfig
): void {
  container.textContent = '';
  const draftConfig: ProviderConfig = { ...config };

  const title = document.createElement('h4');
  title.style.cssText = 'font-size:14px;font-weight:600;margin-bottom:12px;padding-top:12px;border-top:1px solid #e5e7eb';
  title.textContent = `${PROVIDER_LABELS[name] ?? name} Configuration`;
  container.appendChild(title);

  if (name !== 'ollama') {
    const keyLabel = document.createElement('label');
    keyLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;margin-bottom:4px';
    keyLabel.textContent = 'API Key';
    container.appendChild(keyLabel);

    const keyRow = document.createElement('div');
    keyRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';
    const keyInput = document.createElement('input');
    keyInput.type = 'password';
    keyInput.value = config.apiKey;
    keyInput.placeholder = name === 'custom' ? 'Optional' : 'Enter API key';
    keyInput.style.cssText = 'flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px';
    keyInput.addEventListener('input', () => {
      draftConfig.apiKey = keyInput.value;
      void saveProviderConfig(name, draftConfig);
    });

    const showBtn = document.createElement('button');
    showBtn.style.cssText = 'border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;background:white';
    showBtn.textContent = 'Show';
    showBtn.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
      showBtn.textContent = keyInput.type === 'password' ? 'Show' : 'Hide';
    });

    const testBtn = document.createElement('button');
    testBtn.style.cssText = 'border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;background:#2563eb;color:white';
    testBtn.textContent = 'Test';
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = 'Testing...';
      testBtn.disabled = true;
      try {
        const valid = await validateProvider(name);
        testBtn.textContent = valid ? 'Valid' : 'Invalid';
        testBtn.style.background = valid ? '#16a34a' : '#dc2626';
      } catch {
        testBtn.textContent = 'Error';
        testBtn.style.background = '#dc2626';
      }
      setTimeout(() => {
        testBtn.textContent = 'Test';
        testBtn.style.background = '#2563eb';
        testBtn.disabled = false;
      }, 2000);
    });

    keyRow.appendChild(keyInput);
    keyRow.appendChild(showBtn);
    keyRow.appendChild(testBtn);
    container.appendChild(keyRow);
  }

  if (name === 'ollama' || name === 'custom') {
    const urlLabel = document.createElement('label');
    urlLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;margin-bottom:4px';
    urlLabel.textContent = 'Base URL';
    container.appendChild(urlLabel);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = config.baseUrl ?? '';
    urlInput.placeholder = name === 'ollama' ? 'http://localhost:11434' : 'https://your-endpoint.com';
    urlInput.style.cssText = 'width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:12px;box-sizing:border-box';
    urlInput.addEventListener('input', () => {
      draftConfig.baseUrl = urlInput.value;
      void saveProviderConfig(name, draftConfig);
    });
    container.appendChild(urlInput);
  }

  const modelLabel = document.createElement('label');
  modelLabel.style.cssText = 'display:block;font-size:13px;font-weight:500;margin-bottom:4px';
  modelLabel.textContent = 'Model';
  container.appendChild(modelLabel);

  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.value = config.model;
  modelInput.placeholder = 'Model name';
  modelInput.style.cssText = 'width:100%;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;box-sizing:border-box';
  modelInput.addEventListener('input', () => {
    draftConfig.model = modelInput.value;
    void saveProviderConfig(name, draftConfig);
  });
  container.appendChild(modelInput);
}

function renderProviderSettingsView(
  container: HTMLElement,
  settings: Settings
): void {
  container.textContent = '';
  const activeAdvancedProvider = isVisibleProvider(settings.activeProvider)
    ? settings.activeProvider
    : 'openai';

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'LLM Provider Settings';
  container.appendChild(heading);

  container.appendChild(createHostedProviderCard(container, settings));

  const advancedHeading = document.createElement('h4');
  advancedHeading.style.cssText = 'font-size:14px;font-weight:600;margin:20px 0 8px';
  advancedHeading.textContent = 'Advanced Providers';
  container.appendChild(advancedHeading);

  const advancedCopy = document.createElement('p');
  advancedCopy.style.cssText =
    'font-size:13px;color:#6b7280;line-height:1.5;margin-bottom:12px';
  advancedCopy.textContent =
    'Use these options only if you want to bring your own provider credentials or run a local model.';
  container.appendChild(advancedCopy);

  const advancedSection = document.createElement('details');
  advancedSection.style.cssText =
    'border:1px solid #e5e7eb;border-radius:12px;padding:12px;background:#fafafa';
  advancedSection.open = settings.activeProvider !== 'hosted';

  const advancedSummary = document.createElement('summary');
  advancedSummary.style.cssText =
    'cursor:pointer;font-size:13px;font-weight:600;color:#111827';
  advancedSummary.textContent = 'Configure OpenAI, Claude, Gemini, Ollama, or custom endpoints';
  advancedSection.appendChild(advancedSummary);

  const radioGroup = document.createElement('div');
  radioGroup.style.cssText = 'margin:16px 0';

  const configSection = document.createElement('div');

  for (const name of ADVANCED_PROVIDERS) {
    const label = document.createElement('label');
    label.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-size:14px';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'activeProvider';
    radio.value = name;
    radio.checked = settings.activeProvider === name;
    radio.addEventListener('change', async () => {
      const updatedSettings = await saveActiveProvider(name);
      if (!updatedSettings) return;
      advancedSection.open = true;
      renderProviderConfigSection(configSection, name, updatedSettings);
    });
    label.appendChild(radio);
    label.appendChild(document.createTextNode(PROVIDER_LABELS[name] ?? name));
    radioGroup.appendChild(label);
  }

  advancedSection.appendChild(radioGroup);
  renderProviderConfigSection(configSection, activeAdvancedProvider, settings);
  advancedSection.appendChild(configSection);
  container.appendChild(advancedSection);
}

function renderProviderConfigSection(
  container: HTMLElement,
  providerName: ProviderName,
  settings: Settings
): void {
  const activeConfig = settings.providers[providerName];
  renderProviderConfig(
    container,
    providerName,
    activeConfig ?? { apiKey: '', model: '' }
  );
}

function createHostedProviderCard(
  container: HTMLElement,
  settings: Settings
): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:16px';

  const heading = document.createElement('div');
  heading.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:flex-start';

  const titleGroup = document.createElement('div');
  const title = document.createElement('h4');
  title.style.cssText = 'font-size:15px;font-weight:600;margin-bottom:6px;color:#1d4ed8';
  title.textContent = 'TC Guard Cloud';

  const description = document.createElement('p');
  description.style.cssText = 'font-size:13px;line-height:1.5;color:#1e3a8a';
  description.textContent =
    'Recommended for most people. No API key is required, and analysis runs through the default TC Guard hosted service.';

  titleGroup.appendChild(title);
  titleGroup.appendChild(description);

  const button = document.createElement('button');
  button.style.cssText =
    'border:none;border-radius:8px;padding:8px 12px;cursor:pointer;font-size:12px;background:#2563eb;color:white;flex-shrink:0';
  button.textContent =
    settings.activeProvider === 'hosted' ? 'Selected' : 'Use TC Guard Cloud';
  button.disabled = settings.activeProvider === 'hosted';
  button.addEventListener('click', async () => {
    const updatedSettings = await saveActiveProvider('hosted');
    if (!updatedSettings) return;
    renderProviderSettingsView(container, updatedSettings);
  });

  heading.appendChild(titleGroup);
  heading.appendChild(button);
  card.appendChild(heading);

  const consentStatus = document.createElement('p');
  consentStatus.style.cssText = 'margin-top:12px;font-size:12px;color:#1e40af';
  consentStatus.textContent = settings.hostedConsentAccepted
    ? 'Privacy disclosure accepted. Hosted analysis is enabled.'
    : 'Privacy disclosure not accepted yet. The first hosted analysis will ask for one-time consent.';
  card.appendChild(consentStatus);

  return card;
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
