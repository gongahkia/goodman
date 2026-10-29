import '@shared/sw-shim'; // must be first — shims DOM globals before crxjs-bundled content script code runs
import { onMessage } from '@shared/messaging';
import type {
  Message,
  MessageResponse,
  OpenWorkspaceSurfaceMessage,
  ProcessPageAnalysisMessage,
  Settings,
} from '@shared/messages';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import {
  getPageAnalysis,
  getStorage,
  prunePageAnalysisState,
  removePageAnalysis,
  runMigrations,
  setPageAnalysisRecord,
  setStorage,
  getPageAnalysisByUrl,
  getDomainPreferences,
  withStorageLock,
} from '@shared/storage';
// chrome.runtime.MessageSender replaced with chrome.runtime.MessageSender
import { cancelPageAnalysis, discardPageAnalysis, processPageAnalysis } from './process-analysis';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { pruneCache } from '@summarizer/cache';
import { fetchBounded } from '@shared/network';
import { MAX_INPUT_TEXT_LENGTH } from '@shared/constants';
import { setTextRetention } from '@versioning/schema';
import { handleParsePdf } from './parse-pdf';
import { normalizeDocument, mergeDocuments } from '@shared/documents';

registerTabCleanup();
registerKeepAlive();
registerActionLauncher();
registerReviewActions();
void runMigrations()
  .then(() => {
    void prunePageAnalysisState().catch((e) =>
      console.warn('[Goodman] prune page analysis failed:', e)
    );
    void pruneCache().catch((e) => console.warn('[Goodman] prune cache failed:', e));
  })
  .catch((e) => console.error('[Goodman] migrations failed:', e));

onMessage(
  (msg: Message, sender: chrome.runtime.MessageSender): Promise<MessageResponse> | undefined => {
    console.warn(
      `[Goodman:bg] received message: ${msg.type} from tab ${sender.tab?.id ?? 'unknown'}`
    );
    switch (msg.type) {
      case 'FETCH_URL':
        return handleFetchUrl(msg.payload.url, msg.payload.responseType);
      case 'PARSE_PDF':
        return handleParsePdf(msg.payload);
      case 'GET_SETTINGS':
        return handleGetSettings();
      case 'SAVE_SETTINGS':
        return handleSaveSettings(msg.payload);
      case 'GET_PAGE_ANALYSIS':
        return handleGetPageAnalysis(msg.payload.tabId);
      case 'OPEN_WORKSPACE_SURFACE':
        return handleOpenWorkspaceSurface(msg.payload);
      case 'CANCEL_PAGE_ANALYSIS':
        return cancelFromSender(sender, msg.payload);
      case 'SAVE_PAGE_ANALYSIS':
        return handleSavePageAnalysis(msg.payload, sender);
      case 'PROCESS_PAGE_ANALYSIS':
        return handleProcessPageAnalysis(msg.payload, sender);
      case 'SUMMARIZE':
        return handleSummarize(msg.payload);
      case 'SET_TEXT_RETENTION':
        return handleSetTextRetention(msg.payload, sender);
      default:
        return undefined;
    }
  }
);

async function handleSetTextRetention(
  payload: { domain: string; enabled: boolean },
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  if (
    !sender.url?.startsWith(chrome.runtime.getURL('')) ||
    !payload ||
    typeof payload.domain !== 'string' ||
    typeof payload.enabled !== 'boolean'
  ) {
    return { ok: false, error: 'Change saved agreement text from Goodman settings.' };
  }
  await setTextRetention(payload.domain, payload.enabled);
  return { ok: true, data: null };
}

async function handleFetchUrl(
  url: string,
  responseType: 'text' | 'base64' | 'document' = 'text'
): Promise<MessageResponse> {
  try {
    const response = await fetchBounded(url, {}, { timeoutMs: 10_000, maxBytes: 8 * 1024 * 1024 });
    if (!response.ok) {
      return { ok: false, error: `Failed to fetch URL: HTTP ${response.status}` };
    }

    if (responseType === 'base64' || responseType === 'document') {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (responseType === 'document')
        return {
          ok: true,
          data: {
            body: bytesToBase64(bytes),
            contentType: response.headers.get('content-type') ?? '',
            url: response.url || url,
          },
        };
      return { ok: true, data: bytesToBase64(bytes) };
    }

    const html = await response.text();
    return { ok: true, data: html };
  } catch (e) {
    console.error('[Goodman] fetch failed:', url, e);
    return { ok: false, error: 'Failed to fetch URL' };
  }
}

