import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import { CancelledError, InvalidResponseError } from '@shared/errors';
import type { Summary, RedFlag } from '@providers/types';
import { singleShotSummarize, singleShotSummarizeWithProvider } from './singleshot';
import { getActiveProvider, getProviderByName } from '@providers/factory';
import { buildSystemPrompt } from '@providers/prompts';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@shared/constants';
import { computeSeverity } from './severity';
import type { SummarizeOptions } from '@providers/types';
import { deduplicateRedFlagsBySeverity } from './red-flags';
import { throwIfAborted } from '@shared/cancellation';
import { getDomainPreferences } from '@shared/storage';

const MAX_CONCURRENT = 3;

export async function chunkedSummarize(
  chunks: string[],
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  return chunkedSummarizeInternal(chunks, undefined, metadata, signal);
}

export async function chunkedSummarizeWithProvider(
  chunks: string[],
  providerName: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  return chunkedSummarizeInternal(chunks, providerName, metadata, signal);
}

async function chunkedSummarizeInternal(
  chunks: string[],
  providerName?: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  throwIfAborted(signal);

  if (chunks.length === 1) {
    return providerName
      ? singleShotSummarizeWithProvider(chunks[0] ?? '', providerName, metadata, signal)
      : singleShotSummarize(chunks[0] ?? '', metadata, signal);
  }

  const partials = await mapPhase(chunks, providerName, metadata, signal);
  throwIfAborted(signal);
  const errors = partials.filter((r) => !r.ok);
  if (errors.some((result) => !result.ok && result.error.code === 'CANCELLED')) {
    return err(new CancelledError());
  }
  if (errors.length === partials.length) {
    return err(
      new InvalidResponseError('All chunk summaries failed')
    );
  }

  const summaries = partials
    .filter((r): r is { ok: true; data: Summary } => r.ok)
    .map((r) => r.data);

  return reducePhase(summaries, providerName, metadata, signal);
}

async function mapPhase(
  chunks: string[],
  providerName?: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Array<Result<Summary, TCGuardError>>> {
  const results: Array<Result<Summary, TCGuardError>> = [];

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
    throwIfAborted(signal);
    const batch = chunks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((chunk) =>
        providerName
          ? singleShotSummarizeWithProvider(chunk, providerName, metadata, signal)
          : singleShotSummarize(chunk, metadata, signal)
      )
    );
    results.push(...batchResults);
  }

  return results;
}

async function reducePhase(
  summaries: Summary[],
  providerName?: string,
  metadata?: SummarizeOptions['metadata'],
  signal?: AbortSignal
): Promise<Result<Summary, TCGuardError>> {
  throwIfAborted(signal);
  const contradictionFlags = detectContradictions(summaries);
  const allRedFlags = deduplicateRedFlags([
    ...summaries.flatMap((s) => s.redFlags),
    ...contradictionFlags,
  ]);
  const allKeyPoints = deduplicateStrings(summaries.flatMap((s) => s.keyPoints));
  const combinedSummary = summaries.map((s) => s.summary).join(' ');

  const language = await getSummaryLanguage(metadata);
  const mergePrompt = `Merge these partial T&C summaries into a single cohesive 2-3 sentence summary${language ? ` in ${language}` : ''}:\n\n${combinedSummary}`;

  const providerResult = providerName
    ? await getProviderByName(providerName)
    : await getActiveProvider();
  if (!providerResult.ok) {
    return ok({
      summary: combinedSummary,
      keyPoints: allKeyPoints,
      redFlags: allRedFlags,
      severity: computeSeverity(allRedFlags),
    });
  }

  const mergeResult = await providerResult.data.summarize(mergePrompt, {
    model: '',
    systemPrompt: buildSystemPrompt(language),
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
    signal,
    rawText: mergePrompt,
  });

  if (mergeResult.ok) {
    return ok({
      summary: mergeResult.data.summary,
      keyPoints: allKeyPoints.slice(0, 7),
      redFlags: allRedFlags,
      severity: computeSeverity(allRedFlags),
    });
  }

  if (mergeResult.error.code === 'CANCELLED') {
    return err(mergeResult.error);
  }

  return ok({
    summary: combinedSummary,
    keyPoints: allKeyPoints.slice(0, 7),
    redFlags: allRedFlags,
    severity: computeSeverity(allRedFlags),
  });
}

async function getSummaryLanguage(metadata?: SummarizeOptions['metadata']): Promise<string> {
  if (!metadata?.domain) return '';
  const preferences = await getDomainPreferences(metadata.domain);
  return preferences.summaryLanguage;
}

function deduplicateRedFlags(flags: RedFlag[]): RedFlag[] {
  return deduplicateRedFlagsBySeverity(flags);
}

function detectContradictions(summaries: Summary[]): RedFlag[] {
  const texts = summaries.map(summary =>
    [
      summary.summary,
      ...summary.keyPoints,
      ...summary.redFlags.flatMap(flag => [flag.description, flag.quote]),
    ].join(' ').toLowerCase()
  );

  const sharesData = texts.some(text =>
    /\b(may|can|will|reserve the right to)\b[^.]{0,80}\b(share|sell|disclose)\b[^.]{0,80}\bdata\b/.test(text) ||
    /\bdata\b[^.]{0,80}\b(may be|is|will be)\b[^.]{0,80}\b(shared|sold|disclosed)\b/.test(text)
  );
  const deniesDataSharing = texts.some(text =>
    /\b(never|do not|does not|will not|won't|no)\b[^.]{0,80}\b(share|sell|disclose|data sharing)\b/.test(text)
  );

  if (!sharesData || !deniesDataSharing) return [];

  return [{
    category: 'third_party_sharing',
    description: 'Chunk summaries disagree about whether user data may be shared.',
    severity: 'medium',
    quote: '',
  }];
}

function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.toLowerCase().trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
