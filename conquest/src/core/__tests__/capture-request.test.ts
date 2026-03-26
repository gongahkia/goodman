import { describe, expect, it } from 'vitest'

import {
  resolveRequestedCaptureMode,
  shouldPromptForRegionSelection,
} from '../capture-request'

describe('resolveRequestedCaptureMode', () => {
  it('uses the configured mode for default captures', () => {
    expect(resolveRequestedCaptureMode('default', 'region')).toBe('region')
    expect(resolveRequestedCaptureMode('default', 'fullpage')).toBe('fullpage')
  })

  it('keeps explicit capture requests authoritative', () => {
    expect(resolveRequestedCaptureMode('fullpage', 'region')).toBe('fullpage')
    expect(resolveRequestedCaptureMode('region', 'fullpage')).toBe('region')
  })
})

describe('shouldPromptForRegionSelection', () => {
  it('always prompts for explicit region requests', () => {
    expect(shouldPromptForRegionSelection('region', 'fullpage', true)).toBe(true)
    expect(shouldPromptForRegionSelection('region', 'region', false)).toBe(true)
  })

  it('prompts when default mode is region and no saved region exists', () => {
    expect(shouldPromptForRegionSelection('default', 'region', false)).toBe(true)
  })

  it('skips prompting when full-page capture is resolved or a region already exists', () => {
    expect(shouldPromptForRegionSelection('default', 'fullpage', false)).toBe(false)
    expect(shouldPromptForRegionSelection('default', 'region', true)).toBe(false)
  })
})
