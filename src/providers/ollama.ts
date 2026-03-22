import { err } from '@shared/result';
import type { Result } from '@shared/result';
import { NetworkError, ProviderError, TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryResponse } from './response-parser';

const DEFAULT_BASE_URL = 'http://localhost:11434';

export class OllamaProvider implements LLMProvider {
  name = 'ollama';

  constructor(private baseUrl: string = DEFAULT_BASE_URL) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const url = `${this.baseUrl}/api/chat`;

    const body = {
      model: options.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: text },
      ],
      format: 'json',
      stream: false,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return err(new ProviderError('Ollama', `HTTP ${response.status}`));
      }

      const json = (await response.json()) as Record<string, unknown>;
      const message = json['message'] as Record<string, unknown> | undefined;
      const content = (message?.['content'] as string) ?? null;

      if (!content) {
        return err(new ProviderError('Ollama', 'No content in response'));
      }

      return parseSummaryResponse(content);
    } catch (e) {
      if (e instanceof TCGuardError) return err(e);
      return err(new NetworkError('Ollama'));
    }
  }

  async validateApiKey(_key: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models !== null && models.length > 0;
    } catch {
      return false;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/api/tags`;
      const response = await fetch(url);
      if (!response.ok) return [];

      const json = (await response.json()) as Record<string, unknown>;
      const models = json['models'] as Array<Record<string, unknown>> | undefined;
      if (!models) return [];

      return models.map((m) => (m['name'] as string) ?? '').filter((n) => n.length > 0);
    } catch {
      return [];
    }
  }
}
