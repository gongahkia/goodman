// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

const mockChrome = {
  runtime: {
    sendMessage: async () => undefined,
  },
  storage: {
    local: {
      get: async () => ({ config: { autoCapture: false } }),
      set: async () => undefined,
    },
  },
}

Object.assign(globalThis, { chrome: mockChrome })

const { extractQuestionFingerprint, shouldTriggerFingerprint } = await import('../trigger')

describe('extractQuestionFingerprint', () => {
  it('builds a stable fingerprint for kahoot question text and options', () => {
    document.body.innerHTML = `
      <main>
        <h1 data-functional-selector="question-block-title">What is 2 + 2?</h1>
        <button data-functional-selector="answer-0">3</button>
        <button data-functional-selector="answer-1">4</button>
        <button data-functional-selector="answer-2">5</button>
      </main>
    `

    expect(extractQuestionFingerprint('kahoot')).toBe(
      'what is 2 + 2? :: 3 | 4 | 5',
    )
  })

  it('uses the active google forms list item when question content is present', () => {
    document.body.innerHTML = `
      <div role="listitem">
        <div class="M7eMe">Which planet is known as the Red Planet?</div>
        <label role="radio"><span dir="auto">Earth</span></label>
        <label role="radio"><span dir="auto">Mars</span></label>
      </div>
    `

    expect(extractQuestionFingerprint('google-forms')).toBe(
      'which planet is known as the red planet? :: earth | mars',
    )
  })
})

describe('shouldTriggerFingerprint', () => {
  it('deduplicates the same fingerprint', () => {
    expect(shouldTriggerFingerprint('alpha', {
      lastTriggeredAt: 1_000,
      lastTriggeredFingerprint: 'alpha',
    }, 2_000)).toEqual({ shouldTrigger: false })
  })

  it('defers new fingerprints during the cooldown window', () => {
    expect(shouldTriggerFingerprint('beta', {
      lastTriggeredAt: 2_000,
      lastTriggeredFingerprint: 'alpha',
    }, 2_500, 1_000)).toEqual({
      retryAfterMs: 500,
      shouldTrigger: false,
    })
  })

  it('allows distinct fingerprints after cooldown elapses', () => {
    expect(shouldTriggerFingerprint('beta', {
      lastTriggeredAt: 1_000,
      lastTriggeredFingerprint: 'alpha',
    }, 2_500, 1_000)).toEqual({ shouldTrigger: true })
  })
})
