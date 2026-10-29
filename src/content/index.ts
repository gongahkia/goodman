import { onMessage, sendToBackground } from '@shared/messaging';
import type { ManualAnalysisInput, MessageResponse, Settings } from '@shared/messages';
import { detectCheckboxes } from './detectors/checkbox';
import { detectModals } from './detectors/modal';
import { detectImplicitConsent } from './detectors/implicit';
import { detectFullPageTC } from './detectors/fullpage';
import { getDetectionRoots } from './detectors/roots';
import { isLegalText } from './detectors/signals';
import { startObserver, stopObserver } from './detectors/observer';
import { scoreDetections, type ScoredDetection } from './detectors/scoring';
import { resolveDetectionTextSource } from './extractors/source';
import { extractElementText } from './extractors/dom-text';
import { normalizeExtractedText } from './extractors/normalizer';
import { createOverlay, removeOverlay, createSummaryChip, removeSummaryChip } from './ui/overlay';
import { renderConsentWarningBadge, removeConsentWarningBadge } from './ui/consent-warning';
import { DEFAULT_SETTINGS, getStorage, getDomainPreferences } from '@shared/storage';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import { createDocument, type AgreementDocument } from '@shared/documents';
import { isProviderConfigured } from '@shared/provider-config';
import { MIN_OBSERVER_INTERVAL_MS, MAX_INPUT_TEXT_LENGTH } from '@shared/constants';
import { computeTextHash } from '@summarizer/cache';
import { throwIfAborted, waitWithAbort } from '@shared/cancellation';
import type { Summary } from '@providers/types';

type Request = { explicit: boolean; input?: ManualAnalysisInput; settings?: Partial<Settings> };
let controller: AbortController | null = null;
let pending: Request | null = null;
let paused = false;
let observerActive = false;
let observerTimer: ReturnType<typeof setTimeout> | undefined;
let lastScan = 0;
let lastSignature = '';
let lastSignatureAt = 0;
let currentUrl = location.href;
let state: PageAnalysisRecord | null = null;

onMessage((msg) => {
  if (msg.type === 'DETECT_TC')
    return queue({ explicit: true, settings: msg.payload.settingsOverride });
  if (msg.type === 'MANUAL_ANALYSIS') return queue({ explicit: true, input: msg.payload });
  if (msg.type === 'CANCEL_TC') {
    if (msg.payload.expectedUrl && msg.payload.expectedUrl !== currentUrl && window === window.top)
      return Promise.resolve({ ok: true });
    paused = true;
    pending = null;
    controller?.abort();
    clearSurfaces();
    return save({ status: 'cancelled', summary: null, error: null, progressLabel: 'Cancelled' });
  }
  return undefined;
});

function clearSurfaces(): void {
  removeOverlay();
  removeSummaryChip();
  removeConsentWarningBadge();
}

async function save(patch: Partial<PageAnalysisRecord>): Promise<MessageResponse> {
  if (!state) return { ok: true };
  state = { ...state, ...patch, updatedAt: Date.now() };
  return sendToBackground({ type: 'SAVE_PAGE_ANALYSIS', payload: state });
}

function observe(): void {
  if (observerActive || !document.body) return;
  observerActive = true;
  startObserver(() => {
    checkNavigation();
    if (paused || observerTimer || document.hidden) return;
    observerTimer = setTimeout(
      () => {
        observerTimer = undefined;
        void queue({ explicit: false });
      },
      Math.max(0, MIN_OBSERVER_INTERVAL_MS - (Date.now() - lastScan))
    );
  });
}

async function queue(request: Request): Promise<MessageResponse> {
  if (request.explicit) paused = false;
  if (paused && !request.explicit) return { ok: true };
  if (controller) {
    if (request.explicit) {
      pending = request;
      controller.abort();
    }
    return { ok: true };
  }
  const runController = new AbortController();
  controller = runController;
  try {
    return await run(request, runController.signal);
  } catch (error) {
    if (runController.signal.aborted) return { ok: true };
    const message = error instanceof Error ? error.message : 'Could not analyze this agreement.';
    await save({
      status: 'error',
      summary: null,
      error: message,
      progressPercent: 100,
      progressLabel: 'Analysis failed',
    });
    return { ok: false, error: message };
  } finally {
    if (controller === runController) controller = null;
    if (pending) {
      const next = pending;
      pending = null;
      void queue(next);
    }
  }
}

