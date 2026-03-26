import type { Message, MessageResponse } from './messages';

type MessageSender = chrome.runtime.MessageSender;

export async function sendToBackground(msg: Message): Promise<MessageResponse> {
  return chrome.runtime.sendMessage(msg) as Promise<MessageResponse>;
}

export async function sendToTab(tabId: number, msg: Message): Promise<MessageResponse> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<MessageResponse>;
}

export type MessageHandler = (
  msg: Message,
  sender: MessageSender
) => Promise<MessageResponse> | undefined;

export function onMessage(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender: MessageSender, sendResponse: (response?: unknown) => void) => {
      const result = handler(message as Message, sender);
      if (result) {
        result.then(sendResponse).catch((e) => {
          console.error('[Goodman] message handler error:', e);
          sendResponse({ ok: false, error: String(e) });
        });
        return true; // keep channel open for async response
      }
      return false;
    }
  );
}
