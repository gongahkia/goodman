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
import { computeTextHash } from '@summarizer/cache';
import { createOverlay, removeOverlay } from '@content/ui/overlay';
import { getStorage } from '@shared/storage';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import type { Summary } from '@providers/types';

let analysisInFlight = false;
let rerunRequested = false;
let lastRenderedTextHash: string | null = null;
let lastRunResult: MessageResponse = { ok: true, data: [] };

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'DETECT_TC':
        return queueDetection(true);
      default:
        return undefined;
    }
  }
);

startObserver(() => {
  void queueDetection(false);
});
void queueDetection(false);

async function queueDetection(force: boolean): Promise<MessageResponse> {
  if (analysisInFlight) {
    rerunRequested = true;
    return lastRunResult;
  }

  analysisInFlight = true;

  try {
    lastRunResult = await handleDetectTC(force);
    return lastRunResult;
  } finally {
    analysisInFlight = false;
    if (rerunRequested) {
      rerunRequested = false;
      void queueDetection(false);
    }
  }
}

async function handleDetectTC(force: boolean): Promise<MessageResponse> {
  if (!document.body) {
    return { ok: false, error: 'Document body is unavailable' };
  }

  const settingsResult = await getStorage('settings');
  const sensitivity = settingsResult.ok
    ? settingsResult.data.detectionSensitivity
    : 'normal' as const;
  const themePreference = settingsResult.ok
    ? settingsResult.data.darkMode
    : 'auto';
  const providerName = settingsResult.ok
    ? settingsResult.data.activeProvider
    : 'openai';

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
    await savePageAnalysisState({
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
    await savePageAnalysisState({
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

async function savePageAnalysisState(
  record: Omit<PageAnalysisRecord, 'tabId' | 'url' | 'domain' | 'updatedAt'>
): Promise<void> {
  await sendToBackground({
    type: 'SAVE_PAGE_ANALYSIS',
    payload: {
      tabId: -1,
      ...record,
      url: window.location.href,
      domain: window.location.hostname,
      updatedAt: Date.now(),
    },
  });
}
