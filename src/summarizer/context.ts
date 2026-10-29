import { getProviderByName } from '@providers/factory';
import { buildSystemPrompt, buildUserPrompt } from '@providers/prompts';
import type { LLMProvider } from '@providers/types';
import {
  DEFAULT_CHUNK_MAX_TOKENS,
  DEFAULT_CHUNK_OVERLAP_TOKENS,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '@shared/constants';
import { ProviderError } from '@shared/errors';
import { getDomainPreferences, getStorage } from '@shared/storage';
import { err, ok } from '@shared/result';
import { computeTextHash } from './cache';

export interface AnalysisContext {
  provider: LLMProvider;
  language: string;
  cacheHash: string;
}

// Capture once: queued requests, map batches, merges and retries must use the same connection.
export async function resolveAnalysisContext(providerName: string, domain: string) {
  const settings = await getStorage('settings');
  if (!settings.ok) return err(new ProviderError('Settings', 'Could not read settings'));
  const storedConfig = settings.data.providers[providerName];
  if (!storedConfig) return err(new ProviderError(providerName, 'Missing provider configuration'));
  const config = { ...storedConfig };
  const provider = await getProviderByName(providerName, config);
  if (!provider.ok) return provider;
  const { summaryLanguage: language } = await getDomainPreferences(domain);
  // Only the fingerprint is cached; credentials and endpoint remain in the existing settings store.
  const cacheHash = await computeTextHash(
    JSON.stringify({
      pipeline: 'grounded-documents-v2',
      extensionVersion: chrome.runtime.getManifest().version,
      providerName,
      config,
      language,
      systemPrompt: buildSystemPrompt(language),
      userPrompt: buildUserPrompt('', language),
      maxTokens: DEFAULT_MAX_TOKENS,
      temperature: DEFAULT_TEMPERATURE,
      chunkTokens: DEFAULT_CHUNK_MAX_TOKENS,
      chunkOverlap: DEFAULT_CHUNK_OVERLAP_TOKENS,
    })
  );
  return ok({ provider: provider.data, language, cacheHash } satisfies AnalysisContext);
}
