import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { InvalidResponseError, NetworkError, RateLimitError, ProviderError } from '@shared/errors';
import type { TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryResponse } from './response-parser';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const MODELS_URL = 'https://api.openai.com/v1/models';
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

export class OpenAIProvider implements LLMProvider {
  name = 'openai';

  constructor(
    private apiKey: string,
    private baseUrl: string = API_URL
  ) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const body = {
      model: options.model || 'gpt-4o',
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: text },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: { type: 'json_object' },
    };

    return this.makeRequestWithRetry(body);
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const response = await fetch(MODELS_URL, {
        headers: { Authorization: `Bearer ${key}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async makeRequestWithRetry(
    body: Record<string, unknown>,
    attempt = 0
  ): Promise<Result<Summary, TCGuardError>> {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(body, attempt + 1);
        }
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
        return err(new RateLimitError('OpenAI', retryAfter));
      }

      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(body, attempt + 1);
        }
        return err(new ProviderError('OpenAI', `Server error: ${response.status}`));
      }

      if (!response.ok) {
        return err(new ProviderError('OpenAI', `HTTP ${response.status}`));
      }

      const json = (await response.json()) as Record<string, unknown>;
      const content = extractOpenAIContent(json);
      if (!content) {
        return err(new InvalidResponseError('No content in OpenAI response'));
      }

      return parseSummaryResponse(content);
    } catch (e) {
      if (e instanceof TCGuardError) return err(e);
      return err(new NetworkError('OpenAI'));
    }
  }
}

function extractOpenAIContent(json: Record<string, unknown>): string | null {
  const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
  if (!choices?.[0]) return null;
  const message = choices[0]['message'] as Record<string, unknown> | undefined;
  return (message?.['content'] as string) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
