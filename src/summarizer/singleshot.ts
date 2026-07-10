import { ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import type { Summary } from '@providers/types';
import { getActiveProvider, getProviderByName } from '@providers/factory';
import { buildSystemPrompt, buildUserPrompt } from '@providers/prompts';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@shared/constants';
import type { SummarizeOptions } from '@providers/types';
import { getDomainPreferences } from '@shared/storage';

export async function singleShotSummarize(
  text: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  const providerResult = await getActiveProvider();
  if (!providerResult.ok) return providerResult;

  const provider = providerResult.data;
  const language = await getSummaryLanguage(metadata);
  const userPrompt = buildUserPrompt(text, language);

  const result = await provider.summarize(userPrompt, {
    model: '',
    systemPrompt: buildSystemPrompt(language),
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
    signal,
    rawText: text,
    metadata,
  });

  if (!result.ok) return result;

  return ok(result.data);
}

export async function singleShotSummarizeWithProvider(
  text: string,
  providerName: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  const providerResult = await getProviderByName(providerName);
  if (!providerResult.ok) return providerResult;

  const provider = providerResult.data;
  const language = await getSummaryLanguage(metadata);
  const userPrompt = buildUserPrompt(text, language);

  const result = await provider.summarize(userPrompt, {
    model: '',
    systemPrompt: buildSystemPrompt(language),
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
    signal,
    rawText: text,
    metadata,
  });

  if (!result.ok) return result;

  return ok(result.data);
}

async function getSummaryLanguage(metadata?: SummarizeOptions['metadata']): Promise<string> {
  if (!metadata?.domain) return '';
  const preferences = await getDomainPreferences(metadata.domain);
  return preferences.summaryLanguage;
}
