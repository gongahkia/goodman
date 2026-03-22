import { err } from '@shared/result';
import type { Result } from '@shared/result';
import { NetworkError, RateLimitError, ProviderError, TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryResponse } from './response-parser';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

export class GeminiProvider implements LLMProvider {
  name = 'gemini';

  constructor(
    private apiKey: string,
    private defaultModel: string = 'gemini-1.5-pro'
  ) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const model = options.model || this.defaultModel || 'gemini-1.5-pro';
    const url = `${BASE_URL}/models/${model}:generateContent?key=${this.apiKey}`;

    const body = {
      systemInstruction: { parts: [{ text: options.systemPrompt }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseMimeType: 'application/json',
      },
    };

    return this.makeRequestWithRetry(url, body);
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const url = `${BASE_URL}/models?key=${key}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async makeRequestWithRetry(
    url: string,
    body: Record<string, unknown>,
    attempt = 0
  ): Promise<Result<Summary, TCGuardError>> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(url, body, attempt + 1);
        }
        return err(new RateLimitError('Gemini', 60));
      }

      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(url, body, attempt + 1);
        }
        return err(new ProviderError('Gemini', `Server error: ${response.status}`));
      }

      if (!response.ok) {
        return err(new ProviderError('Gemini', `HTTP ${response.status}`));
      }

      const json = (await response.json()) as Record<string, unknown>;
      const content = extractGeminiContent(json);
      if (!content) {
        return err(new ProviderError('Gemini', 'No content in response'));
      }

      return parseSummaryResponse(content);
    } catch (e) {
      if (e instanceof TCGuardError) return err(e);
      return err(new NetworkError('Gemini'));
    }
  }
}

function extractGeminiContent(json: Record<string, unknown>): string | null {
  const candidates = json['candidates'] as Array<Record<string, unknown>> | undefined;
  if (!candidates?.[0]) return null;
  const content = candidates[0]['content'] as Record<string, unknown> | undefined;
  const parts = content?.['parts'] as Array<Record<string, unknown>> | undefined;
  if (!parts?.[0]) return null;
  return (parts[0]['text'] as string) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
