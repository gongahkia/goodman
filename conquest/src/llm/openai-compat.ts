import { parseResponseWithMetadata } from './parser'

import type { VisionLLMProvider } from './provider'
import type { CapturedImage, QuizAnalysisResult } from '../lib/types'

export class OpenAICompatProvider implements VisionLLMProvider {
  readonly name = 'openai-compatible'
  private readonly endpoint: string
  private readonly apiKey: string
  private readonly model: string

  constructor(endpoint: string, model: string, apiKey = '') {
    this.endpoint = endpoint.replace(/\/+$/, '')
    this.apiKey = apiKey.trim()
    this.model = model
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        headers: this.buildHeaders(),
      })
      if (response.status === 401 || response.status === 403) {
        throw new Error('OpenAI-style API rejected authentication: check your API key')
      }
      return response.ok
    } catch (err) {
      if (err instanceof Error && err.message.includes('authentication')) {
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
    let response = await this.requestChatCompletion(image, prompt, signal, 'max_tokens')

    if (await shouldRetryWithMaxCompletionTokens(response)) {
      response = await this.requestChatCompletion(
        image,
        prompt,
        signal,
        'max_completion_tokens',
      )
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const err = new Error('OpenAI-style API rejected authentication: check your API key')
        Object.assign(err, { status: response.status })
        throw err
      }
      const providerMessage = await extractProviderErrorMessage(response)
      const suffix = providerMessage
        ? `: ${providerMessage}`
        : response.statusText ? `: ${response.statusText}` : ''
      const err = new Error(`OpenAI-compatible server returned ${response.status}${suffix}`)
      Object.assign(err, { status: response.status })
      throw err
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }
    const content = data.choices[0]?.message?.content ?? ''
    const parsed = parseResponseWithMetadata(content)
    return {
      answer: parsed.answer,
      model: this.model,
      parseStrategy: parsed.strategy,
      provider: 'openai-compatible',
      rawResponse: content,
    }
  }

  async listVisionModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        headers: this.buildHeaders(),
      })
      if (!response.ok) return []
      const data = await response.json() as {
        data?: Array<{ id: string }>
      }
      if (!Array.isArray(data.data)) return []
      const visionKeywords = ['vl', 'vision', 'llava', 'moondream', 'bakllava']
      const filtered = data.data
        .filter((m) => {
          const id = m.id.toLowerCase()
          return visionKeywords.some((kw) => id.includes(kw))
        })
        .map((m) => m.id)
      return filtered.length > 0
        ? filtered
        : data.data.map((m) => m.id)
    } catch {
      return []
    }
  }

  private buildHeaders(): Record<string, string> {
    return this.apiKey
      ? {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      }
      : { 'Content-Type': 'application/json' }
  }

  private requestChatCompletion(
    image: CapturedImage,
    prompt: string,
    signal: AbortSignal | undefined,
    tokenField: 'max_completion_tokens' | 'max_tokens',
  ): Promise<Response> {
    return fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
            },
          ],
        }],
        [tokenField]: 220,
        temperature: 0,
      }),
      signal,
    })
  }
}

async function extractProviderErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const data = await response.clone().json() as {
      error?: { message?: string }
      message?: string
    }

    return data.error?.message ?? data.message
  } catch {
    try {
      const text = await response.text()
      return text.trim() || undefined
    } catch {
      return undefined
    }
  }
}

async function shouldRetryWithMaxCompletionTokens(response: Response): Promise<boolean> {
  if (response.ok || response.status !== 400) {
    return false
  }

  const providerMessage = await extractProviderErrorMessage(response)
  if (!providerMessage) {
    return false
  }

  const normalizedMessage = providerMessage.toLowerCase()
  return normalizedMessage.includes('max_tokens')
    && normalizedMessage.includes('max_completion_tokens')
}
