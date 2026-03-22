import { onMessage } from '@shared/messaging';
import type { Message, MessageResponse } from '@shared/messages';
import type { Runtime } from 'webextension-polyfill';

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'DETECT_TC':
        return handleDetectTC();
      default:
        return undefined;
    }
  }
);

async function handleDetectTC(): Promise<MessageResponse> {
  return { ok: true, data: [] };
}
