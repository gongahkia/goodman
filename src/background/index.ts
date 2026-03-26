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
} from '@shared/storage';
import type { Runtime } from 'webextension-polyfill';
import { cancelPageAnalysis, processPageAnalysis } from './process-analysis';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';
import { pruneCache } from '@summarizer/cache';

registerTabCleanup();
registerKeepAlive();
registerActionLauncher();
void runMigrations().then(() => {
  void prunePageAnalysisState();
  void pruneCache();
});

onMessage(
  (msg: Message, sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'FETCH_URL':
        return handleFetchUrl(msg.payload.url, msg.payload.responseType);
      case 'GET_SETTINGS':
        return handleGetSettings();
      case 'SAVE_SETTINGS':
        return handleSaveSettings(msg.payload);
      case 'GET_PAGE_ANALYSIS':
        return handleGetPageAnalysis(msg.payload.tabId);
      case 'OPEN_WORKSPACE_SURFACE':
        return handleOpenWorkspaceSurface(msg.payload);
      case 'CANCEL_PAGE_ANALYSIS':
        return handleCancelPageAnalysis(msg.payload.tabId);
      case 'SAVE_PAGE_ANALYSIS':
        return handleSavePageAnalysis(msg.payload, sender);
      case 'PROCESS_PAGE_ANALYSIS':
        return handleProcessPageAnalysis(msg.payload, sender);
      case 'SUMMARIZE':
        return handleSummarize(msg.payload);
      default:
        return undefined;
    }
  }
);

async function handleFetchUrl(
  url: string,
  responseType: 'text' | 'base64' = 'text'
): Promise<MessageResponse> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `Failed to fetch URL: HTTP ${response.status}` };
    }

    if (responseType === 'base64') {
      const bytes = new Uint8Array(await response.arrayBuffer());
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

async function handleSaveSettings(
  settings: Settings
): Promise<MessageResponse> {
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

async function handleCancelPageAnalysis(tabId: number): Promise<MessageResponse> {
  const cancelled = await cancelPageAnalysis(tabId);
  return { ok: true, data: { cancelled } };
}

async function handleSavePageAnalysis(
  record: PageAnalysisRecord,
  sender: Runtime.MessageSender
): Promise<MessageResponse> {
  const tabId = resolveTabId(record.tabId, sender);
  if (tabId === null) {
    return { ok: false, error: 'Could not resolve tab id' };
  }

  const result = await setPageAnalysisRecord({
    ...record,
    tabId,
  });
  if (!result.ok) {
    return { ok: false, error: 'Could not save page analysis' };
  }

  return { ok: true, data: null };
}

async function handleProcessPageAnalysis(
  payload: ProcessPageAnalysisMessage['payload'],
  sender: Runtime.MessageSender
): Promise<MessageResponse> {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') {
    return { ok: false, error: 'Could not resolve tab id' };
  }

  const result = await processPageAnalysis({
    tabId,
    ...payload,
  });

  if (result.cancelled) {
    return { ok: false, error: result.error ?? 'Analysis cancelled.', cancelled: true };
  }

  if (!result.ok) {
    console.error('[Goodman] analysis failed:', payload.url, result.error);
    return { ok: false, error: result.error ?? 'Failed to process page analysis' };
  }

  return { ok: true, data: result.data };
}

async function handleSummarize(
  payload: { text: string; provider: string }
): Promise<MessageResponse> {
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
    await removePageAnalysis(tabId);
  });
}

function resolveTabId(
  fallbackTabId: number,
  sender: Runtime.MessageSender
): number | null {
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
    if (alarm.name === 'keepalive') void prunePageAnalysisState();
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
  const extensionPage = chrome.runtime.getURL('src/popup/index.html');
  const windowId = await resolveWorkspaceWindowId(target);

  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.setOptions?.({
        enabled: true,
        path: 'src/popup/index.html#panel',
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
