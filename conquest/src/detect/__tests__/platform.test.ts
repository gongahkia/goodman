import { describe, it, expect } from 'vitest'

import { detectPlatform, isKnownPlatform } from '../platform'

describe('detectPlatform', () => {
  it('detects WooClap', () => {
    const result = detectPlatform('https://app.wooclap.com/ABCDEF')
    expect(result.platform).toBe('wooclap')
    expect(result.hints).toContain('WooClap')
  })

  it('detects Kahoot', () => {
    const result = detectPlatform('https://kahoot.it/challenge/12345')
    expect(result.platform).toBe('kahoot')
    expect(result.hints).toContain('Kahoot')
  })

  it('detects Google Forms', () => {
    const result = detectPlatform('https://docs.google.com/forms/d/e/abc123/viewform')
    expect(result.platform).toBe('google-forms')
    expect(result.hints).toContain('Google Forms')
  })

  it('detects Mentimeter via menti.com', () => {
    const result = detectPlatform('https://www.menti.com/1234567')
    expect(result.platform).toBe('mentimeter')
    expect(result.hints).toContain('Mentimeter')
  })

  it('detects Mentimeter via mentimeter.com', () => {
    const result = detectPlatform('https://www.mentimeter.com/s/abc')
    expect(result.platform).toBe('mentimeter')
  })

  it('detects Slido via slido.com', () => {
    const result = detectPlatform('https://www.slido.com/event/abc')
    expect(result.platform).toBe('slido')
    expect(result.hints).toContain('Slido')
  })

  it('detects Slido via app.sli.do', () => {
    const result = detectPlatform('https://app.sli.do/event/abc')
    expect(result.platform).toBe('slido')
  })

  it('returns generic for unknown URLs', () => {
    const result = detectPlatform('https://www.example.com/quiz')
    expect(result.platform).toBe('generic')
    expect(result.hints).toBeTruthy()
  })

  it('is case-insensitive', () => {
    const result = detectPlatform('https://KAHOOT.IT/game/123')
    expect(result.platform).toBe('kahoot')
  })
})

describe('isKnownPlatform', () => {
  it('returns true for known platforms', () => {
    expect(isKnownPlatform('https://kahoot.it/game')).toBe(true)
    expect(isKnownPlatform('https://wooclap.com/abc')).toBe(true)
  })

  it('returns false for unknown URLs', () => {
    expect(isKnownPlatform('https://google.com')).toBe(false)
  })
})
