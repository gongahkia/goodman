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

  return provider.validateApiKey(sanitizeCredential(resolvedConfig.apiKey));
}

function sanitizeCredential(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '').trim(); // strip non-ASCII, trim whitespace
}

function createProvider(
  name: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): LLMProvider | null {
  const cleanKey = sanitizeCredential(apiKey);
  const cleanModel = sanitizeCredential(model);
  const cleanUrl = baseUrl ? sanitizeCredential(baseUrl) : undefined;
  switch (name) {
    case 'hosted':
      return new HostedProvider(cleanUrl, cleanModel);
    case 'openai':
      return new OpenAIProvider(cleanKey, cleanModel);
    case 'claude':
      return new ClaudeProvider(cleanKey, cleanModel);
    case 'gemini':
      return new GeminiProvider(cleanKey, cleanModel);
    case 'ollama':
      return new OllamaProvider(cleanUrl, cleanModel);
    case 'custom':
      return new CustomEndpointProvider(cleanUrl ?? '', cleanKey, cleanModel);
    case 'fixture':
      return new FixtureProvider(cleanModel);
    default:
      return null;
  }
}
