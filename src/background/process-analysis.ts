import { chunkText } from '@shared/chunker';
import { resolveAnalysisContext } from '@summarizer/context';
import type { Summary, SummarizeOptions } from '@providers/types';
import { isCancelledError, sleepWithAbort, throwIfAborted } from '@shared/cancellation';
import { MAX_INPUT_TEXT_LENGTH } from '@shared/constants';
import { CancelledError } from '@shared/errors';
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
const activeAnalysisUrls = new Map<number, string>();

async function withLlmLimit<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
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

export async function cancelPageAnalysis(tabId: number, expectedUrl?: string): Promise<boolean> {
  const controller = activeAnalysisControllers.get(tabId);
  if (controller && expectedUrl && activeAnalysisUrls.get(tabId) !== expectedUrl) return false;
  if (controller) {
    controller.abort();
  }

  const record = await getPageAnalysis(tabId);
  if (
    activeAnalysisControllers.get(tabId) !== controller ||
    (expectedUrl && record?.url !== expectedUrl)
  )
    return Boolean(controller);
  if (!record || record.status !== 'analyzing') {
    return Boolean(controller);
  }

  const progressPercent = typeof record.progressPercent === 'number' ? record.progressPercent : 0;
  const progressLogs = appendProgressLog(
    record.progressLogs ?? [],
    'Analysis was cancelled before completion.',
    progressPercent,
    'warning'
  );

  const saved = await setPageAnalysisRecord(
    {
      ...record,
      status: 'cancelled',
      summary: null,
      error: null,
      progressLabel: 'Cancelled',
      progressPercent,
      progressLogs,
      updatedAt: Date.now(),
    },
    () => activeAnalysisControllers.get(tabId) === controller
  );

  return saved.ok;
}

export function discardPageAnalysis(tabId: number): void {
  activeAnalysisControllers.get(tabId)?.abort();
  activeAnalysisControllers.delete(tabId);
  activeAnalysisUrls.delete(tabId);
}

export async function processPageAnalysis(
  input: ProcessPageAnalysisInput
): Promise<ProcessPageAnalysisResult> {
  activeAnalysisControllers.get(input.tabId)?.abort();
  const controller = new AbortController();
  activeAnalysisControllers.set(input.tabId, controller);
  activeAnalysisUrls.set(input.tabId, input.url);
  const signal = controller.signal;

  let textHash: string | null = null;
  let progressLogs: PageAnalysisLogEntry[] = [];

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
    const saved = await setPageAnalysisRecord(
      buildPageAnalysisRecord(input, {
        ...overrides,
        progressPercent,
        progressLabel,
        progressLogs,
      }),
      () => activeAnalysisControllers.get(input.tabId) === controller && !signal.aborted
    );
    if (!saved.ok) throw saved.error;
  };

  try {
    if (input.text.length > MAX_INPUT_TEXT_LENGTH) {
      const error = `The agreement exceeds the ${MAX_INPUT_TEXT_LENGTH}-character analysis limit. Open the original; no partial summary was requested.`;
      await persistAnalysisUpdate(
        { status: 'error', textHash: null, summary: null, error },
        100,
        'Agreement too large',
        error,
        'error'
      );
      return { ok: false, error };
    }
    const existingRecord = await getPageAnalysisByUrl(input.url);
    progressLogs = existingRecord?.progressLogs ?? [];
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

    console.warn(`[Goodman:bg] resolving provider: ${input.provider}`);
    const providerResult = await resolveAnalysisContext(input.provider, input.domain);
    throwIfAborted(signal);
    console.warn(
      `[Goodman:bg] provider resolved: ok=${providerResult.ok}${providerResult.ok ? '' : ` error=${providerResult.error.message}`}`
    );
    if (!providerResult.ok) {
      const errorMessage = providerResult.error.userMessage ?? providerResult.error.message;

      await persistAnalysisUpdate(
        {
          status: 'needs_provider',
          textHash,
          summary: null,
          error: errorMessage,
        },
        100,
        'Provider setup required',
        errorMessage,
        'warning'
      );

      return { ok: false, error: errorMessage };
    }

    const context = providerResult.data;

    const cachedSummary = await getCachedSummary(textHash, input.domain, context.cacheHash);
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
        } catch (e) {
          console.warn('[Goodman] failed to create analysis heartbeat alarm:', e);
        }

        const result =
          chunks.length > 1
            ? await chunkedSummarizeWithProvider(
                chunks,
                input.provider,
                summarizeMetadata,
                signal,
                context
              )
            : await singleShotSummarizeWithProvider(
                input.text,
                input.provider,
                summarizeMetadata,
                signal,
                context
              );

        try {
          chrome.alarms?.clear('analysis-heartbeat');
        } catch (e) {
          console.warn('[Goodman] failed to clear analysis heartbeat alarm:', e);
        }
        return result;
      }, signal);

    console.warn('[Goodman:bg] calling configured LLM provider');
    let summaryResult = await runSummarize();
    console.warn(
      `[Goodman:bg] LLM result: ok=${summaryResult.ok}${summaryResult.ok ? '' : ` code=${summaryResult.error.code} msg=${summaryResult.error.message}`}`
    );
    if (!summaryResult.ok && summaryResult.error.retryable) {
      const delayMs =
        'retryAfterSeconds' in summaryResult.error
          ? Math.min(
              (summaryResult.error as { retryAfterSeconds: number }).retryAfterSeconds * 1000,
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

      const errorMessage = summaryResult.error.userMessage ?? summaryResult.error.message;
      await persistAnalysisUpdate(
        {
          status: 'error',
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
    await cacheSummary(textHash, summaryResult.data, input.domain, context.cacheHash);
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
      if (activeAnalysisControllers.get(input.tabId) === controller) {
        await persistCancelledUpdate(
          input,
          textHash,
          progressLogs,
          () => activeAnalysisControllers.get(input.tabId) === controller
        );
      }
      return {
        ok: false,
        error: 'Analysis cancelled.',
        cancelled: true,
      };
    }

    const message = 'Could not finish or save this analysis. Check extension storage and retry.';
    if (activeAnalysisControllers.get(input.tabId) === controller) {
      await setPageAnalysisRecord(
        buildPageAnalysisRecord(input, {
          status: 'error',
          textHash,
          summary: null,
          error: message,
          progressPercent: 100,
          progressLabel: 'Analysis failed',
          progressLogs,
        }),
        () => activeAnalysisControllers.get(input.tabId) === controller
      );
    }
    return { ok: false, error: message };
  } finally {
    if (activeAnalysisControllers.get(input.tabId) === controller) {
      activeAnalysisControllers.delete(input.tabId);
      activeAnalysisUrls.delete(input.tabId);
    }
  }
}

function buildSummarizeMetadata(input: ProcessPageAnalysisInput): SummarizeOptions['metadata'] {
  return {
    url: input.url,
    domain: input.domain,
    sourceType: input.sourceType,
    detectionType: input.detectionType,
    clientVersion: chrome.runtime?.getManifest?.().version ?? 'unknown',
  };
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
    ...(summary.tldr ? { tldr: summary.tldr } : {}),
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
  progressLogs: PageAnalysisLogEntry[],
  isCurrent: () => boolean
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
    }),
    isCurrent
  );
}
