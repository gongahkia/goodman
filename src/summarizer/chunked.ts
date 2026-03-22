import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import { InvalidResponseError } from '@shared/errors';
import type { Summary, RedFlag } from '@providers/types';
import { singleShotSummarize } from './singleshot';
import { getActiveProvider } from '@providers/factory';
import { SYSTEM_PROMPT } from '@providers/prompts';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE } from '@shared/constants';
import { computeSeverity } from './severity';

const MAX_CONCURRENT = 3;

export async function chunkedSummarize(
  chunks: string[]
): Promise<Result<Summary, TCGuardError>> {
  if (chunks.length === 1) {
    return singleShotSummarize(chunks[0] ?? '');
  }

  const partials = await mapPhase(chunks);
  const errors = partials.filter((r) => !r.ok);
  if (errors.length === partials.length) {
    return err(
      new InvalidResponseError('All chunk summaries failed')
    );
  }

  const summaries = partials
    .filter((r): r is { ok: true; data: Summary } => r.ok)
    .map((r) => r.data);

  return reducePhase(summaries);
}

async function mapPhase(
  chunks: string[]
): Promise<Array<Result<Summary, TCGuardError>>> {
  const results: Array<Result<Summary, TCGuardError>> = [];

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((chunk) => singleShotSummarize(chunk))
    );
    results.push(...batchResults);
  }

  return results;
}

async function reducePhase(
  summaries: Summary[]
): Promise<Result<Summary, TCGuardError>> {
  const allRedFlags = deduplicateRedFlags(summaries.flatMap((s) => s.redFlags));
  const allKeyPoints = deduplicateStrings(summaries.flatMap((s) => s.keyPoints));
  const combinedSummary = summaries.map((s) => s.summary).join(' ');

  const mergePrompt = `Merge these partial T&C summaries into a single cohesive 2-3 sentence summary:\n\n${combinedSummary}`;

  const providerResult = await getActiveProvider();
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
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
  });

  if (mergeResult.ok) {
    return ok({
      summary: mergeResult.data.summary,
      keyPoints: allKeyPoints.slice(0, 7),
      redFlags: allRedFlags,
      severity: computeSeverity(allRedFlags),
    });
  }

  return ok({
    summary: combinedSummary,
    keyPoints: allKeyPoints.slice(0, 7),
    redFlags: allRedFlags,
    severity: computeSeverity(allRedFlags),
  });
}

function deduplicateRedFlags(flags: RedFlag[]): RedFlag[] {
  const seen = new Map<string, RedFlag>();
  for (const flag of flags) {
    const existing = seen.get(flag.category);
    if (!existing || flag.severity > existing.severity) {
      seen.set(flag.category, flag);
    }
  }
  return [...seen.values()];
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
