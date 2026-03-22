import { describe, expect, it, vi } from 'vitest';
import type { DetectedElement } from '@content/detectors/checkbox';

vi.mock('@content/extractors/inline', () => ({
  extractInlineText: vi.fn(),
}));

vi.mock('@content/extractors/linked', () => ({
  extractLinkedText: vi.fn(),
}));

vi.mock('@content/extractors/pdf', () => ({
  extractPdfText: vi.fn(),
  isPdfUrl: vi.fn(),
}));

import { extractInlineText } from '@content/extractors/inline';
import { extractLinkedText } from '@content/extractors/linked';
import { extractPdfText, isPdfUrl } from '@content/extractors/pdf';
import { resolveDetectionTextSource } from '@content/extractors/source';

function makeDetection(
  overrides: Partial<DetectedElement> = {}
): DetectedElement {
  return {
    element: document.createElement('input'),
    type: 'checkbox',
    confidence: 0.9,
    keywords: ['terms'],
    nearestLink: null,
    ...overrides,
  };
}

describe('resolveDetectionTextSource', () => {
  it('uses inline text when no legal link is present', async () => {
    vi.mocked(extractInlineText).mockReturnValue('x'.repeat(700));

    const result = await resolveDetectionTextSource(makeDetection());

    expect(result.sourceType).toBe('inline');
    expect(result.text).toHaveLength(700);
  });

  it('prefers linked HTML content when inline text is short', async () => {
    vi.mocked(extractInlineText).mockReturnValue('short');
    vi.mocked(isPdfUrl).mockReturnValue(false);
    vi.mocked(extractLinkedText).mockResolvedValue({
      ok: true,
      data: {
        text: 'linked legal text'.repeat(40),
        relatedLinks: [],
      },
    });

    const result = await resolveDetectionTextSource(
      makeDetection({ nearestLink: 'https://example.com/terms' })
    );

    expect(result.sourceType).toBe('linked');
    expect(result.text).toContain('linked legal text');
  });

  it('prefers PDF content when the nearest link targets a PDF', async () => {
    vi.mocked(extractInlineText).mockReturnValue('short');
    vi.mocked(isPdfUrl).mockReturnValue(true);
    vi.mocked(extractPdfText).mockResolvedValue({
      ok: true,
      data: 'pdf legal text'.repeat(50),
    });

    const result = await resolveDetectionTextSource(
      makeDetection({ nearestLink: 'https://example.com/terms.pdf' })
    );

    expect(result.sourceType).toBe('pdf');
    expect(result.text).toContain('pdf legal text');
  });
});
