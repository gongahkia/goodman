import { onMessage, sendToBackground } from '@shared/messaging';
import type { Message, MessageResponse } from '@shared/messages';
import type { Runtime } from 'webextension-polyfill';
import { detectCheckboxes } from '@content/detectors/checkbox';
import { detectModals } from '@content/detectors/modal';
import { detectFullPageTC } from '@content/detectors/fullpage';
import { startObserver } from '@content/detectors/observer';
import { scoreDetections } from '@content/detectors/scoring';
import { resolveDetectionTextSource } from '@content/extractors/source';
import { normalizeText } from '@content/extractors/normalizer';
import { chunkText } from '@content/extractors/chunker';
import { computeTextHash } from '@summarizer/cache';
import { chunkedSummarizeWithProvider } from '@summarizer/chunked';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { createOverlay, removeOverlay } from '@content/ui/overlay';
import {
  getPageAnalysisByUrl,
  getStorage,
  setPageAnalysisByUrl,
} from '@shared/storage';
import type {
  PageAnalysisLogEntry,
  PageAnalysisLogLevel,
  PageAnalysisRecord,
} from '@shared/page-analysis';
import type { Settings } from '@shared/messages';
import type { Summary } from '@providers/types';
import {
  getMissingProviderMessage,
  isProviderConfigured,
} from '@shared/provider-config';
import { MIN_OBSERVER_INTERVAL_MS } from '@shared/constants';
import { appendProgressLog } from '@shared/analysis-progress';
import { isCancelledError, throwIfAborted } from '@shared/cancellation';

let analysisInFlight = false;
let rerunRequested = false;
let lastRenderedTextHash: string | null = null;
let lastRunResult: MessageResponse = { ok: true, data: [] };
let lastObserverDetectionTs = 0;
let currentAnalysisController: AbortController | null = null;

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'DETECT_TC':
        return queueDetection(true, msg.payload.settingsOverride);
      case 'CANCEL_TC':
        return cancelCurrentAnalysis();
      default:
        return undefined;
    }
  }
);

startObserver(() => {
  const now = Date.now();
  if (now - lastObserverDetectionTs < MIN_OBSERVER_INTERVAL_MS) return;
  lastObserverDetectionTs = now;
  void queueDetection(false);
});
void queueDetection(false);

let lastUrl = location.href;
function checkUrlChange(): void {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    lastRenderedTextHash = null;
    void queueDetection(true);
  }
}
window.addEventListener('popstate', checkUrlChange);
const origPushState = history.pushState.bind(history);
const origReplaceState = history.replaceState.bind(history);
history.pushState = (...args: Parameters<typeof history.pushState>) => { origPushState(...args); checkUrlChange(); };
history.replaceState = (...args: Parameters<typeof history.replaceState>) => { origReplaceState(...args); checkUrlChange(); };

async function queueDetection(
  force: boolean,
  settingsOverride?: Partial<Settings>
): Promise<MessageResponse> {
  if (analysisInFlight) {
    rerunRequested = true;
    return lastRunResult;
  }

  analysisInFlight = true;
  const controller = new AbortController();
  currentAnalysisController = controller;

  try {
    lastRunResult = await handleDetectTC(force, settingsOverride, controller.signal);
    return lastRunResult;
  } catch (error) {
    if (isCancelledError(error) || controller.signal.aborted) {
      lastRunResult = { ok: true, data: [] };
      return lastRunResult;
    }

    lastRunResult = { ok: false, error: 'Could not analyze this page.' };
    return lastRunResult;
  } finally {
    if (currentAnalysisController === controller) {
      currentAnalysisController = null;
    }
    analysisInFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void queueDetection(false);
    }
  }
}

