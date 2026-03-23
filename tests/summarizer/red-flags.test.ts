import { describe, expect, it } from 'vitest';
import { deduplicateRedFlagsBySeverity } from '@summarizer/red-flags';

describe('deduplicateRedFlagsBySeverity', () => {
  it('keeps the highest-severity red flag per category', () => {
    const deduplicated = deduplicateRedFlagsBySeverity([
      {
        category: 'arbitration_clause',
        description: 'Medium risk clause',
        severity: 'medium',
        quote: 'Arbitration may be required.',
      },
      {
        category: 'arbitration_clause',
        description: 'Higher risk clause',
        severity: 'high',
        quote: 'All disputes must be resolved by binding arbitration.',
      },
      {
        category: 'automatic_renewal',
        description: 'Auto renews',
        severity: 'low',
        quote: 'Your plan renews automatically.',
      },
    ]);

    expect(deduplicated).toHaveLength(2);
    expect(
      deduplicated.find((flag) => flag.category === 'arbitration_clause')
    ).toMatchObject({
      description: 'Higher risk clause',
      severity: 'high',
    });
  });
});
