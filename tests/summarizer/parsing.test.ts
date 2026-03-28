import { describe, it, expect } from 'vitest';
import { parseSummaryResponse } from '@providers/response-parser';
import validSummary from '../fixtures/valid-summary.json';

describe('parseSummaryResponse', () => {
  it('should parse valid JSON into a correct Summary object', () => {
    const result = parseSummaryResponse(JSON.stringify(validSummary));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe('This service collects your data and shares it with third parties.');
      expect(result.data.keyPoints).toHaveLength(3);
      expect(result.data.redFlags).toHaveLength(1);
      expect(result.data.redFlags[0]!.category).toBe('data_selling');
      expect(result.data.severity).toBe('high');
    }
  });

  it('should handle malformed JSON with missing fields gracefully', () => {
    const malformed = JSON.stringify({
      summary: 'A brief summary.',
      keyPoints: ['Point one'],
    });
    const result = parseSummaryResponse(malformed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.summary).toBe('A brief summary.');
      expect(result.data.redFlags).toHaveLength(0);
      expect(result.data.severity).toBe('medium');
    }
  });

  it('should return error for non-JSON response', () => {
    const result = parseSummaryResponse('This is not JSON at all.');
    expect(result.ok).toBe(false);
  });

  it('should handle JSON wrapped in code blocks', () => {
    const wrapped = '```json\n' + JSON.stringify(validSummary) + '\n```';
    const result = parseSummaryResponse(wrapped);
    expect(result.ok).toBe(true);
  });

  it('should accept new red flag categories', () => {
    const withNewCategories = JSON.stringify({
      summary: 'Test',
      keyPoints: [],
      redFlags: [
        { category: 'data_retention', description: 'kept forever', severity: 'high', quote: '' },
        { category: 'ai_training', description: 'trains models', severity: 'high', quote: '' },
        { category: 'government_disclosure', description: 'shared with gov', severity: 'medium', quote: '' },
      ],
      severity: 'high',
    });
    const result = parseSummaryResponse(withNewCategories);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.redFlags).toHaveLength(3);
      expect(result.data.redFlags.map((f) => f.category)).toEqual([
        'data_retention', 'ai_training', 'government_disclosure',
      ]);
    }
  });

  it('should parse tldr field when present', () => {
    const withTldr = JSON.stringify({
      summary: 'A summary.',
      keyPoints: ['point'],
      redFlags: [],
      severity: 'low',
      tldr: 'They collect everything.',
    });
    const result = parseSummaryResponse(withTldr);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tldr).toBe('They collect everything.');
    }
  });

  it('should leave tldr undefined when not present', () => {
    const withoutTldr = JSON.stringify({
      summary: 'A summary.',
      keyPoints: [],
      redFlags: [],
      severity: 'low',
    });
    const result = parseSummaryResponse(withoutTldr);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.tldr).toBeUndefined();
    }
  });

  it('should filter invalid red flag categories', () => {
    const withBadCategory = JSON.stringify({
      summary: 'Test',
      keyPoints: [],
      redFlags: [
        { category: 'not_a_real_category', description: 'test', severity: 'high', quote: 'test' },
        { category: 'data_selling', description: 'test', severity: 'high', quote: 'test' },
      ],
      severity: 'high',
    });
    const result = parseSummaryResponse(withBadCategory);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.redFlags).toHaveLength(1);
      expect(result.data.redFlags[0]!.category).toBe('data_selling');
    }
  });
});