function discover(detections: ScoredDetection[]): AgreementDocument[] {
  const found = new Map<string, AgreementDocument>();
  for (const detection of detections) {
    const container =
      detection.type === 'fullpage'
        ? null
        : (detection.element.closest('label,form') ?? detection.element.parentElement);
    const links = [...(container?.querySelectorAll<HTMLAnchorElement>('a[href]') ?? [])].filter(
      (link) => isLegalText(link.textContent + ' ' + link.href)
    );
    const urls = [
      ...(detection.nearestLink ? [{ url: detection.nearestLink, title: '' }] : []),
      ...links.map((link) => ({ url: link.href, title: link.textContent ?? '' })),
    ];
    if (!urls.length)
      urls.push({
        url: location.href,
        title: detection.type === 'fullpage' ? document.title : 'Consent text on this page',
      });
    for (const item of urls) {
      try {
        const doc = createDocument(
          new URL(item.url, location.href).href,
          item.title,
          urls.length && (detection.nearestLink || links.length)
            ? ''
            : document.documentElement.lang,
          !detection.nearestLink && !links.length && detection.type !== 'fullpage'
        );
        found.set(doc.id, doc);
      } catch {
        /* Invalid links are never fetched. */
      }
    }
  }
  return [...found.values()].slice(0, 20);
}

