import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { getStorage } from '@shared/storage';
import { ProviderError } from '@shared/errors';
import type { TCGuardError } from '@shared/errors';
import { isProviderConfigured } from '@shared/provider-config';
import type { LLMProvider } from './types';
import type { Settings } from '@shared/messages';
import { OpenAIProvider } from './openai';
import { ClaudeProvider } from './claude';
import { GeminiProvider } from './gemini';
import { OllamaProvider } from './ollama';
import { CustomEndpointProvider } from './custom';
import { FixtureProvider } from './fixture';
import { HostedProvider } from './hosted';

export async function getActiveProvider(): Promise<Result<LLMProvider, TCGuardError>> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) {
    return err(new ProviderError('Settings', 'Could not read settings'));
  }

  const settings = settingsResult.data;
  const providerName = settings.activeProvider;
  const config = settings.providers[providerName];

  if (!config || !isProviderConfigured(providerName, config)) {
    return err(
      new ProviderError(
        providerName,
        'Missing provider configuration. Open Goodman settings to add the required credentials.'
      )
    );
  }
  const resolvedConfig = config;

  const provider = createProvider(
    providerName,
    resolvedConfig.apiKey,
    resolvedConfig.model,
    resolvedConfig.baseUrl
  );
  if (!provider) {
    return err(new ProviderError(providerName, 'Unknown provider'));
  }

  return ok(provider);
}

export function getAllProviders(): LLMProvider[] {
  return [
    new HostedProvider(),
    new OpenAIProvider(''),
    new ClaudeProvider(''),
    new GeminiProvider(''),
    new OllamaProvider(),
    new CustomEndpointProvider(''),
    new FixtureProvider(),
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
  if (!config || !isProviderConfigured(name as Settings['activeProvider'], config)) {
    return err(
      new ProviderError(
        name,
        'Missing provider configuration. Open Goodman settings to configure it.'
      )
    );
  }
  const resolvedConfig = config;

  const provider = createProvider(
    name,
    resolvedConfig.apiKey,
    resolvedConfig.model,
    resolvedConfig.baseUrl
  );
  if (!provider) {
    return err(new ProviderError(name, 'Unknown provider'));
  }

  return ok(provider);
}

export async function validateProvider(name: string): Promise<boolean> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return false;

  const config = settingsResult.data.providers[name];
  if (!config || !isProviderConfigured(name as Settings['activeProvider'], config)) {
    return false;
  }
  const resolvedConfig = config;

  const provider = createProvider(
    name,
    resolvedConfig.apiKey,
    resolvedConfig.model,
    resolvedConfig.baseUrl
  );
  if (!provider) return false;

  return provider.validateApiKey(resolvedConfig.apiKey);
}

function createProvider(
  name: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): LLMProvider | null {
  switch (name) {
    case 'hosted':
      return new HostedProvider(baseUrl, model);
    case 'openai':
      return new OpenAIProvider(apiKey, model);
    case 'claude':
      return new ClaudeProvider(apiKey, model);
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    case 'ollama':
      return new OllamaProvider(baseUrl, model);
    case 'custom':
      return new CustomEndpointProvider(baseUrl ?? '', apiKey, model);
    case 'fixture':
      return new FixtureProvider(model);
    default:
      return null;
  }
}
