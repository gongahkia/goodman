import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  NetworkError,
  ProviderError,
  RateLimitError,
  ServiceUnavailableError,
  TCGuardError,
} from '../src/shared/errors';
import type { AnalysisSourceType, DetectionType } from '../src/shared/page-analysis';
import {
  analyzeTerms,
  type AnalyzeRequestBody,
  type AnalyzeSuccessPayload,
  type HostedServerConfig,
} from './analyze';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface CreateHostedAppOptions {
  analyze?: (input: AnalyzeRequestBody) => Promise<AnalyzeSuccessPayload>;
  config?: HostedServerConfig;
  rateLimit?: RateLimitConfig;
  now?: () => number;
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 30,
  windowMs: 60_000,
};

export function createHostedApp(options: CreateHostedAppOptions = {}): Hono {
  const app = new Hono();
  const config = options.config;
  const analyze =
    options.analyze ??
    (async (input: AnalyzeRequestBody) => {
      if (!config) {
        throw new ServiceUnavailableError(
          'TC Guard Cloud',
          'Hosted analysis is not configured on the server.'
        );
      }

      return analyzeTerms(input, config);
    });
  const rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  const now = options.now ?? (() => Date.now());
  const requestLog = new Map<string, number[]>();

  app.use('*', async (c, next) => {
    applyCors(c);
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    await next();
  });

  app.post('/v1/analyze', async (c) => {
    const requestId = createRequestId();

    if (!allowRequest(c, requestLog, rateLimit, now())) {
      c.header('retry-after', '60');
      return c.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many hosted analysis requests. Please retry shortly.',
            retryable: true,
          },
          requestId,
        },
        429
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'Request body must be valid JSON.',
            retryable: false,
          },
          requestId,
        },
        400
      );
    }

    const parsed = parseAnalyzeRequest(body);
    if (!parsed.ok) {
      return c.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: parsed.error,
            retryable: false,
          },
          requestId,
        },
        400
      );
    }

    try {
      const result = await analyze(parsed.data);
      return c.json(
        {
          summary: result.summary,
          model: result.model,
          requestId,
        },
        200
      );
    } catch (error) {
      return toErrorResponse(c, error, requestId);
    }
  });

  return app;
}

function applyCors(c: Context): void {
  const origin = c.req.header('origin');
  if (origin && isAllowedOrigin(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
  }
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  c.header('Access-Control-Allow-Methods', 'POST,OPTIONS');
  c.header('Access-Control-Allow-Private-Network', 'true');
  c.header('Vary', 'Origin, Access-Control-Request-Private-Network');
}

function isAllowedOrigin(origin: string): boolean {
  return (
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://localhost')
  );
}

function allowRequest(
  c: Context,
  requestLog: Map<string, number[]>,
  rateLimit: RateLimitConfig,
  currentTime: number
): boolean {
  const key = getClientKey(c);
  const recentRequests = (requestLog.get(key) ?? []).filter(
    (timestamp) => currentTime - timestamp < rateLimit.windowMs
  );

  if (recentRequests.length >= rateLimit.maxRequests) {
    requestLog.set(key, recentRequests);
    return false;
  }

  recentRequests.push(currentTime);
  requestLog.set(key, recentRequests);
  return true;
}

function getClientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'anonymous';
  }

  return c.req.header('x-real-ip') ?? 'anonymous';
}

function parseAnalyzeRequest(
  body: unknown
): { ok: true; data: AnalyzeRequestBody } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be an object.' };
  }

  const input = body as Record<string, unknown>;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const url = typeof input.url === 'string' ? input.url : '';
  const domain = typeof input.domain === 'string' ? input.domain : '';
  const sourceType = isSourceType(input.sourceType) ? input.sourceType : null;
  const detectionType = isDetectionType(input.detectionType)
    ? input.detectionType
    : null;
  const clientVersion =
    typeof input.clientVersion === 'string' ? input.clientVersion : '';

  if (text.length < 50) {
    return { ok: false, error: 'text must contain at least 50 characters.' };
  }

  if (!url || !domain || !sourceType || !detectionType || !clientVersion) {
    return {
      ok: false,
      error:
        'url, domain, sourceType, detectionType, and clientVersion are required.',
    };
  }

  return {
    ok: true,
    data: {
      text,
      url,
      domain,
      sourceType,
      detectionType,
      clientVersion,
    },
  };
}

function isSourceType(value: unknown): value is AnalysisSourceType {
  return value === 'inline' || value === 'linked' || value === 'pdf';
}

function isDetectionType(value: unknown): value is DetectionType {
  return (
    value === 'checkbox' ||
    value === 'modal' ||
    value === 'banner' ||
    value === 'fullpage'
  );
}

function toErrorResponse(c: Context, error: unknown, requestId: string): Response {
  if (error instanceof RateLimitError) {
    c.header('retry-after', String(error.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: error.userMessage,
          retryable: true,
        },
        requestId,
      },
      429
    );
  }

  if (
    error instanceof ServiceUnavailableError ||
    error instanceof NetworkError
  ) {
    return c.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            error instanceof TCGuardError
              ? error.userMessage
              : 'Hosted analysis is temporarily unavailable.',
          retryable: true,
        },
        requestId,
      },
      503
    );
  }

  if (error instanceof ProviderError) {
    return c.json(
      {
        error: {
          code: 'UPSTREAM_ERROR',
          message: error.userMessage,
          retryable: false,
        },
        requestId,
      },
      502
    );
  }

  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Hosted analysis failed unexpectedly.',
        retryable: true,
      },
      requestId,
    },
    500
  );
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
