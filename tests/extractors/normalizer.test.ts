import { describe, it, expect } from 'vitest';
import { normalizeText } from '@content/extractors/normalizer';

describe('normalizeText', () => {
  it('should strip HTML tags', () => {
    const result = normalizeText('<b>bold</b> and <em>italic</em> text');
    expect(result.text).toBe('bold and italic text');
  });

  it('should collapse three consecutive blank lines to one', () => {
    const result = normalizeText('first\n\n\n\nsecond');
    expect(result.text).toBe('first\n\nsecond');
  });

  it('should extract last updated date as metadata', () => {
    const result = normalizeText('Last updated: January 1, 2026\n\nSome legal text here.');
    expect(result.metadata.lastUpdated).toBe('January 1, 2026');
    expect(result.text).not.toContain('Last updated');
  });

  it('should have no leading or trailing whitespace', () => {
    const result = normalizeText('   \n  some text here  \n   ');
    expect(result.text).toBe('some text here');
  });

  it('should collapse multiple spaces into single space', () => {
    const result = normalizeText('multiple    spaces    here');
    expect(result.text).toBe('multiple spaces here');
  });

  it('should remove boilerplate copyright lines', () => {
    const result = normalizeText('Legal text.\n© 2026 Example Corp\nMore text.');
    expect(result.text).not.toContain('© 2026');
  });

  it('should extract effective date as metadata', () => {
    const result = normalizeText('Effective date: March 15, 2026\n\nSome terms.');
    expect(result.metadata.effectiveDate).toBe('March 15, 2026');
  });
});
