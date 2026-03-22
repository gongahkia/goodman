import { getStorage, setStorage } from '@shared/storage';
import type { Settings, ProviderConfig } from '@shared/messages';
import { validateProvider } from '@providers/factory';

const PROVIDERS = ['openai', 'claude', 'gemini', 'ollama', 'custom'] as const;
type ProviderName = (typeof PROVIDERS)[number];
const PROVIDER_LABELS: Record<string, string> = {
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

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'LLM Provider Settings';
  container.appendChild(heading);

  const radioGroup = document.createElement('div');
  radioGroup.style.cssText = 'margin-bottom:16px';

  const configSection = document.createElement('div');

  for (const name of PROVIDERS) {
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
      renderProviderConfigSection(configSection, updatedSettings.activeProvider, updatedSettings);
    });
    label.appendChild(radio);
    label.appendChild(document.createTextNode(PROVIDER_LABELS[name] ?? name));
    radioGroup.appendChild(label);
  }

  container.appendChild(radioGroup);
  renderProviderConfigSection(configSection, settings.activeProvider, settings);
  container.appendChild(configSection);
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
