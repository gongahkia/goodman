import { err } from '@shared/result';
import type { Result } from '@shared/result';
import {
  InvalidResponseError,
  NetworkError,
  ProviderError,
  RateLimitError,
  ServiceUnavailableError,
  TCGuardError,
} from '@shared/errors';
import type { LLMProvider, Summary, SummarizeOptions } from './types';
import { parseSummaryObject } from './response-parser';

const DEFAULT_BASE_URL =
  import.meta.env?.VITE_HOSTED_API_BASE_URL?.trim() || 'http://127.0.0.1:8787';
const DEFAULT_REQUEST_TIMEOUT_MS = parseTimeoutMs(
  import.meta.env?.VITE_HOSTED_API_TIMEOUT_MS,
  30_000
);

interface HostedAnalyzeSuccessPayload {
  summary?: unknown;
  model?: unknown;
  requestId?: unknown;
}

interface HostedAnalyzeErrorPayload {
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
  };
  requestId?: unknown;
}

export class HostedProvider implements LLMProvider {
  name = 'hosted';

  constructor(
    private baseUrl: string = DEFAULT_BASE_URL,
    private defaultModel: string = 'tc-guard-cloud',
    private requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
  ) {}

  async summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: options.rawText ?? text,
          url: options.metadata?.url ?? '',
          domain: options.metadata?.domain ?? '',
          sourceType: options.metadata?.sourceType ?? 'inline',
          detectionType: options.metadata?.detectionType ?? 'checkbox',
          clientVersion: options.metadata?.clientVersion ?? 'unknown',
        }),
      });

      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') ?? '60', 10);
        return err(new RateLimitError('TC Guard Cloud', retryAfter));
      }

      const payload = (await response.json()) as
        | HostedAnalyzeSuccessPayload
        | HostedAnalyzeErrorPayload;

      if (response.status >= 500) {
        const message = getPayloadMessage(payload) ?? 'The hosted analysis service failed.';
        return err(new ServiceUnavailableError('TC Guard Cloud', message));
      }

      if (!response.ok) {
        return err(
          new ProviderError(
            'TC Guard Cloud',
            getPayloadMessage(payload) ?? `HTTP ${response.status}`
          )
        );
      }

      if (!('summary' in payload)) {
        return err(new InvalidResponseError('Hosted service omitted summary payload'));
      }

      const summary = parseSummaryObject(payload.summary);
      return {
        ok: true,
        data: summary,
      };
    } catch (e) {
      if (e instanceof TCGuardError) {
        return err(e);
      }

      if (e instanceof Error && e.name === 'AbortError') {
        return err(
          new ServiceUnavailableError(
            'TC Guard Cloud',
            'The hosted analysis request timed out.'
          )
        );
      }

      if (e instanceof Error && e.name === 'SyntaxError') {
        return err(new InvalidResponseError('Hosted service returned invalid JSON'));
      }

      return err(new NetworkError('TC Guard Cloud'));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async validateApiKey(): Promise<boolean> {
    return this.baseUrl.trim().length > 0;
  }

  async checkHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`${this.baseUrl}/v1/health`, {
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function parseTimeoutMs(
  value: string | undefined,
  fallback: number
): number {
  const parsed = Number.parseInt(value?.trim() ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getPayloadMessage(
  payload: HostedAnalyzeSuccessPayload | HostedAnalyzeErrorPayload
): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const error = 'error' in payload ? payload.error : undefined;
  return typeof error?.message === 'string' ? error.message : null;
}
