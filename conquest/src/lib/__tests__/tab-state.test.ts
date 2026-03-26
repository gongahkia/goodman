import { describe, expect, it } from 'vitest'

import { buildTabAnalysisState } from '../tab-state'

describe('buildTabAnalysisState', () => {
  it('returns tab state when the current URL matches', () => {
    const state = buildTabAnalysisState(
      {
        badge: { color: '#00d4aa', text: '87%', variant: 'success' },
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      },
      'https://kahoot.it/game/123',
    )

    expect(state?.tabUrl).toBe('https://kahoot.it/game/123')
  })

  it('suppresses tab state when the current URL differs', () => {
    const state = buildTabAnalysisState(
      {
        badge: { color: '#e04060', text: '!', variant: 'error' },
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      },
      'https://kahoot.it/game/456',
    )

    expect(state).toBeUndefined()
  })
})
