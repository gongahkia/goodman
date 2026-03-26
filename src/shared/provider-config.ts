import type { ProviderConfig, Settings } from './messages';

export function isProviderConfigured(
  providerName: Settings['activeProvider'],
  config: ProviderConfig | undefined
): boolean {
  if (!config) {
    return false;
  }

  switch (providerName) {
    case 'hosted':
      return (config.baseUrl ?? '').trim().length > 0;
    case 'openai':
    case 'claude':
    case 'gemini':
      return config.apiKey.trim().length > 0;
    case 'ollama':
      return (config.baseUrl ?? '').trim().length > 0;
    case 'custom':
      return (config.baseUrl ?? '').trim().length > 0;
    case 'fixture':
      return true;
    default:
      return false;
  }
}

export function getMissingProviderMessage(
  providerName: Settings['activeProvider']
): string {
  if (providerName === 'hosted') {
    return 'Goodman Cloud is unavailable right now. Please try again shortly.';
  }

  return `${providerName} is not configured. Open Goodman settings to add the required connection details.`;
}