async function handleDetectTC(
  force: boolean,
  settingsOverride?: Partial<Settings>,
  signal?: AbortSignal
): Promise<MessageResponse> {
  throwIfAborted(signal);

  if (!document.body) {
    return { ok: false, error: 'Document body is unavailable' };
  }

  const blacklistResult = await getStorage('domainBlacklist');
  throwIfAborted(signal);
  if (blacklistResult.ok && blacklistResult.data.includes(window.location.hostname)) {
    return { ok: true, data: [] };
  }

  const settingsResult = await getStorage('settings');
  throwIfAborted(signal);
  const settings = resolveSettings(
    settingsResult.ok ? settingsResult.data : null,
    settingsOverride
  );
  const sensitivity = settings?.detectionSensitivity ?? ('conservative' as const);
  const themePreference = settings?.darkMode ?? 'auto';
  const providerName = settings?.activeProvider ?? 'hosted';
  const analysisState: Omit<PageAnalysisRecord, 'tabId' | 'url' | 'domain' | 'updatedAt'> = {
    status: 'analyzing',
    sourceType: null,
    detectionType: null,
    confidence: null,
    textHash: null,
    summary: null,
    error: null,
    progressPercent: 0,
    progressLabel: null,
    progressLogs: [],
  };
  let progressLogs: PageAnalysisLogEntry[] = [];

  const persistStage = async (
    updates: Partial<typeof analysisState>,
    progressPercent: number,
    progressLabel: string,
    logMessage: string,
    level: PageAnalysisLogLevel = 'info'
  ): Promise<void> => {
    throwIfAborted(signal);
    progressLogs = appendProgressLog(progressLogs, logMessage, progressPercent, level);
    Object.assign(analysisState, updates, {
      progressPercent,
      progressLabel,
      progressLogs,
    });
    await persistPageAnalysisState(analysisState);
  };

  if (force) {
    await persistStage(
      {},
      5,
      'Scanning page',
      'Scanning the page for likely terms and consent surfaces.'
    );
  }

  const detections = [
    ...detectCheckboxes(document.body),
    ...detectModals(document.body),
  ];

  const fullPage = detectFullPageTC(document.body);
  if (fullPage) detections.push(fullPage);

  const scored = scoreDetections(detections, sensitivity);

  if (scored.length === 0) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistStage(
      {
        status: 'no_detection',
        sourceType: null,
        detectionType: null,
        confidence: null,
        textHash: null,
        summary: null,
        error: null,
      },
      100,
      'No qualifying terms detected',
      'No qualifying Terms or Conditions surface was detected on this page.'
    );
    return { ok: true, data: [] };
  }

  const best = scored[0]!;
  if (force) {
    await persistStage(
      {
        status: 'analyzing',
        detectionType: best.type,
        confidence: best.weightedConfidence,
      },
      18,
      'Candidate found',
      'Detected a likely Terms or Conditions surface on the page.'
    );
    await persistStage(
      {
        status: 'analyzing',
        detectionType: best.type,
        confidence: best.weightedConfidence,
      },
      30,
      'Extracting terms',
      'Extracting the legal text from the detected surface.'
    );
  }
  const resolvedText = await resolveDetectionTextSource(best);
  throwIfAborted(signal);

  const normalized = normalizeText(resolvedText.text);
  if (force) {
    await persistStage(
      {
        status: 'analyzing',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
      },
      45,
      'Cleaning text',
      `Extracted ${resolvedText.sourceType} text and normalized it for analysis.`
    );
  }
  if (normalized.text.length < 50) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistStage(
      {
        status: 'extraction_failed',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash: null,
        summary: null,
        error: null,
      },
      100,
      'Extraction failed',
      'Detected a likely terms surface, but the extracted text was too short to analyze.',
      'warning'
    );
    return { ok: true, data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })) };
  }

  const textHash = await computeTextHash(normalized.text);
  throwIfAborted(signal);
  if (force) {
    await persistStage(
      {
        status: 'analyzing',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
      },
      58,
      'Preparing request',
      'Prepared a clean text fingerprint and started validating the analysis request.'
    );
  }
  if (!force && lastRenderedTextHash === textHash) {
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'hosted' && !settings?.hostedConsentAccepted) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistStage(
      {
        status: 'needs_consent',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
        summary: null,
        error:
          'Accept the Goodman Cloud privacy disclosure before hosted analysis can run.',
      },
      100,
      'Waiting for consent',
      'Hosted analysis is blocked until you accept the Goodman Cloud privacy disclosure.',
      'warning'
    );
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'hosted' && !isHostedProviderAvailable(settings)) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistStage(
      {
        status: 'service_unavailable',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
        summary: null,
        error: getMissingProviderMessage(providerName),
      },
      100,
      'Hosted analysis unavailable',
      'The hosted analysis service is not configured or reachable right now.',
      'warning'
    );
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName !== 'hosted' && !hasConfiguredProvider(settings)) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistStage(
      {
        status: 'needs_provider',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
        summary: null,
        error: getMissingProviderMessage(providerName),
      },
      100,
      'Provider setup required',
      'Analysis is blocked until the selected provider is configured in Settings.',
      'warning'
    );
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'fixture') {
    await persistStage(
      {
        status: 'analyzing',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
      },
      72,
      'Running local summarizer',
      'Running the local fixture summarizer for this page.'
    );
    const summaryResult = await summarizeLocally(normalized.text, providerName, signal);
    throwIfAborted(signal);
    if (!summaryResult.ok) {
      lastRenderedTextHash = null;
      await persistStage(
        {
          status: 'error',
          sourceType: resolvedText.sourceType,
          detectionType: best.type,
          confidence: best.weightedConfidence,
          textHash,
          summary: null,
          error: summaryResult.error ?? 'Summarization failed',
        },
        100,
        'Analysis failed',
        summaryResult.error ?? 'Local summarization failed.',
        'error'
      );
      return { ok: false, error: summaryResult.error ?? 'Summarization failed' };
    }

    await persistStage(
      {
        status: 'ready',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
        summary: summaryResult.data,
        error: null,
      },
      100,
      'Summary ready',
      'Local analysis finished and the summary is ready.',
      'success'
    );
    removeOverlay();
    createOverlay(best, summaryResult.data, themePreference);
    lastRenderedTextHash = textHash;

    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  await persistStage(
    {
      status: 'analyzing',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash,
      summary: null,
      error: null,
    },
    65,
    'Sending to background worker',
    'Handing off the prepared text to the background worker for summarization.'
  );

  const summaryResponse = await sendToBackground({
    type: 'PROCESS_PAGE_ANALYSIS',
    payload: {
      text: normalized.text,
      provider: providerName,
      url: window.location.href,
      domain: window.location.hostname,
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
    },
  });
  throwIfAborted(signal);

  const result = summaryResponse as {
    ok: boolean;
    data?: Summary;
    error?: string;
    cancelled?: boolean;
  };
  if (result.cancelled) {
    lastRenderedTextHash = null;
    return { ok: true, data: [] };
  }

  if (!result.ok || !result.data) {
    lastRenderedTextHash = null;
    return { ok: false, error: result.error ?? 'Summarization failed' };
  }

  removeOverlay();
  createOverlay(best, result.data, themePreference);
  lastRenderedTextHash = textHash;

  return {
    ok: true,
    data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
  };
}

