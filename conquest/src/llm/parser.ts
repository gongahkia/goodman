import type { ParseStrategy, QuizAnswer } from '../lib/types'

interface ParseResponseResult {
  answer: QuizAnswer
  strategy: ParseStrategy
}

export function isQuizAnswer(value: unknown): value is QuizAnswer {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.answer === 'string' && typeof obj.confidence === 'number'
}

function normalizeAnswer(parsed: QuizAnswer): QuizAnswer {
  return {
    answer: parsed.answer || 'No answer extracted',
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    reasoning: parsed.reasoning ?? '',
    questionType: parsed.questionType ?? 'unknown',
  }
}

export function parseResponse(raw: string): QuizAnswer {
  return parseResponseWithMetadata(raw).answer
}

export function parseResponseWithMetadata(raw: string): ParseResponseResult {
  // Strategy 1: Direct JSON.parse
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isQuizAnswer(parsed)) {
      return {
        answer: normalizeAnswer(parsed),
        strategy: 'json',
      }
    }
  } catch { /* continue */ }

  // Strategy 2: Extract from ```json ... ``` fenced block
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fencedMatch?.[1]) {
    try {
      const parsed: unknown = JSON.parse(fencedMatch[1].trim())
      if (isQuizAnswer(parsed)) {
        return {
          answer: normalizeAnswer(parsed),
          strategy: 'json-fenced',
        }
      }
    } catch { /* continue */ }
  }

  // Strategy 3: Extract bare {...} object
  const braceMatch = raw.match(/\{[\s\S]*\}/)
  if (braceMatch?.[0]) {
    try {
      const parsed: unknown = JSON.parse(braceMatch[0])
      if (isQuizAnswer(parsed)) {
        return {
          answer: normalizeAnswer(parsed),
          strategy: 'json-object',
        }
      }
    } catch { /* continue */ }
  }

  // Strategy 4: Extract labeled text fields such as "Answer:" or "Reasoning:"
  const labeledAnswer = parseLabeledText(raw)
  if (labeledAnswer) {
    return {
      answer: labeledAnswer,
      strategy: 'labeled-text',
    }
  }

  // Strategy 5: Fallback — derive the best available answer from raw text
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      answer: {
        answer: 'Model returned no text response',
        confidence: 0.05,
        reasoning: '',
        questionType: 'unknown',
      },
      strategy: 'fallback-empty',
    }
  }

  const answerText = extractFallbackAnswer(trimmed)
  const reasoning = buildFallbackReasoning(trimmed, answerText)

  return {
    answer: {
      answer: answerText,
      confidence: 0.15,
      reasoning,
      questionType: 'unknown',
    },
    strategy: 'fallback-text',
  }
}

function parseLabeledText(raw: string): QuizAnswer | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let answer = ''
  let reasoning = ''
  let questionType = 'unknown'
  let confidence = 0.15

  for (const line of lines) {
    const answerMatch = line.match(/^(?:best guess|final answer|answer)\s*[:\-]\s*(.+)$/i)
    if (answerMatch?.[1]) {
      answer = answerMatch[1].trim()
      continue
    }

    const reasoningMatch = line.match(/^(?:reasoning|rationale|thought process)\s*[:\-]\s*(.+)$/i)
    if (reasoningMatch?.[1]) {
      reasoning = reasoningMatch[1].trim()
      continue
    }

    const typeMatch = line.match(/^(?:question type|type)\s*[:\-]\s*(.+)$/i)
    if (typeMatch?.[1]) {
      questionType = typeMatch[1].trim()
      continue
    }

    const confidenceMatch = line.match(/^(?:confidence)\s*[:\-]\s*([01](?:\.\d+)?|\.\d+)$/i)
    if (confidenceMatch?.[1]) {
      confidence = Number(confidenceMatch[1])
    }
  }

  if (!answer) return null

  return normalizeAnswer({
    answer,
    confidence,
    reasoning,
    questionType,
  })
}

function extractFallbackAnswer(raw: string): string {
  const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? raw
  const conciseLine = firstLine.split(/\bbecause\b/i)[0]?.trim() ?? firstLine
  const cleaned = conciseLine
    .replace(/^(?:[-*]\s*)/, '')
    .replace(/^(?:the\s+)?(?:best guess|final answer|answer)\s*(?:is)?\s*[:\-]?\s*/i, '')
    .trim()

  const candidate = cleaned || firstLine.trim()
  return candidate.slice(0, 160) || raw.slice(0, 160)
}

function buildFallbackReasoning(raw: string, answerText: string): string {
  if (!raw || raw === answerText) return ''
  return raw.slice(0, 500)
}
