import type { BrowserKind } from './site-access';
import type { InteractionMode } from './storage';

export type ManualConvertFailureReason = 'NO_SELECTION' | 'SELECTION_TOO_LONG' | 'UNSUPPORTED_SELECTION' | 'NO_RANGE';

export interface ActiveTabContext {
  browser: BrowserKind;
  tabId: number | null;
  url: string | null;
  originPattern: string | null;
  restricted: boolean;
  liveEnabled: boolean;
}

export interface ContentModeResponse {
  liveSelectionEnabled: boolean;
  interactionMode: InteractionMode;
}

export interface ManualConvertResponse {
  ok: boolean;
  reason?: ManualConvertFailureReason;
}

export type RuntimeMessage =
  | { type: 'ONUL_GET_ACTIVE_TAB_CONTEXT' }
  | { type: 'ONUL_RUN_MANUAL_CONVERT'; tabId: number }
  | { type: 'ONUL_CONTEXT_MENU_CONVERT'; text: string }
  | { type: 'ONUL_SET_LIVE_MODE'; enabled: boolean; tabId?: number }
  | { type: 'ONUL_GET_CONTENT_MODE'; url: string };

export function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  if (!message || typeof message !== 'object' || !('type' in message)) {
    return false;
  }

  const messageType = message.type;

  return typeof messageType === 'string' && messageType.startsWith('ONUL_');
}
