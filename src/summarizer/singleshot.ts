import { ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import type { Summary } from '@providers/types';
import { getActiveProvider, getProviderByName } from '@providers/factory';
import { SYSTEM_PROMPT, buildUserPrompt } from '@providers/prompts';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@shared/constants';

export async function singleShotSummarize(
  text: string
): Promise<Result<Summary, TCGuardError>> {
  const providerResult = await getActiveProvider();
  if (!providerResult.ok) return providerResult;

  const provider = providerResult.data;
  const userPrompt = buildUserPrompt(text);

  const result = await provider.summarize(userPrompt, {
    model: '',
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
  });

  if (!result.ok) return result;

  return ok(result.data);
}

export async function singleShotSummarizeWithProvider(
  text: string,
  providerName: string
): Promise<Result<Summary, TCGuardError>> {
  const providerResult = await getProviderByName(providerName);
  if (!providerResult.ok) return providerResult;

  const provider = providerResult.data;
  const userPrompt = buildUserPrompt(text);

  const result = await provider.summarize(userPrompt, {
    model: '',
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
  });

  if (!result.ok) return result;

  return ok(result.data);
}
