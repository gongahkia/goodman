import { chunkText } from '@content/extractors/chunker';
import { getProviderByName } from '@providers/factory';
import type { Summary, SummarizeOptions } from '@providers/types';
import {
  isCancelledError,
  sleepWithAbort,
  throwIfAborted,
} from '@shared/cancellation';
import { MAX_INPUT_TEXT_LENGTH } from '@shared/constants';
import { CancelledError, type TCGuardError } from '@shared/errors';
import { appendProgressLog } from '@shared/analysis-progress';
import type {
  AnalysisSourceType,
  DetectionType,
  PageAnalysisLogEntry,
  PageAnalysisLogLevel,
  PageAnalysisRecord,
} from '@shared/page-analysis';
import {
  getPageAnalysis,
  getPageAnalysisByUrl,
  setPageAnalysisRecord,
  type StoredSummary,
} from '@shared/storage';
import { cacheSummary, computeTextHash, getCachedSummary } from '@summarizer/cache';
import { chunkedSummarizeWithProvider } from '@summarizer/chunked';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { syncVersionHistory } from './version-tracking';

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
  cancelled?: boolean;
}

const MAX_CONCURRENT_LLM = 2;
let activeLlmRequests = 0;
const llmQueue: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
}> = [];
const activeAnalysisControllers = new Map<number, AbortController>();

async function withLlmLimit<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (activeLlmRequests >= MAX_CONCURRENT_LLM) {
    await waitForLlmSlot(signal);
  }

  throwIfAborted(signal);
  activeLlmRequests++;
  try {
    return await fn();
  } finally {
    activeLlmRequests--;
    releaseLlmSlot();
  }
}

export async function cancelPageAnalysis(tabId: number): Promise<boolean> {
  const controller = activeAnalysisControllers.get(tabId);
  if (controller) {
    controller.abort();
  }

  const record = await getPageAnalysis(tabId);
  if (!record || record.status !== 'analyzing') {
    return Boolean(controller);
  }

  const progressPercent =
    typeof record.progressPercent === 'number' ? record.progressPercent : 0;
  const progressLogs = appendProgressLog(
    record.progressLogs ?? [],
    'Analysis was cancelled before completion.',
    progressPercent,
    'warning'
  );

  await setPageAnalysisRecord({
    ...record,
    status: 'cancelled',
    summary: null,
    error: null,
    progressLabel: 'Cancelled',
    progressPercent,
    progressLogs,
    updatedAt: Date.now(),
  });

  return true;
}

