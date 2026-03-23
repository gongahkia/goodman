import { describe, it, expect } from 'vitest';
import { compareSummaries } from '@versioning/summary-diff';
import type { Summary } from '@providers/types';

function makeSummary(overrides: Partial<Summary> = {}): Summary {
  return {
    summary: 'Test summary',
    keyPoints: ['Point one', 'Point two'],
    redFlags: [],
    severity: 'medium',
    ...overrides,
  };
}

describe('compareSummaries', () => {
  it('should detect a new arbitration_clause red flag', () => {
    const oldSummary = makeSummary();
    const newSummary = makeSummary({
      redFlags: [
        { category: 'arbitration_clause', description: 'Mandatory arbitration', severity: 'high', quote: 'binding arbitration' },
      ],
    });

    const diff = compareSummaries(oldSummary, newSummary);

    expect(diff.addedRedFlags).toHaveLength(1);
    expect(diff.addedRedFlags[0]!.category).toBe('arbitration_clause');
  });

  it('should detect a removed red flag', () => {
    const oldSummary = makeSummary({
      redFlags: [
        { category: 'automatic_renewal', description: 'Auto renewal', severity: 'medium', quote: 'auto renews' },
      ],
    });
    const newSummary = makeSummary();

    const diff = compareSummaries(oldSummary, newSummary);

    expect(diff.removedRedFlags).toHaveLength(1);
    expect(diff.removedRedFlags[0]!.category).toBe('automatic_renewal');
  });

  it('should detect severity change', () => {
    const oldSummary = makeSummary({ severity: 'medium' });
    const newSummary = makeSummary({ severity: 'high' });

    const diff = compareSummaries(oldSummary, newSummary);

    expect(diff.severityChange).not.toBeNull();
    expect(diff.severityChange!.old).toBe('medium');
    expect(diff.severityChange!.new).toBe('high');
  });

  it('should detect quote changes for an existing red flag', () => {
    const oldSummary = makeSummary({
      redFlags: [
        {
          category: 'automatic_renewal',
          description: 'Auto renewal',
          severity: 'medium',
          quote: 'Your subscription renews monthly.',
        },
      ],
    });
    const newSummary = makeSummary({
      redFlags: [
        {
          category: 'automatic_renewal',
          description: 'Auto renewal',
          severity: 'medium',
          quote: 'Your subscription renews annually unless cancelled.',
        },
      ],
    });

    const diff = compareSummaries(oldSummary, newSummary);

    expect(diff.changedRedFlags).toHaveLength(1);
    expect(diff.changedRedFlags[0]).toMatchObject({
      old: { quote: 'Your subscription renews monthly.' },
      new: { quote: 'Your subscription renews annually unless cancelled.' },
    });
  });

  it('should match paraphrased key points as the same', () => {
    const oldSummary = makeSummary({ keyPoints: ['Your data is shared with advertisers'] });
    const newSummary = makeSummary({ keyPoints: ['Your data is shared with advertising partners'] });

    const diff = compareSummaries(oldSummary, newSummary);

    expect(diff.newKeyPoints).toHaveLength(0);
    expect(diff.removedKeyPoints).toHaveLength(0);
  });
});
