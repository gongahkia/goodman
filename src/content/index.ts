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
import { getStorage, setPageAnalysisByUrl } from '@shared/storage';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import type { Settings } from '@shared/messages';
import type { Summary } from '@providers/types';
import {
  getMissingProviderMessage,
  isProviderConfigured,
} from '@shared/provider-config';

let analysisInFlight = false;
let rerunRequested = false;
let lastRenderedTextHash: string | null = null;
let lastRunResult: MessageResponse = { ok: true, data: [] };

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'DETECT_TC':
        return queueDetection(true, msg.payload.settingsOverride);
      default:
        return undefined;
    }
  }
);

startObserver(() => {
  void queueDetection(false);
});
void queueDetection(false);

async function queueDetection(
  force: boolean,
  settingsOverride?: Partial<Settings>
): Promise<MessageResponse> {
  if (analysisInFlight) {
    rerunRequested = true;
    return lastRunResult;
  }

  analysisInFlight = true;

  try {
    lastRunResult = await handleDetectTC(force, settingsOverride);
    return lastRunResult;
  } finally {
    analysisInFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void queueDetection(false);
    }
  }
}

async function handleDetectTC(
  force: boolean,
  settingsOverride?: Partial<Settings>
): Promise<MessageResponse> {
  if (!document.body) {
    return { ok: false, error: 'Document body is unavailable' };
  }

  const settingsResult = await getStorage('settings');
  const settings = resolveSettings(
    settingsResult.ok ? settingsResult.data : null,
    settingsOverride
  );
  const sensitivity = settings?.detectionSensitivity ?? ('conservative' as const);
  const themePreference = settings?.darkMode ?? 'auto';
  const providerName = settings?.activeProvider ?? 'hosted';

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
    await persistPageAnalysisState({
      status: 'no_detection',
      sourceType: null,
      detectionType: null,
      confidence: null,
      textHash: null,
      summary: null,
      error: null,
    });
    return { ok: true, data: [] };
  }

  const best = scored[0]!;
  const resolvedText = await resolveDetectionTextSource(best);

  const normalized = normalizeText(resolvedText.text);
  if (normalized.text.length < 50) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistPageAnalysisState({
      status: 'extraction_failed',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash: null,
      summary: null,
      error: null,
    });
    return { ok: true, data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })) };
  }

  const textHash = await computeTextHash(normalized.text);
  if (!force && lastRenderedTextHash === textHash) {
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'hosted' && !settings?.hostedConsentAccepted) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistPageAnalysisState({
      status: 'needs_consent',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash,
      summary: null,
      error:
        'Accept the TC Guard Cloud privacy disclosure before hosted analysis can run.',
    });
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'hosted' && !isHostedProviderAvailable(settings)) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistPageAnalysisState({
      status: 'service_unavailable',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash,
      summary: null,
      error: getMissingProviderMessage(providerName),
    });
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName !== 'hosted' && !hasConfiguredProvider(settings)) {
    removeOverlay();
    lastRenderedTextHash = null;
    await persistPageAnalysisState({
      status: 'needs_provider',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash,
      summary: null,
      error: getMissingProviderMessage(providerName),
    });
    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

  if (providerName === 'fixture') {
    const summaryResult = await summarizeLocally(normalized.text, providerName);
    if (!summaryResult.ok) {
      lastRenderedTextHash = null;
      await persistPageAnalysisState({
        status: 'error',
        sourceType: resolvedText.sourceType,
        detectionType: best.type,
        confidence: best.weightedConfidence,
        textHash,
        summary: null,
        error: summaryResult.error ?? 'Summarization failed',
      });
      return { ok: false, error: summaryResult.error ?? 'Summarization failed' };
    }

    await persistPageAnalysisState({
      status: 'ready',
      sourceType: resolvedText.sourceType,
      detectionType: best.type,
      confidence: best.weightedConfidence,
      textHash,
      summary: summaryResult.data,
      error: null,
    });
    removeOverlay();
    createOverlay(best, summaryResult.data, themePreference);
    lastRenderedTextHash = textHash;

    return {
      ok: true,
      data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
    };
  }

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

  const result = summaryResponse as { ok: boolean; data?: Summary; error?: string };
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
  providerName: string
): Promise<{ ok: true; data: Summary } | { ok: false; error: string }> {
  const chunks = chunkText(text);
  const result =
    chunks.length > 1
      ? await chunkedSummarizeWithProvider(chunks, providerName)
      : await singleShotSummarizeWithProvider(text, providerName);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error.userMessage ?? result.error.message,
    };
  }

  return { ok: true, data: result.data };
}