async function handleGetSettings(): Promise<MessageResponse> {
  const result = await getStorage('settings');
  if (!result.ok) {
    return { ok: false, error: 'Could not load settings' };
  }

  return { ok: true, data: result.data };
}

async function handleSaveSettings(settings: Settings): Promise<MessageResponse> {
  if (
    !settings ||
    typeof settings !== 'object' ||
    !settings.providers ||
    typeof settings.providers !== 'object'
  ) {
    return { ok: false, error: 'Invalid settings' };
  }
  const result = await setStorage('settings', settings);
  if (!result.ok) {
    return { ok: false, error: 'Could not save settings' };
  }

  return { ok: true, data: null };
}

async function handleGetPageAnalysis(tabId: number): Promise<MessageResponse> {
  const analysis = await getPageAnalysis(tabId);
  return { ok: true, data: analysis };
}

async function handleOpenWorkspaceSurface(
  payload: OpenWorkspaceSurfaceMessage['payload']
): Promise<MessageResponse> {
  const opened = await openWorkspaceSurface(payload);
  if (!opened) {
    return { ok: false, error: 'Could not open workspace surface' };
  }

  return { ok: true, data: null };
}

async function handleCancelPageAnalysis(
  tabId: number,
  expectedUrl?: string
): Promise<MessageResponse> {
  const cancelled = await cancelPageAnalysis(tabId, expectedUrl);
  return { ok: true, data: { cancelled } };
}

async function handleSavePageAnalysis(
  record: PageAnalysisRecord,
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  const tabId = resolveTabId(record.tabId, sender);
  if (tabId === null) {
    return { ok: false, error: 'Could not resolve tab id' };
  }

  const result = await withStorageLock('frameState', async () => {
    const pageUrl =
      sender.tab?.url && /^https?:/.test(sender.tab.url) ? sender.tab.url : record.url;
    const previous = await getPageAnalysisByUrl(pageUrl);
    const frameId = sender.frameId ?? 0;
    const document = normalizeDocument(record.document);
    const sources = (record.availableDocuments ?? [])
      .map(normalizeDocument)
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
      .map((doc) => ({ ...doc, frameId }));
    let previousSources = previous?.availableDocuments ?? [];
    if (
      previous?.status === 'analyzing' &&
      previous.frameId === frameId &&
      document &&
      previous.document &&
      document.id !== previous.document.id &&
      !sources.some((doc) => doc.id === previous.document!.id)
    ) {
      previousSources = previousSources.filter((doc) => doc.id !== previous.document!.id);
    }
    const availableDocuments = mergeDocuments(previousSources, sources);
    // Passive discoveries never erase a reviewed document or a pending analysis from another frame.
    const preserve =
      previous &&
      ((record.status === 'no_detection' &&
        previous.status !== 'no_detection' &&
        previous.frameId !== frameId) ||
        (['needs_provider', 'needs_consent'].includes(record.status) &&
          ['ready', 'analyzing'].includes(previous.status)));
    if (frameId > 0 && record.status === 'no_detection')
      return { ok: true as const, data: undefined };
    return setPageAnalysisRecord(
      preserve
        ? { ...previous, availableDocuments }
        : {
            ...record,
            tabId,
            url: pageUrl,
            domain: new URL(pageUrl).hostname,
            frameId,
            sourceFrameUrl: sender.url ?? record.url,
            ...(document ? { document: { ...document, frameId } } : {}),
            availableDocuments,
            analyzedDocumentIds: previous?.analyzedDocumentIds ?? [],
          }
    );
  });
  if (!result.ok) {
    return { ok: false, error: 'Could not save page analysis' };
  }

  return { ok: true, data: null };
}