async function persistPageAnalysisState(
  record: Omit<PageAnalysisRecord, 'tabId' | 'url' | 'domain' | 'updatedAt'>
): Promise<void> {
  await setPageAnalysisByUrl(window.location.href, {
    tabId: -1,
    ...record,
    url: window.location.href,
    domain: window.location.hostname,
    updatedAt: Date.now(),
  });
}

function hasConfiguredProvider(settings: Settings | null): boolean {
  if (!settings) {
    return false;
  }

  return isProviderConfigured(
    settings.activeProvider,
    settings.providers[settings.activeProvider]
  );
}

function isHostedProviderAvailable(settings: Settings | null): boolean {
  if (!settings) {
    return false;
  }

  return isProviderConfigured('hosted', settings.providers['hosted']);
}

function resolveSettings(
  settings: Settings | null,
  settingsOverride?: Partial<Settings>
): Settings | null {
  if (!settings && !settingsOverride) {
    return null;
  }

  if (!settings) {
    return settingsOverride as Settings;
  }

  if (!settingsOverride) {
    return settings;
  }

  return {
    ...settings,
    ...settingsOverride,
    providers: settingsOverride.providers
      ? {
          ...settings.providers,
          ...settingsOverride.providers,
        }
      : settings.providers,
  };
}

async function summarizeLocally(
  text: string,
  providerName: string,
  signal?: AbortSignal
): Promise<{ ok: true; data: Summary } | { ok: false; error: string }> {
  throwIfAborted(signal);
  const chunks = chunkText(text);
  const result =
    chunks.length > 1
      ? await chunkedSummarizeWithProvider(chunks, providerName, undefined, signal)
      : await singleShotSummarizeWithProvider(text, providerName, undefined, signal);

  throwIfAborted(signal);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error.userMessage ?? result.error.message,
    };
  }

  return { ok: true, data: result.data };
}

async function cancelCurrentAnalysis(): Promise<MessageResponse> {
  rerunRequested = false;
  currentAnalysisController?.abort();
  removeOverlay();
  lastRenderedTextHash = null;
  await persistCancelledPageAnalysisState();
  return { ok: true, data: null };
}

async function persistCancelledPageAnalysisState(): Promise<void> {
  const existing = await getPageAnalysisByUrl(window.location.href);
  const progressPercent =
    typeof existing?.progressPercent === 'number' ? existing.progressPercent : 0;
  const progressLogs = appendProgressLog(
    existing?.progressLogs ?? [],
    'Analysis was cancelled before completion.',
    progressPercent,
    'warning'
  );

  await setPageAnalysisByUrl(window.location.href, {
    tabId: existing?.tabId ?? -1,
    url: window.location.href,
    domain: window.location.hostname,
    status: 'cancelled',
    sourceType: existing?.sourceType ?? null,
    detectionType: existing?.detectionType ?? null,
    confidence: existing?.confidence ?? null,
    textHash: existing?.textHash ?? null,
    summary: null,
    error: null,
    progressPercent,
    progressLabel: 'Cancelled',
    progressLogs,
    updatedAt: Date.now(),
  });
}
