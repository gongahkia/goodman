import { describe, expect, it } from 'vitest';
import { sanitizeCorpusContribution } from '../../server/intake/corpus';

const legalText = 'These Terms and Conditions form the agreement for using the service, including liability and arbitration clauses.';

describe('corpus intake sanitizer', () => {
  it('accepts only the public corpus whitelist', () => {
    const result = sanitizeCorpusContribution({
      legalText,
      url: 'https://example.com/legal/terms?user=123#account',
      capturedAt: 1_783_641_600_000,
      headers: { cookie: 'sid=secret' },
      userId: 'user-123',
      email: 'person@example.com',
      summary: {
        severity: 'high',
        keyPoints: ['mandatory arbitration'],
        redFlags: [{ category: 'arbitration', severity: 'high', quote: 'private quote' }],
        providerTrace: 'strip-me',
      },
      diff: {
        addedRedFlags: 1,
        removedRedFlags: 0,
        summaryChanged: true,
        changedSections: ['arbitration'],
        rawPatch: 'strip-me',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      schemaVersion: 1,
      hostname: 'example.com',
      capturedAt: '2026-07-10T00:00:00.000Z',
      legalText,
      summary: {
        severity: 'high',
        keyPoints: ['mandatory arbitration'],
        redFlags: [{ category: 'arbitration', severity: 'high' }],
      },
      diff: {
        addedRedFlags: 1,
        removedRedFlags: 0,
        summaryChanged: true,
        changedSections: ['arbitration'],
      },
    });
    expect(JSON.stringify(result.data)).not.toContain('secret');
    expect(JSON.stringify(result.data)).not.toContain('user-123');
    expect(JSON.stringify(result.data)).not.toContain('?user=123');
  });

  it('rejects non-legal or missing text', () => {
    expect(sanitizeCorpusContribution({
      legalText: 'marketing copy with no legal signal',
      hostname: 'example.com',
      capturedAt: '2026-07-10T00:00:00.000Z',
    })).toEqual({ ok: false, error: 'legal_text_required' });
  });
});
