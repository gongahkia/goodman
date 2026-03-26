import { chunkText } from '../src/shared/chunker';
import { parseSummaryResponse } from '../src/providers/response-parser';
import { buildUserPrompt, SYSTEM_PROMPT } from '../src/providers/prompts';
import type { Summary, RedFlag } from '../src/providers/types';
import {
  InvalidResponseError,
  NetworkError,
  ProviderError,
  RateLimitError,
  ServiceUnavailableError,
  TCGuardError,
} from '../src/shared/errors';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
} from '../src/shared/constants';
import { computeSeverity } from '../src/summarizer/severity';
import { deduplicateRedFlagsBySeverity } from '../src/summarizer/red-flags';
import type { AnalysisSourceType, DetectionType } from '../src/shared/page-analysis';

const DEFAULT_UPSTREAM_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_CONCURRENT = 3;

export interface AnalyzeRequestBody {
  text: string;
  url: string;
  domain: string;
  sourceType: AnalysisSourceType;
  detectionType: DetectionType;
  clientVersion: string;
}

export interface AnalyzeSuccessPayload {
  summary: Summary;
  model: string;
}

export interface HostedServerConfig {
  upstreamApiKey: string;
  upstreamModel: string;
  upstreamUrl?: string;
  timeoutMs?: number;
}

export async function analyzeTerms(
  input: AnalyzeRequestBody,
  config: HostedServerConfig
): Promise<AnalyzeSuccessPayload> {
  const chunks = chunkText(input.text);
  const model = config.upstreamModel;

  if (chunks.length === 1) {
    const summary = await summarizeChunk(chunks[0] ?? input.text, config);
    return { summary, model };
  }

  const partials = await summarizeChunkBatch(chunks, config);
  const allRedFlags = deduplicateRedFlags(partials.flatMap((item) => item.redFlags));
  const allKeyPoints = deduplicateStrings(partials.flatMap((item) => item.keyPoints));
  const combinedSummary = partials.map((item) => item.summary).join(' ');

  const mergePrompt = `Merge these partial T&C summaries into a single cohesive 2-3 sentence summary:\n\n${combinedSummary}`;
  const merged = await requestUpstreamSummary(mergePrompt, config);

  return {
    model,
    summary: {
      summary: merged.summary,
      keyPoints: allKeyPoints.slice(0, 7),
      redFlags: allRedFlags,
      severity: computeSeverity(allRedFlags),
    },
  };
}

async function summarizeChunkBatch(
  chunks: string[],
  config: HostedServerConfig
): Promise<Summary[]> {
  const results: Summary[] = [];

  for (let i = 0; i < chunks.length; i += MAX_CONCURRENT) {
    const batch = chunks.slice(i, i + MAX_CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((chunk) => summarizeChunk(chunk, config))
    );
    results.push(...batchResults);
  }

  return results;
}

async function summarizeChunk(
  text: string,
  config: HostedServerConfig
): Promise<Summary> {
  const prompt = buildUserPrompt(text);
  return requestUpstreamSummary(prompt, config);
}

async function requestUpstreamSummary(
  prompt: string,
  config: HostedServerConfig
): Promise<Summary> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeoutMs ?? 10_000
  );

  try {
    const response = await fetch(config.upstreamUrl ?? DEFAULT_UPSTREAM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.upstreamApiKey}`,
      },
      body: JSON.stringify({
        model: config.upstreamModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: DEFAULT_MAX_TOKENS,
        temperature: DEFAULT_TEMPERATURE,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
      throw new RateLimitError('Goodman Cloud upstream', retryAfter);
    }

    if (response.status >= 500) {
      throw new ServiceUnavailableError(
        'Goodman Cloud upstream',
        `HTTP ${response.status}`
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        'Goodman Cloud upstream',
        `HTTP ${response.status}`
      );
    }

    const json = (await response.json()) as Record<string, unknown>;
    const content = extractOpenAIContent(json);
    if (!content) {
      throw new InvalidResponseError('No content in upstream response');
    }

    const parsed = parseSummaryResponse(content);
    if (!parsed.ok) {
      throw parsed.error;
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof TCGuardError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServiceUnavailableError(
        'Goodman Cloud upstream',
        'Timed out waiting for the hosted model.'
      );
    }

    throw new NetworkError('Goodman Cloud upstream');
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractOpenAIContent(json: Record<string, unknown>): string | null {
  const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
  if (!choices?.[0]) return null;
  const message = choices[0]['message'] as Record<string, unknown> | undefined;
  return (message?.['content'] as string) ?? null;
}

function deduplicateRedFlags(flags: RedFlag[]): RedFlag[] {
  return deduplicateRedFlagsBySeverity(flags);
}

function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.toLowerCase().trim();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}
