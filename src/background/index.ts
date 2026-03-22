import { onMessage } from '@shared/messaging';
import type { Message, MessageResponse } from '@shared/messages';
import type { Runtime } from 'webextension-polyfill';
import { singleShotSummarizeWithProvider } from '@summarizer/singleshot';

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'FETCH_URL':
        return handleFetchUrl(msg.payload.url);
      case 'GET_SETTINGS':
        return handleGetSettings();
      case 'SAVE_SETTINGS':
        return handleSaveSettings(msg.payload);
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
  const result = await chrome.storage.local.get('settings');
  return { ok: true, data: result['settings'] ?? null };
}

async function handleSaveSettings(
  settings: Record<string, unknown>
): Promise<MessageResponse> {
  await chrome.storage.local.set({ settings });
  return { ok: true, data: null };
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
