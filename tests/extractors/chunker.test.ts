import { describe, it, expect } from 'vitest';
import { chunkText, estimateTokens } from '@shared/chunker';

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

  it('keeps numbered section headers with their section body', () => {
    const text = [
      '1. Introduction',
      'These terms explain how the service works and what users must do.',
      '',
      '2. Limitation of Liability',
      'The company limits liability for damages and excludes indirect losses.',
      '',
      '3. Arbitration',
      'All disputes must be resolved through binding arbitration.',
    ].join('\n');

    const chunks = chunkText(text, 22, 0);

    expect(chunks.find(chunk => chunk.includes('limits liability'))).toContain('2. Limitation of Liability');
    expect(chunks.find(chunk => chunk.includes('binding arbitration'))).toContain('3. Arbitration');
  });

  it('repeats an oversized section header instead of splitting mid-clause', () => {
    const body = Array(12)
      .fill('The liability clause limits damages, excludes indirect losses, and preserves all other contractual rights.')
      .join(' ');
    const chunks = chunkText(`14. Limitation of Liability\n\n${body}`, 45, 0);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.includes('14. Limitation of Liability'))).toBe(true);
  });

  it('adds reference context for cross-referenced clauses', () => {
    const text = [
      '7. Payment Terms',
      'You must pay all fees within thirty days of invoice receipt.',
      '',
      '8. Termination',
      'If you fail to satisfy Clause 7, we may terminate access immediately.',
    ].join('\n');

    const chunks = chunkText(text, 35, 0);
    const referencedChunk = chunks.find(chunk => chunk.includes('Clause 7'));

    expect(referencedChunk).toContain('Clause 7 = 7. Payment Terms');
  });
});
