import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@providers/factory', () => ({
  validateProvider: vi.fn().mockResolvedValue(true),
}));

import type { Settings } from '@shared/messages';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { renderProviderSettings } from '@popup/settings/providers';
import { validateProvider } from '@providers/factory';
import { mockStorage } from '../mocks/chrome';

describe('provider settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockStorage.settings = structuredClone(DEFAULT_SETTINGS);
    vi.clearAllMocks();
  });

  it('rerenders the provider config immediately when the active provider changes', async () => {
    const container = await renderSettings();

    const ollamaRadio = getProviderRadio(container, 'ollama');
    ollamaRadio.checked = true;
    ollamaRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(getStoredSettings().activeProvider).toBe('ollama');
    expect(container.textContent).toContain('Ollama (Local) Configuration');
    expect(container.textContent).toContain('Base URL');
    expect(container.textContent).not.toContain('API Key');
  });

  it('renders TC Guard Cloud as the default recommended option', async () => {
    const container = await renderSettings();

    expect(container.textContent).toContain('TC Guard Cloud');
    expect(container.textContent).toContain('Recommended for most people');
    expect(container.textContent).toContain('Selected');
  });

  it('keeps the test button bound to the currently displayed provider', async () => {
    const container = await renderSettings();

    let testButton = getTestButton(container);
    testButton.click();
    await flush();
    expect(validateProvider).toHaveBeenLastCalledWith('openai');

    const customRadio = getProviderRadio(container, 'custom');
    customRadio.checked = true;
    customRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    testButton = getTestButton(container);
    testButton.click();
    await flush();
    expect(validateProvider).toHaveBeenLastCalledWith('custom');
  });

  it('persists draft edits immediately so they survive provider switches', async () => {
    const container = await renderSettings();

    const apiKeyInput = getApiKeyInput(container);
    const modelInput = getModelInput(container);

    apiKeyInput.value = 'sk-draft-openai';
    apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    modelInput.value = 'gpt-4.1-draft';
    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(getStoredSettings().providers.openai.apiKey).toBe('sk-draft-openai');
    expect(getStoredSettings().providers.openai.model).toBe('gpt-4.1-draft');

    const ollamaRadio = getProviderRadio(container, 'ollama');
    ollamaRadio.checked = true;
    ollamaRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    const openaiRadio = getProviderRadio(container, 'openai');
    openaiRadio.checked = true;
    openaiRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();

    expect(getApiKeyInput(container).value).toBe('sk-draft-openai');
    expect(getModelInput(container).value).toBe('gpt-4.1-draft');
  });
});

async function renderSettings(): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await renderProviderSettings(container);
  return container;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function getStoredSettings(): Settings {
  return mockStorage.settings as Settings;
}

function getProviderRadio(
  container: HTMLElement,
  provider: string
): HTMLInputElement {
  return container.querySelector(
    `input[name="activeProvider"][value="${provider}"]`
  ) as HTMLInputElement;
}

function getTestButton(container: HTMLElement): HTMLButtonElement {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent === 'Test'
  ) as HTMLButtonElement;
}

function getApiKeyInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="password"]') as HTMLInputElement;
}

function getModelInput(container: HTMLElement): HTMLInputElement {
  return Array.from(container.querySelectorAll('input[type="text"]')).find(
    (input) => (input as HTMLInputElement).placeholder === 'Model name'
  ) as HTMLInputElement;
}