async function handleProcessPageAnalysis(
  payload: ProcessPageAnalysisMessage['payload'],
  sender: chrome.runtime.MessageSender
): Promise<MessageResponse> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    return { ok: false, error: 'Could not resolve tab id' };
  }
  if (
    !payload ||
    typeof payload.text !== 'string' ||
    !payload.text.trim() ||
    typeof payload.url !== 'string' ||
    typeof payload.provider !== 'string'
  ) {
    return { ok: false, error: 'Invalid analysis request' };
  }
  let url: URL;
  try {
    url = new URL(payload.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported page');
  } catch {
    return { ok: false, error: 'Invalid page URL' };
  }

  console.warn(`[Goodman:bg] starting analysis with provider=${payload.provider}`);
  const pageUrl = sender.tab?.url && /^https?:/.test(sender.tab.url) ? sender.tab.url : url.href;
  const settings = await getStorage('settings');
  const preferences = await getDomainPreferences(new URL(pageUrl).hostname);
  const mode =
    preferences.analysisMode && preferences.analysisMode !== 'inherit'
      ? preferences.analysisMode
      : settings.ok
        ? settings.data.analysisMode
        : 'ask';
  if (!payload.userInitiated && mode !== 'automatic')
    return { ok: false, error: 'Choose Analyze to send this agreement to your provider.' };
  if (sender.url && /^https?:/.test(sender.url) && sender.url !== payload.url)
    return { ok: false, error: 'The page changed. Try again.' };
  const previous = await getPageAnalysisByUrl(pageUrl);
  const document = normalizeDocument(payload.document);
  const result = await processPageAnalysis({
    tabId,
    ...payload,
    url: pageUrl,
    domain: new URL(pageUrl).hostname,
    document: document ? { ...document, frameId: sender.frameId ?? 0 } : undefined,
    availableDocuments: previous?.availableDocuments,
    analyzedDocumentIds: previous?.analyzedDocumentIds,
    frameId: sender.frameId ?? 0,
    sourceFrameUrl: sender.url ?? payload.url,
  });
  console.warn(
    `[Goodman:bg] processPageAnalysis done: ok=${result.ok} cancelled=${result.cancelled} error=${result.error ?? 'none'}`
  );

  if (result.cancelled) {
    return { ok: false, error: result.error ?? 'Analysis cancelled.', cancelled: true };
  }

  if (!result.ok) {
    console.error('[Goodman] analysis failed:', result.error);
    return { ok: false, error: result.error ?? 'Failed to process page analysis' };
  }

  return { ok: true, data: result.data };
}

async function handleSummarize(payload: {
  text: string;
  provider: string;
}): Promise<MessageResponse> {
  if (
    !payload ||
    typeof payload.text !== 'string' ||
    !payload.text.trim() ||
    payload.text.length > MAX_INPUT_TEXT_LENGTH ||
    typeof payload.provider !== 'string'
  ) {
    return { ok: false, error: 'Invalid or oversized summary request' };
  }
  const result = await singleShotSummarizeWithProvider(payload.text, payload.provider);
  if (!result.ok) {
    console.error('[Goodman] summarize failed:', result.error.message);
    return { ok: false, error: result.error.userMessage ?? result.error.message };
  }
  return { ok: true, data: result.data };
}

function registerTabCleanup(): void {
  if (!chrome.tabs?.onRemoved) return;

  chrome.tabs.onRemoved.addListener(async (tabId: number) => {
    discardPageAnalysis(tabId);
    await removePageAnalysis(tabId);
  });
}

function resolveTabId(fallbackTabId: number, sender: chrome.runtime.MessageSender): number | null {
  if (typeof sender.tab?.id === 'number') {
    return sender.tab.id;
  }

  if (fallbackTabId >= 0) {
    return fallbackTabId;
  }

  return null;
}

function registerKeepAlive(): void {
  if (!chrome.alarms) return;
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive')
      void prunePageAnalysisState().catch((e) =>
        console.warn('[Goodman] keepalive prune failed:', e)
      );
  });
}

function registerActionLauncher(): void {
  chrome.action?.onClicked?.addListener(async (tab) => {
    await openWorkspaceSurface(tab);
  });
}

