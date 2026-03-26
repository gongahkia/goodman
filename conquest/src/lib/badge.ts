import { browserApi } from './browser-api'

import type { BadgeState } from './types'

export function buildSuccessBadgeState(confidence: number): BadgeState {
  const text = `${Math.round(confidence * 100)}%`
  const color = confidence > 0.7
    ? '#00d4aa'
    : confidence > 0.4
      ? '#f0c040'
      : '#e04060'

  return {
    color,
    text,
    variant: 'success',
  }
}

export const ERROR_BADGE_STATE: BadgeState = {
  color: '#e04060',
  text: '!',
  variant: 'error',
}

export async function applyBadgeState(tabId: number, badgeState: BadgeState): Promise<void> {
  await browserApi.action.setBadgeText({ tabId, text: badgeState.text })
  await browserApi.action.setBadgeBackgroundColor({ color: badgeState.color, tabId })
}

export async function clearBadgeState(tabId: number): Promise<void> {
  await browserApi.action.setBadgeText({ tabId, text: '' })
}
