import { describe, it, expect } from 'vitest'

import { parseResponse, parseResponseWithMetadata, isQuizAnswer } from '../parser'

describe('parseResponse', () => {
  it('parses valid JSON directly', () => {
    const raw = JSON.stringify({
      answer: 'B: Mitochondria',
      confidence: 0.87,
      reasoning: 'The mitochondria is the powerhouse of the cell',
      questionType: 'multiple-choice',
    })
    const result = parseResponse(raw)
    expect(result.answer).toBe('B: Mitochondria')
    expect(result.confidence).toBe(0.87)
    expect(result.reasoning).toBe('The mitochondria is the powerhouse of the cell')
    expect(result.questionType).toBe('multiple-choice')
  })

  it('extracts JSON from markdown fenced block', () => {
    const raw = `Here is my analysis:
\`\`\`json
{
  "answer": "True",
  "confidence": 0.95,
  "reasoning": "The statement is correct",
  "questionType": "true/false"
}
\`\`\`
That is my answer.`
    const result = parseResponse(raw)
    expect(result.answer).toBe('True')
    expect(result.confidence).toBe(0.95)
    expect(result.questionType).toBe('true/false')
  })

  it('extracts bare JSON object from surrounding text', () => {
    const raw = 'The answer is: {"answer": "42", "confidence": 0.6, "reasoning": "calculated", "questionType": "numerical"} based on the image.'
    const result = parseResponse(raw)
    expect(result.answer).toBe('42')
    expect(result.confidence).toBe(0.6)
    expect(result.questionType).toBe('numerical')
  })

  it('falls back to raw text for garbage input', () => {
    const raw = 'This is just random text with no JSON at all.'
    const result = parseResponse(raw)
    expect(result.answer).toBe('This is just random text with no JSON at all.')
    expect(result.confidence).toBe(0.15)
    expect(result.reasoning).toBe('')
    expect(result.questionType).toBe('unknown')
  })

  it('extracts answer and reasoning from labeled text output', () => {
    const raw = `
      Answer: Paris
      Confidence: 0.42
      Reasoning: The clue points to the capital of France.
      Question Type: open-ended
    `

    const result = parseResponse(raw)
    expect(result.answer).toBe('Paris')
    expect(result.confidence).toBe(0.42)
    expect(result.reasoning).toContain('capital of France')
    expect(result.questionType).toBe('open-ended')
  })

  it('returns a non-empty answer for empty model responses', () => {
    const result = parseResponse('')
    expect(result.answer).toBe('Model returned no text response')
    expect(result.confidence).toBe(0.05)
  })

  it('clamps confidence to [0, 1]', () => {
    const raw = JSON.stringify({
      answer: 'Test',
      confidence: 1.5,
      reasoning: '',
      questionType: 'unknown',
    })
    const result = parseResponse(raw)
    expect(result.confidence).toBe(1)
  })

  it('handles negative confidence', () => {
    const raw = JSON.stringify({
      answer: 'Test',
      confidence: -0.5,
    })
    const result = parseResponse(raw)
    expect(result.confidence).toBe(0)
  })

  it('defaults missing fields', () => {
    const raw = JSON.stringify({
      answer: 'Hello',
      confidence: 0.5,
    })
    const result = parseResponse(raw)
    expect(result.reasoning).toBe('')
    expect(result.questionType).toBe('unknown')
  })

  it('truncates very long raw text fallback to 500 chars', () => {
    const raw = 'a'.repeat(600)
    const result = parseResponse(raw)
    expect(result.answer.length).toBe(160)
    expect(result.reasoning.length).toBe(500)
  })

  it('returns parse metadata for raw text fallback', () => {
    const result = parseResponseWithMetadata('Maybe it is C because the shape matches the prompt.')
    expect(result.strategy).toBe('fallback-text')
    expect(result.answer.answer).toBe('Maybe it is C')
    expect(result.answer.reasoning).toContain('because')
  })
})

describe('isQuizAnswer', () => {
  it('returns true for valid quiz answer', () => {
    expect(isQuizAnswer({ answer: 'test', confidence: 0.5 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isQuizAnswer(null)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isQuizAnswer('hello')).toBe(false)
  })

  it('returns false for missing answer', () => {
    expect(isQuizAnswer({ confidence: 0.5 })).toBe(false)
  })

  it('returns false for missing confidence', () => {
    expect(isQuizAnswer({ answer: 'test' })).toBe(false)
  })
})
