import { onMessage } from '@shared/messaging';
import type {
  Message,
  MessageResponse,
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
import { processPageAnalysis } from './process-analysis';
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
    console.error('[TC Guard] fetch failed:', url, e);
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

  if (!result.ok) {
    console.error('[TC Guard] analysis failed:', payload.url, result.error);
    return { ok: false, error: result.error ?? 'Failed to process page analysis' };
  }

  return { ok: true, data: result.data };
}

async function handleSummarize(
  payload: { text: string; provider: string }
): Promise<MessageResponse> {
  const result = await singleShotSummarizeWithProvider(payload.text, payload.provider);
  if (!result.ok) {
    console.error('[TC Guard] summarize failed:', result.error.message);
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
  chrome.action?.onClicked?.addListener((tab) => {
    void openWorkspaceSurface(tab);
  });
}

async function openWorkspaceSurface(tab?: chrome.tabs.Tab): Promise<void> {
  const extensionPage = chrome.runtime.getURL('src/popup/index.html');

  if (chrome.sidePanel?.open) {
    try {
      await chrome.sidePanel.setOptions?.({
        enabled: true,
        path: 'src/popup/index.html',
      });

      if (typeof tab?.windowId === 'number') {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        return;
      }
    } catch (error) {
      console.warn('[TC Guard] side panel open failed, falling back:', error);
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
      return;
    } catch (error) {
      console.warn('[TC Guard] popup window open failed, falling back:', error);
    }
  }

  try {
    await chrome.tabs.create({ url: extensionPage });
  } catch (error) {
    console.error('[TC Guard] could not open workspace surface:', error);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
