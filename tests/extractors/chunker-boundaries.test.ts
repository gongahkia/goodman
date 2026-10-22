import { describe, expect, it } from 'vitest';
import { chunkText, estimateTokens } from '@shared/chunker';

describe('bounded chunk coverage', () => {
  it.each([
    '🙂'.repeat(1000) + 'end',
    'unbrokenidentifier'.repeat(1000),
    'A long clause '.repeat(1000),
  ])('bounds an oversized sentence without dropping or breaking Unicode', (text) => {
    const chunks = chunkText(text, 80, 0);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => estimateTokens(chunk) <= 80)).toBe(true);
    expect(chunks.join('')).toBe(text.trim());
    expect(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
  });
});