async function openWorkspaceSurface(
  target?: chrome.tabs.Tab | OpenWorkspaceSurfaceMessage['payload']
): Promise<boolean> {
  const route = isWorkspaceTarget(target) ? target.route : undefined;
  const domain = isWorkspaceTarget(target) ? target.domain : undefined;
  const routeQuery = new URLSearchParams({ workspace: '1' });
  if (route) routeQuery.set('route', route);
  if (domain) routeQuery.set('domain', domain);
  const extensionPage = chrome.runtime.getURL(`src/popup/index.html?${routeQuery}`);
  const windowId = await resolveWorkspaceWindowId(target);

  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.setOptions?.({
        enabled: true,
        path: `src/popup/index.html#panel&${routeQuery}`,
      });

      if (typeof windowId === 'number') {
        await chrome.sidePanel.open({ windowId });
        return true;
      }
    } catch (error) {
      console.warn('[Goodman] side panel open failed, falling back:', error);
    }
  }

  if (chrome.windows?.create) {
    try {
      await chrome.windows.create({
        url: extensionPage,
        type: 'popup',
        width: 500,
        height: 900,
        focused: true,
      });
      return true;
    } catch (error) {
      console.warn('[Goodman] popup window open failed, falling back:', error);
    }
  }

  try {
    await chrome.tabs.create({ url: extensionPage });
    return true;
  } catch (error) {
    console.error('[Goodman] could not open workspace surface:', error);
  }

  return false;
}

function isWorkspaceTarget(
  target: chrome.tabs.Tab | OpenWorkspaceSurfaceMessage['payload'] | undefined
): target is OpenWorkspaceSurfaceMessage['payload'] {
  return Boolean(target && ('tabId' in target || 'route' in target || 'domain' in target));
}

async function resolveWorkspaceWindowId(
  target?: chrome.tabs.Tab | OpenWorkspaceSurfaceMessage['payload']
): Promise<number | undefined> {
  if (typeof target?.windowId === 'number') {
    return target.windowId;
  }

  if (chrome.tabs?.query) {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const activeTab = activeTabs[0];
      if (typeof activeTab?.windowId === 'number') {
        return activeTab.windowId;
      }
    } catch (error) {
      console.warn('[Goodman] could not resolve active window id:', error);
    }
  }

  return undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function cancelFromSender(
  sender: chrome.runtime.MessageSender,
  payload: { tabId: number; expectedUrl?: string }
): Promise<MessageResponse> {
  const tabId = sender.tab?.id ?? payload.tabId;
  const record = await getPageAnalysis(tabId);
  if (sender.tab && record?.frameId !== undefined && record.frameId !== (sender.frameId ?? 0))
    return { ok: true, data: { cancelled: false } };
  if (sender.frameId && payload.expectedUrl && record?.sourceFrameUrl !== payload.expectedUrl)
    return { ok: true, data: { cancelled: false } };
  return handleCancelPageAnalysis(tabId, sender.frameId ? record?.url : payload.expectedUrl);
}

function registerReviewActions(): void {
  const install = (): void => {
    if (!chrome.contextMenus) return;
    chrome.contextMenus.removeAll(() => {
      for (const [id, title, contexts] of [
        ['goodman-selection', 'Explain selection with Goodman', ['selection']],
        ['goodman-link', 'Analyze agreement with Goodman', ['link']],
        ['goodman-page', 'Review this page with Goodman', ['page']],
      ] as Array<
        [string, string, [chrome.contextMenus.ContextType, ...chrome.contextMenus.ContextType[]]]
      >) {
        chrome.contextMenus.create({
          id,
          title,
          contexts,
          documentUrlPatterns: ['http://*/*', 'https://*/*'],
        });
      }
    });
  };
  chrome.runtime.onInstalled?.addListener(install);
  chrome.runtime.onStartup?.addListener(install);
  chrome.contextMenus?.onClicked.addListener((info, tab) => {
    if (typeof tab?.id !== 'number') return;
    const input =
      info.menuItemId === 'goodman-selection'
        ? { text: info.selectionText }
        : info.menuItemId === 'goodman-link'
          ? { url: info.linkUrl }
          : {};
    void chrome.tabs
      .sendMessage(
        tab.id,
        { type: 'MANUAL_ANALYSIS', payload: input },
        { frameId: info.frameId ?? 0 }
      )
      .catch(() =>
        openWorkspaceSurface({ tabId: tab.id, windowId: tab.windowId, route: 'current' })
      );
  });
  chrome.commands?.onCommand.addListener(async (command) => {
    if (command !== 'review-agreement') return;
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab)
      await openWorkspaceSurface({ tabId: tab.id, windowId: tab.windowId, route: 'current' });
  });
}
