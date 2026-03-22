import { err } from '@shared/result';
import type { Result } from '@shared/result';
import { NetworkError, RateLimitError, ProviderError, TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryResponse } from './response-parser';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

export class ClaudeProvider implements LLMProvider {
  name = 'claude';

  constructor(
    private apiKey: string,
    private defaultModel: string = 'claude-sonnet-4-20250514'
  ) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const body = {
      model: options.model || this.defaultModel || 'claude-sonnet-4-20250514',
      max_tokens: options.maxTokens,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: text }],
    };

    return this.makeRequestWithRetry(body);
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  private async makeRequestWithRetry(
    body: Record<string, unknown>,
    attempt = 0
  ): Promise<Result<Summary, TCGuardError>> {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(body, attempt + 1);
        }
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
        return err(new RateLimitError('Claude', retryAfter));
      }

      if (response.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(body, attempt + 1);
        }
        return err(new ProviderError('Claude', `Server error: ${response.status}`));
      }

      if (!response.ok) {
        return err(new ProviderError('Claude', `HTTP ${response.status}`));
      }

      const json = (await response.json()) as Record<string, unknown>;
      const content = extractClaudeContent(json);
      if (!content) {
        return err(new ProviderError('Claude', 'No content in response'));
      }

      return parseSummaryResponse(content);
    } catch (e) {
      if (e instanceof TCGuardError) return err(e);
      return err(new NetworkError('Claude'));
    }
  }
}

function extractClaudeContent(json: Record<string, unknown>): string | null {
  const content = json['content'] as Array<Record<string, unknown>> | undefined;
  if (!content?.[0]) return null;
  return (content[0]['text'] as string) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
