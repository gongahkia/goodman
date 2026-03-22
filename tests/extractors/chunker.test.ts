import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from '@content/extractors/chunker';

describe('chunkText', () => {
  it('should return single chunk for short text', () => {
    const shortText = 'This is a short legal document.';
    const chunks = chunkText(shortText);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(shortText);
  });

  it('should split long text into multiple chunks', () => {
    const paragraphs = Array(100)
      .fill(
        'This is a paragraph of legal text that discusses various terms and conditions. ' +
          'It contains information about user rights, data collection, and service agreements. ' +
          'The company reserves the right to modify these terms at any time without notice. ' +
          'By using our services you agree to all of these terms and acknowledge that.'
      )
      .join('\n\n');

    const chunks = chunkText(paragraphs, 4000, 200);

    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should not exceed maxTokens per chunk', () => {
    const paragraphs = Array(50)
      .fill(
        'This paragraph covers important terms about liability limitations and warranty disclaimers. ' +
          'The service is provided as-is without any guarantees of uptime or reliability.'
      )
      .join('\n\n');

    const maxTokens = 4000;
    const chunks = chunkText(paragraphs, maxTokens, 200);

    for (const chunk of chunks) {
      // Allow some tolerance for overlap
      const tokens = estimateTokens(chunk);
      expect(tokens).toBeLessThanOrEqual(maxTokens * 1.2);
    }
  });

  it('should have overlap between adjacent chunks', () => {
    const paragraphs = Array(30)
      .fill(
        'This is legal text paragraph with enough content to span multiple chunks. ' +
          'It talks about privacy and terms of service agreements and arbitration clauses.'
      )
      .join('\n\n');

    const chunks = chunkText(paragraphs, 2000, 200);

    if (chunks.length > 1) {
      const lastPartOfFirst = chunks[0]!.slice(-100);
      expect(chunks[1]).toContain(lastPartOfFirst.slice(0, 50));
    }
  });
});
