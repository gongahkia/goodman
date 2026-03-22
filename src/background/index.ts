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
  removePageAnalysis,
  setPageAnalysisRecord,
  setStorage,
} from '@shared/storage';
import type { Runtime } from 'webextension-polyfill';
import { processPageAnalysis } from './process-analysis';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';

registerTabCleanup();

onMessage(
  (msg: Message, sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'FETCH_URL':
        return handleFetchUrl(msg.payload.url);
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

async function handleFetchUrl(url: string): Promise<MessageResponse> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return { ok: true, data: html };
  } catch {
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
    return { ok: false, error: result.error ?? 'Failed to process page analysis' };
  }

  return { ok: true, data: result.data };
}

async function handleSummarize(
  payload: { text: string; provider: string }
): Promise<MessageResponse> {
  const result = await singleShotSummarizeWithProvider(payload.text, payload.provider);
  if (!result.ok) {
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
