import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { NetworkError, ProviderError, RateLimitError } from '@shared/errors';
import type { TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryResponse } from './response-parser';

const MAX_RETRIES = 2;
const RETRY_DELAYS = [1000, 3000];

export class CustomEndpointProvider implements LLMProvider {
  name = 'custom';

  constructor(
    private baseUrl: string,
    private apiKey: string = '',
    private model: string = ''
  ) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model || options.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: text },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      response_format: { type: 'json_object' },
    };

    return this.makeRequestWithRetry(url, body);
  }

  async validateApiKey(key: string): Promise<boolean> {
    try {
      const modelsUrl = `${this.baseUrl}/v1/models`;
      const headers: Record<string, string> = {};
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const response = await fetch(modelsUrl, { headers });
      if (response.ok) return true;

      // Fallback: try a minimal chat completion
      const chatUrl = `${this.baseUrl}/v1/chat/completions`;
      const chatResponse = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model: this.model || 'default',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 5,
        }),
      });
      return chatResponse.ok;
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt] ?? 3000);
          return this.makeRequestWithRetry(url, body, attempt + 1);
        }
        return err(new RateLimitError('Custom endpoint', 60));
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt] ?? 3000);
        return this.makeRequestWithRetry(url, body, attempt + 1);
      }

      if (!response.ok) {
        return err(new ProviderError('Custom endpoint', `HTTP ${response.status}`));
      }

      const json = (await response.json()) as Record<string, unknown>;
      const choices = json['choices'] as Array<Record<string, unknown>> | undefined;
      const message = choices?.[0]?.['message'] as Record<string, unknown> | undefined;
      const content = (message?.['content'] as string) ?? null;

      if (!content) {
        return err(new ProviderError('Custom endpoint', 'No content in response'));
      }

      return parseSummaryResponse(content);
    } catch (e) {
      if (e instanceof TCGuardError) return err(e);
      return err(new NetworkError('Custom endpoint'));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
