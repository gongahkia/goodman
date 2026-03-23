import { chunkText } from '@content/extractors/chunker';
import { getProviderByName } from '@providers/factory';
import type { Summary } from '@providers/types';
import type {
  AnalysisSourceType,
  DetectionType,
  PageAnalysisRecord,
} from '@shared/page-analysis';
import type { StoredSummary } from '@shared/storage';
import { cacheSummary, computeTextHash, getCachedSummary } from '@summarizer/cache';
import { chunkedSummarizeWithProvider } from '@summarizer/chunked';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { setPageAnalysisRecord } from '@shared/storage';
import { syncVersionHistory } from './version-tracking';
import type { SummarizeOptions } from '@providers/types';
import type { TCGuardError } from '@shared/errors';

export interface ProcessPageAnalysisInput {
  tabId: number;
  url: string;
  domain: string;
  text: string;
  provider: string;
  sourceType: AnalysisSourceType;
  detectionType: DetectionType;
  confidence: number;
}

interface ProcessPageAnalysisResult {
  ok: boolean;
  data?: Summary;
  error?: string;
}

export async function processPageAnalysis(
  input: ProcessPageAnalysisInput
): Promise<ProcessPageAnalysisResult> {
  const textHash = await computeTextHash(input.text);

  await setPageAnalysisRecord(
    buildPageAnalysisRecord(input, {
      status: 'analyzing',
      textHash,
      summary: null,
      error: null,
    })
  );

  const cachedSummary = await getCachedSummary(textHash);
  if (cachedSummary) {
    const summary = toSummary(cachedSummary.summary);
    await syncVersionHistory(input.domain, input.text, summary);
    await setPageAnalysisRecord(
      buildPageAnalysisRecord(input, {
        status: 'ready',
        textHash,
        summary,
        error: null,
      })
    );

    return { ok: true, data: summary };
  }

  const providerResult = await getProviderByName(input.provider);
  if (!providerResult.ok) {
    const errorMessage =
      providerResult.error.userMessage ?? providerResult.error.message;
    const status = input.provider === 'hosted'
      ? 'service_unavailable'
      : 'needs_provider';

    await setPageAnalysisRecord(
      buildPageAnalysisRecord(input, {
        status,
        textHash,
        summary: null,
        error: errorMessage,
      })
    );

    return { ok: false, error: errorMessage };
  }

  const chunks = chunkText(input.text);
  const summarizeMetadata = buildSummarizeMetadata(input);
  const summaryResult =
    input.provider === 'hosted'
      ? await singleShotSummarizeWithProvider(
          input.text,
          input.provider,
          summarizeMetadata
        )
      : chunks.length > 1
        ? await chunkedSummarizeWithProvider(
            chunks,
            input.provider,
            summarizeMetadata
          )
        : await singleShotSummarizeWithProvider(
            input.text,
            input.provider,
            summarizeMetadata
          );

  if (!summaryResult.ok) {
    const errorMessage =
      summaryResult.error.userMessage ?? summaryResult.error.message;
    const status =
      input.provider === 'hosted' && isHostedServiceError(summaryResult.error)
        ? 'service_unavailable'
        : 'error';

    await setPageAnalysisRecord(
      buildPageAnalysisRecord(input, {
        status,
        textHash,
        summary: null,
        error: errorMessage,
      })
    );

    return { ok: false, error: errorMessage };
  }

  await cacheSummary(textHash, summaryResult.data, input.domain);
  await syncVersionHistory(input.domain, input.text, summaryResult.data);
  await setPageAnalysisRecord(
    buildPageAnalysisRecord(input, {
      status: 'ready',
      textHash,
      summary: summaryResult.data,
      error: null,
    })
  );

  return { ok: true, data: summaryResult.data };
}

function buildSummarizeMetadata(
  input: ProcessPageAnalysisInput
): SummarizeOptions['metadata'] {
  return {
    url: input.url,
    domain: input.domain,
    sourceType: input.sourceType,
    detectionType: input.detectionType,
    clientVersion: chrome.runtime?.getManifest?.().version ?? 'unknown',
  };
}

function isHostedServiceError(error: TCGuardError): boolean {
  return (
    error.code === 'NETWORK_ERROR' ||
    error.code === 'RATE_LIMIT' ||
    error.code === 'SERVICE_UNAVAILABLE'
  );
}

function buildPageAnalysisRecord(
  input: ProcessPageAnalysisInput,
  overrides: {
    status: PageAnalysisRecord['status'];
    textHash: string | null;
    summary: Summary | null;
    error: string | null;
  }
): PageAnalysisRecord {
  return {
    tabId: input.tabId,
    url: input.url,
    domain: input.domain,
    status: overrides.status,
    sourceType: input.sourceType,
    detectionType: input.detectionType,
    confidence: input.confidence,
    textHash: overrides.textHash,
    summary: overrides.summary,
    error: overrides.error,
    updatedAt: Date.now(),
  };
}

function toSummary(summary: StoredSummary): Summary {
  return {
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    redFlags: summary.redFlags.map((flag) => ({
      ...flag,
      category: flag.category as Summary['redFlags'][number]['category'],
    })),
    severity: summary.severity,
  };
}