async function run(request: Request, signal: AbortSignal): Promise<MessageResponse> {
  if (!document.body)
    return { ok: false, error: 'This page is not ready. Try again after it loads.' };
  const pageUrl = location.href;
  signal.addEventListener(
    'abort',
    () => {
      void sendToBackground({
        type: 'CANCEL_PAGE_ANALYSIS',
        payload: { tabId: -1, expectedUrl: pageUrl },
      }).catch(() => {});
    },
    { once: true }
  );
  const domain = location.hostname;
  const [settingsResult, blacklist, preferences] = await Promise.all([
    getStorage('settings'),
    getStorage('domainBlacklist'),
    getDomainPreferences(domain),
  ]);
  throwIfAborted(signal);
  const settings = {
    ...(settingsResult.ok ? settingsResult.data : DEFAULT_SETTINGS),
    ...request.settings,
  };
  if (!request.explicit && blacklist.ok && blacklist.data.includes(domain)) {
    stopObserver();
    observerActive = false;
    clearSurfaces();
    return { ok: true };
  }
  observe();
  lastScan = Date.now();
  const detections = getDetectionRoots(document.body).flatMap((root) => [
    ...detectCheckboxes(root),
    ...detectModals(root),
    ...detectImplicitConsent(root),
  ]);
  const fullpage = detectFullPageTC(document.body);
  if (fullpage) detections.push(fullpage);
  const scored = scoreDetections(detections, settings.detectionSensitivity);
  let best = scored[0];
  const availableDocuments = discover(scored);
  const manual = request.input;
  const selectedText =
    manual?.text ?? (manual?.useSelection ? window.getSelection()?.toString() : undefined);
  if (manual?.useSelection && !selectedText?.trim())
    throw new Error('Select text on the page first, or paste it into Goodman.');
  if (manual?.url) {
    const url = new URL(manual.url, pageUrl).href;
    createDocument(url); // Validate before extraction.
    best = {
      element: document.body,
      type: 'fullpage',
      confidence: 1,
      weightedConfidence: 1,
      keywords: [],
      nearestLink: url,
    };
  } else if (selectedText || (!best && request.explicit)) {
    best = {
      element: document.querySelector<HTMLElement>('main,article,[role="main"]') ?? document.body,
      type: 'fullpage',
      confidence: 1,
      weightedConfidence: 1,
      keywords: [],
      nearestLink: null,
    };
  }
  if (!best) {
    clearSurfaces();
    lastSignature = '';
    state = emptyState(pageUrl, domain);
    return save({
      status: 'no_detection',
      progressPercent: 100,
      progressLabel: 'No agreement detected',
    });
  }
  const signature = JSON.stringify([
    best.type,
    best.nearestLink,
    best.element.textContent?.slice(0, MAX_INPUT_TEXT_LENGTH),
    settings.activeProvider,
    settings.analysisMode,
    preferences.analysisMode,
  ]);
  if (!request.explicit && signature === lastSignature && Date.now() - lastSignatureAt < 60_000)
    return { ok: true };
  lastSignature = signature;
  lastSignatureAt = Date.now();
  let inferred = createDocument(
    new URL(best.nearestLink ?? pageUrl, pageUrl).href,
    best.nearestLink ? '' : document.title,
    best.nearestLink ? '' : document.documentElement.lang,
    Boolean(selectedText) || (!best.nearestLink && best.type !== 'fullpage')
  );
  if (inferred.kind !== 'selection')
    inferred =
      availableDocuments.find((doc) => doc.url === inferred.url && doc.kind !== 'selection') ??
      inferred;
  if (!availableDocuments.some((doc) => doc.id === inferred.id))
    availableDocuments.unshift(inferred);
  state = {
    ...emptyState(pageUrl, domain),
    document: inferred,
    availableDocuments: availableDocuments.slice(0, 20),
    detectionType: manual || !scored.length ? 'manual' : best.type,
    confidence: manual || !scored.length ? null : best.weightedConfidence,
    sourceType: best.nearestLink
      ? /\.pdf(?:[?#]|$)/i.test(best.nearestLink)
        ? 'pdf'
        : 'linked'
      : 'inline',
  };
  await renderConsentWarningBadge(best, null, domain, settings.darkMode, signal);
  throwIfAborted(signal);
  const mode =
    preferences.analysisMode && preferences.analysisMode !== 'inherit'
      ? preferences.analysisMode
      : settings.analysisMode;
  const configured = isProviderConfigured(
    settings.activeProvider,
    settings.providers[settings.activeProvider]
  );
  if (!configured || (!request.explicit && (mode !== 'automatic' || window !== window.top))) {
    const status = configured ? 'needs_consent' : 'needs_provider';
    const label =
      mode === 'detect_only'
        ? 'Detected locally. Analyze once to send this agreement to your provider.'
        : 'Ready to review. Analysis sends the selected agreement to your configured provider.';
    await save({ status, progressLabel: label, progressPercent: 0 });
    createSummaryChip(
      best,
      `${availableDocuments.length} agreement${availableDocuments.length === 1 ? '' : 's'} · Review`,
      () => {
        if (configured) void queue({ explicit: true });
        else
          void sendToBackground({
            type: 'OPEN_WORKSPACE_SURFACE',
            payload: { route: 'providers' },
          });
      }
    );
    return { ok: true };
  }
  await save({
    status: 'analyzing',
    progressPercent: 10,
    progressLabel: 'Reading the selected agreement',
    error: null,
  });
  createSummaryChip(best, 'Reading agreement…', () => {});
  let text: string;
  let sourceDocument = inferred;
  try {
    if (selectedText) text = selectedText;
    else if (manual || !scored.length) {
      if (manual?.url) {
        const resolved = await waitWithAbort(resolveDetectionTextSource(best), signal);
        text = resolved.text;
        sourceDocument = resolved.document;
        state.sourceType = resolved.sourceType;
      } else text = extractElementText(best.element);
    } else {
      const resolved = await waitWithAbort(resolveDetectionTextSource(best), signal);
      text = resolved.text;
      sourceDocument = resolved.document;
      state.sourceType = resolved.sourceType;
    }
    text = normalizeExtractedText(text).text;
    if (text.length < 50)
      throw new Error(
        'Not enough text was found. Open the original agreement or paste its text into Goodman.'
      );
    if (text.length > MAX_INPUT_TEXT_LENGTH)
      throw new Error(
        'This agreement exceeds the analysis size limit. No partial summary was requested.'
      );
  } catch (error) {
    throwIfAborted(signal);
    const message = error instanceof Error ? error.message : 'Could not read this agreement.';
    await save({ status: 'extraction_failed', error: message, progressPercent: 100 });
    createSummaryChip(best, 'Could not read agreement · Retry', () => {
      void queue({ explicit: true, input: manual });
    });
    return { ok: false, error: message };
  }
  throwIfAborted(signal);
  state.document = sourceDocument;
  // Redirects replace their requested source, preserving the actual document identity.
  state.availableDocuments = [
    ...new Map(
      availableDocuments.map((doc) => {
        const item =
          doc.id === inferred.id ||
          (sourceDocument.kind !== 'selection' &&
            doc.url === inferred.url &&
            doc.kind !== 'selection')
            ? sourceDocument
            : doc;
        return [item.id, item] as const;
      })
    ).values(),
  ];
  const textHash = await computeTextHash(text);
  await save({
    status: 'analyzing',
    textHash,
    progressPercent: 45,
    progressLabel: 'Preparing analysis',
  });
  const response = (await waitWithAbort(
    sendToBackground({
      type: 'PROCESS_PAGE_ANALYSIS',
      payload: {
        text,
        provider: settings.activeProvider,
        url: pageUrl,
        domain,
        sourceType: state.sourceType!,
        detectionType: state.detectionType!,
        confidence: state.confidence ?? 0,
        document: sourceDocument,
        availableDocuments: state.availableDocuments,
        userInitiated: request.explicit,
      },
    }),
    signal
  )) as { ok: boolean; data?: Summary; error?: string };
  throwIfAborted(signal);
  if (!response.ok || !response.data) {
    createSummaryChip(best, 'Analysis unavailable · Retry', () => {
      void queue({ explicit: true, input: manual });
    });
    return response;
  }
  state.summary = response.data;
  state.status = 'ready';
  const summary = response.data;
  createSummaryChip(
    best,
    `${summary.redFlags.length} concern${summary.redFlags.length === 1 ? '' : 's'} · Review`,
    () => createOverlay(best!, summary, settings.darkMode, sourceDocument)
  );
  return { ok: true, data: summary };
}

function emptyState(url: string, domain: string): PageAnalysisRecord {
  return {
    tabId: -1,
    url,
    domain,
    status: 'idle',
    sourceType: null,
    detectionType: null,
    confidence: null,
    textHash: null,
    summary: null,
    error: null,
    progressLogs: [],
    updatedAt: Date.now(),
  };
}

function checkNavigation(): void {
  if (location.href === currentUrl) return;
  const previousUrl = currentUrl;
  currentUrl = location.href;
  controller?.abort();
  pending = controller ? { explicit: false } : null;
  paused = false;
  lastSignature = '';
  state = null;
  clearSurfaces();
  void sendToBackground({
    type: 'CANCEL_PAGE_ANALYSIS',
    payload: { tabId: -1, expectedUrl: previousUrl },
  });
  void queue({ explicit: false });
}

let navigationTimer: ReturnType<typeof setInterval> | undefined;
function resume(): void {
  clearInterval(navigationTimer);
  if (!document.hidden) {
    navigationTimer = setInterval(checkNavigation, 1000);
    checkNavigation();
    observe();
    void queue({ explicit: false });
  }
}
window.addEventListener('popstate', checkNavigation);
window.addEventListener('hashchange', checkNavigation);
window.addEventListener('pageshow', resume);
document.addEventListener('visibilitychange', resume);
window.addEventListener('pagehide', () => {
  clearInterval(navigationTimer);
  clearTimeout(observerTimer);
  observerTimer = undefined;
  stopObserver();
  observerActive = false;
  controller?.abort();
  pending = null;
  void sendToBackground({
    type: 'CANCEL_PAGE_ANALYSIS',
    payload: { tabId: -1, expectedUrl: currentUrl },
  }).catch(() => {});
});
chrome.storage.onChanged?.addListener((changes, area) => {
  if (
    (area === 'local' && ('settings' in changes || 'domainBlacklist' in changes)) ||
    ((area === 'sync' || area === 'local') && 'domainPreferences' in changes)
  ) {
    lastSignature = '';
    controller?.abort();
    pending = { explicit: false };
    if (!controller) {
      pending = null;
      void queue({ explicit: false });
    }
  }
});
resume();
