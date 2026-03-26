import { parseResponseWithMetadata } from './parser'

import type { VisionLLMProvider } from './provider'
import type { CapturedImage, QuizAnalysisResult } from '../lib/types'

export class OllamaProvider implements VisionLLMProvider {
  readonly name = 'ollama'
  private readonly endpoint: string
  private readonly model: string

  constructor(endpoint: string, model: string) {
    this.endpoint = endpoint.replace(/\/+$/, '')
    this.model = model
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`)
      if (response.status === 403) {
        throw new Error(
          'Ollama blocked the extension origin (403): add chrome-extension://* to OLLAMA_ORIGINS and restart Ollama',
        )
      }
      if (!response.ok) return false
      const data = await response.json() as { models?: Array<{ name: string }> }
      return Array.isArray(data.models) && data.models.length > 0
    } catch (err) {
      if (err instanceof Error && err.message.includes('Ollama blocked the extension origin')) {
        throw err
      }
      return false
    }
  }

  async analyzeImage(
    image: CapturedImage,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<QuizAnalysisResult> {
    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        images: [image.base64],
        options: {
          num_predict: 64,
          temperature: 0,
          top_p: 0.8,
        },
        prompt,
        stream: false,
      }),
      signal,
    })

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          'Ollama blocked the extension origin (403): add chrome-extension://* to OLLAMA_ORIGINS and restart Ollama',
        )
      }
      const err = new Error(`Ollama returned ${response.status}: ${response.statusText}`)
      Object.assign(err, { status: response.status })
      throw err
    }

    const data = await response.json() as { response: string }
    const parsed = parseResponseWithMetadata(data.response)
    return {
      answer: parsed.answer,
      model: this.model,
      parseStrategy: parsed.strategy,
      provider: 'ollama',
      rawResponse: data.response,
    }
  }

  async listVisionModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`)
      if (!response.ok) return []
      const data = await response.json() as {
        models?: Array<{ name: string, details?: { families?: string[] } }>
      }
      if (!Array.isArray(data.models)) return []
      // Filter for vision-capable models (have 'clip' or 'vision' family, or known vision models)
      const visionKeywords = ['vl', 'vision', 'llava', 'moondream', 'bakllava']
      return data.models
        .filter((m) => {
          const name = m.name.toLowerCase()
          const families = m.details?.families ?? []
          return visionKeywords.some((kw) => name.includes(kw))
            || families.includes('clip')
        })
        .map((m) => m.name)
    } catch {
      return []
    }
  }
}
