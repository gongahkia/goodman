import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { getStorage } from '@shared/storage';
import { ProviderError } from '@shared/errors';
import type { TCGuardError } from '@shared/errors';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { CustomEndpointProvider } from './custom';

export async function getActiveProvider(): Promise<Result<LLMProvider, TCGuardError>> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) {
    return err(new ProviderError('Settings', 'Could not read settings'));
  }

  const settings = settingsResult.data;
  const providerName = settings.activeProvider;
  const config = settings.providers[providerName];

  if (!config) {
    return err(
      new ProviderError(
        providerName,
        'No LLM provider configured. Open TC Guard settings to add an API key.'
      )
    );
  }

  const provider = createProvider(providerName, config.apiKey, config.model, config.baseUrl);
  if (!provider) {
    return err(new ProviderError(providerName, 'Unknown provider'));
  }

  return ok(provider);
}

export function getAllProviders(): LLMProvider[] {
  return [
    new OpenAIProvider(''),
    new ClaudeProvider(''),
    new GeminiProvider(''),
    new OllamaProvider(),
    new CustomEndpointProvider(''),
  ];
}

export async function getProviderByName(
  name: string
): Promise<Result<LLMProvider, TCGuardError>> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) {
    return err(new ProviderError('Settings', 'Could not read settings'));
  }

  const config = settingsResult.data.providers[name];
  if (!config) {
    return err(
      new ProviderError(
        name,
        'No configuration found for this provider. Open TC Guard settings to configure it.'
      )
    );
  }

  const provider = createProvider(name, config.apiKey, config.model, config.baseUrl);
  if (!provider) {
    return err(new ProviderError(name, 'Unknown provider'));
  }

  return ok(provider);
}

export async function validateProvider(name: string): Promise<boolean> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return false;

  const config = settingsResult.data.providers[name];
  if (!config) return false;

  const provider = createProvider(name, config.apiKey, config.model, config.baseUrl);
  if (!provider) return false;

  return provider.validateApiKey(config.apiKey);
}

function createProvider(
  name: string,
  apiKey: string,
  _model: string,
  baseUrl?: string
): LLMProvider | null {
  switch (name) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'claude':
      return new ClaudeProvider(apiKey);
    case 'gemini':
      return new GeminiProvider(apiKey);
    case 'ollama':
      return new OllamaProvider(baseUrl);
    case 'custom':
      return new CustomEndpointProvider(baseUrl ?? '', apiKey);
    default:
      return null;
  }
}
