import browser from 'webextension-polyfill';
import type { Message, MessageResponse } from './messages';

export async function sendToBackground(msg: Message): Promise<MessageResponse> {
  return browser.runtime.sendMessage(msg) as Promise<MessageResponse>;
}

export async function sendToTab(tabId: number, msg: Message): Promise<MessageResponse> {
  return browser.tabs.sendMessage(tabId, msg) as Promise<MessageResponse>;
}

export type MessageHandler = (
  msg: Message,
  sender: browser.Runtime.MessageSender
) => Promise<MessageResponse> | undefined;

export function onMessage(handler: MessageHandler): void {
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: browser.Runtime.MessageSender) => {
    return handler(message as Message, sender);
    }
  );
}