export async function processPageAnalysis(
  input: ProcessPageAnalysisInput
): Promise<ProcessPageAnalysisResult> {
  activeAnalysisControllers.get(input.tabId)?.abort();
  const controller = new AbortController();
  activeAnalysisControllers.set(input.tabId, controller);
  const signal = controller.signal;

  if (input.text.length > MAX_INPUT_TEXT_LENGTH) {
    console.warn(
      '[Goodman] input text truncated from',
      input.text.length,
      'to',
      MAX_INPUT_TEXT_LENGTH
    );
    input.text = input.text.slice(0, MAX_INPUT_TEXT_LENGTH);
  }

  let textHash: string | null = null;
  const existingRecord = await getPageAnalysisByUrl(input.url);
  let progressLogs: PageAnalysisLogEntry[] = existingRecord?.progressLogs ?? [];

  const persistAnalysisUpdate = async (
    overrides: {
      status: PageAnalysisRecord['status'];
      textHash: string | null;
      summary: Summary | null;
      error: string | null;
    },
    progressPercent: number,
    progressLabel: string,
    logMessage: string,
    level: PageAnalysisLogLevel = 'info'
  ): Promise<void> => {
    throwIfAborted(signal);
    progressLogs = appendProgressLog(progressLogs, logMessage, progressPercent, level);
    await setPageAnalysisRecord(
      buildPageAnalysisRecord(input, {
        ...overrides,
        progressPercent,
        progressLabel,
        progressLogs,
      })
    );
  };

  try {
    textHash = await computeTextHash(input.text);
    throwIfAborted(signal);

    await persistAnalysisUpdate(
      {
        status: 'analyzing',
        textHash,
        summary: null,
        error: null,
      },
      72,
      'Checking cache',
      'Computed a text fingerprint and started checking the local summary cache.'
    );

    const cachedSummary = await getCachedSummary(textHash);
    throwIfAborted(signal);
    if (cachedSummary) {
      const summary = toSummary(cachedSummary.summary);
      await persistAnalysisUpdate(
        {
          status: 'analyzing',
          textHash,
          summary: null,
          error: null,
        },
        88,
        'Cache hit',
        'Loaded a cached summary and started syncing version history.',
        'success'
      );
      await syncVersionHistory(input.domain, input.text, summary);
      throwIfAborted(signal);
      await persistAnalysisUpdate(
        {
          status: 'ready',
          textHash,
          summary,
          error: null,
        },
        100,
        'Summary ready',
        'Cached analysis is ready to review.',
        'success'
      );

      return { ok: true, data: summary };
    }

    const providerResult = await getProviderByName(input.provider);
    throwIfAborted(signal);
    if (!providerResult.ok) {
      const errorMessage =
        providerResult.error.userMessage ?? providerResult.error.message;
      const status =
        input.provider === 'hosted' ? 'service_unavailable' : 'needs_provider';

      await persistAnalysisUpdate(
        {
          status,
          textHash,
          summary: null,
          error: errorMessage,
        },
        100,
        status === 'needs_provider'
          ? 'Provider setup required'
          : 'Hosted analysis unavailable',
        errorMessage,
        status === 'needs_provider' ? 'warning' : 'error'
      );

      return { ok: false, error: errorMessage };
    }

    const chunks = chunkText(input.text);
    const summarizeMetadata = buildSummarizeMetadata(input);
    if (activeLlmRequests >= MAX_CONCURRENT_LLM) {
      await persistAnalysisUpdate(
        {
          status: 'analyzing',
          textHash,
          summary: null,
          error: null,
        },
        78,
        'Waiting for worker slot',
        'Waiting for an available summarization worker slot.'
      );
    }

    await persistAnalysisUpdate(
      {
        status: 'analyzing',
        textHash,
        summary: null,
        error: null,
      },
      chunks.length > 1 ? 82 : 84,
      chunks.length > 1 ? 'Summarizing in chunks' : 'Requesting summary',
      chunks.length > 1
        ? `Started summarizing the document in ${chunks.length} chunks.`
        : 'Started requesting a summary from the configured provider.'
    );

    const runSummarize = () =>
      withLlmLimit(async () => {
        try {
          chrome.alarms?.create('analysis-heartbeat', { delayInMinutes: 0.45 });
        } catch {
          // noop
        }

        const result =
          input.provider === 'hosted'
            ? await singleShotSummarizeWithProvider(
                input.text,
                input.provider,
                summarizeMetadata,
                signal
              )
            : chunks.length > 1
              ? await chunkedSummarizeWithProvider(
                  chunks,
                  input.provider,
                  summarizeMetadata,
                  signal
                )
              : await singleShotSummarizeWithProvider(
                  input.text,
                  input.provider,
                  summarizeMetadata,
                  signal
                );

        try {
          chrome.alarms?.clear('analysis-heartbeat');
        } catch {
          // noop
        }
        return result;
      }, signal);

    let summaryResult = await runSummarize();
    if (!summaryResult.ok && summaryResult.error.retryable) {
      const delayMs =
        'retryAfterSeconds' in summaryResult.error
          ? Math.min(
              (summaryResult.error as { retryAfterSeconds: number }).retryAfterSeconds *
                1000,
              5_000
            )
          : 2000;
      await persistAnalysisUpdate(
        {
          status: 'analyzing',
          textHash,
          summary: null,
          error: null,
        },
        88,
        'Retry scheduled',
        `Temporary provider error detected. Retrying in ${Math.ceil(delayMs / 1000)}s.`,
        'warning'
      );
      await sleepWithAbort(delayMs, signal);
      summaryResult = await runSummarize();
    }

    if (!summaryResult.ok) {
      if (summaryResult.error.code === 'CANCELLED') {
        throw new CancelledError();
      }

      const errorMessage =
        summaryResult.error.userMessage ?? summaryResult.error.message;
      const status =
        input.provider === 'hosted' && isHostedServiceError(summaryResult.error)
          ? 'service_unavailable'
          : 'error';

      await persistAnalysisUpdate(
        {
          status,
          textHash,
          summary: null,
          error: errorMessage,
        },
        100,
        'Analysis failed',
        errorMessage,
        'error'
      );

      return { ok: false, error: errorMessage };
    }

    await persistAnalysisUpdate(
      {
        status: 'analyzing',
        textHash,
        summary: null,
        error: null,
      },
      94,
      'Saving results',
      'Summary received. Caching the result and syncing version history.'
    );
    await cacheSummary(textHash, summaryResult.data, input.domain);
    throwIfAborted(signal);
    await syncVersionHistory(input.domain, input.text, summaryResult.data);
    throwIfAborted(signal);
    await persistAnalysisUpdate(
      {
        status: 'ready',
        textHash,
        summary: summaryResult.data,
        error: null,
      },
      100,
      'Summary ready',
      'Analysis complete. Summary, cache, and version history are up to date.',
      'success'
    );

    return { ok: true, data: summaryResult.data };
  } catch (error) {
    if (isCancelledError(error) || signal.aborted) {
      await persistCancelledUpdate(input, textHash, progressLogs);
      return {
        ok: false,
        error: 'Analysis cancelled.',
        cancelled: true,
      };
    }

    throw error;
  } finally {
    if (activeAnalysisControllers.get(input.tabId) === controller) {
      activeAnalysisControllers.delete(input.tabId);
    }
  }
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
    progressPercent?: number | null;
    progressLabel?: string | null;
    progressLogs?: PageAnalysisLogEntry[];
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
    progressPercent: overrides.progressPercent ?? null,
    progressLabel: overrides.progressLabel ?? null,
    progressLogs: overrides.progressLogs ?? [],
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

async function waitForLlmSlot(signal?: AbortSignal): Promise<void> {
  if (activeLlmRequests < MAX_CONCURRENT_LLM) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }

    const entry = {
      resolve: () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
      reject,
      signal,
    };

    const onAbort = (): void => {
      const index = llmQueue.indexOf(entry);
      if (index >= 0) {
        llmQueue.splice(index, 1);
      }
      reject(new CancelledError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    llmQueue.push(entry);
  });
}

function releaseLlmSlot(): void {
  while (llmQueue.length > 0) {
    const next = llmQueue.shift();
    if (!next) {
      return;
    }

    if (next.signal?.aborted) {
      next.reject(new CancelledError());
      continue;
    }

    next.resolve();
    return;
  }
}

async function persistCancelledUpdate(
  input: ProcessPageAnalysisInput,
  textHash: string | null,
  progressLogs: PageAnalysisLogEntry[]
): Promise<void> {
  const progressPercent = progressLogs[progressLogs.length - 1]?.progress ?? 0;
  const cancelledLogs = appendProgressLog(
    progressLogs,
    'Analysis was cancelled before completion.',
    progressPercent,
    'warning'
  );
  await setPageAnalysisRecord(
    buildPageAnalysisRecord(input, {
      status: 'cancelled',
      textHash,
      summary: null,
      error: null,
      progressPercent,
      progressLabel: 'Cancelled',
      progressLogs: cancelledLogs,
    })
  );
}
