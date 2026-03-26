import { describe, expect, it, vi } from 'vitest';
import { createHostedApp } from '../../server/app';
import type { AnalyzeRequestBody } from '../../server/analyze';

describe('hosted app', () => {
  it('returns structured summaries from the analyze handler', async () => {
    const analyze = vi.fn(async () => ({
      summary: {
        summary: 'A concise summary.',
        keyPoints: ['Point one'],
        redFlags: [],
        severity: 'low' as const,
      },
      model: 'goodman-cloud',
    }));
    const app = createHostedApp({ analyze });

    const response = await app.request('/v1/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'chrome-extension://test-id',
      },
      body: JSON.stringify(validRequest()),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'chrome-extension://test-id'
    );
    const body = await response.json();
    expect(body.model).toBe('goodman-cloud');
    expect(body.summary.summary).toBe('A concise summary.');
    expect(analyze).toHaveBeenCalledWith(validRequest());
  });

  it('rejects malformed requests with a 400 response', async () => {
    const app = createHostedApp({
      analyze: vi.fn(),
    });

    const response = await app.request('/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'too short',
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('applies coarse anonymous rate limiting', async () => {
    const app = createHostedApp({
      analyze: vi.fn(async () => ({
        summary: {
          summary: 'A concise summary.',
          keyPoints: ['Point one'],
          redFlags: [],
          severity: 'low' as const,
        },
        model: 'goodman-cloud',
      })),
      rateLimit: {
        maxRequests: 1,
        windowMs: 60_000,
      },
      now: () => 1_000,
    });

    const request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify(validRequest()),
    };

    const firstResponse = await app.request('/v1/analyze', request);
    const secondResponse = await app.request('/v1/analyze', request);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    const body = await secondResponse.json();
    expect(body.error.code).toBe('RATE_LIMITED');
  });
});

function validRequest(): AnalyzeRequestBody {
  return {
    text: 'By checking this box, you agree to our Terms of Service, privacy policy, binding arbitration clause, and automatic renewal terms for this subscription.',
    url: 'https://example.com/checkout',
    domain: 'example.com',
    sourceType: 'inline',
    detectionType: 'checkbox',
    clientVersion: '1.0.0-test',
  };
}
