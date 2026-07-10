import { describe, expect, it } from 'vitest';
import {
  CLAUSE_TAXONOMY,
  groupRedFlagsByClauseTaxonomy,
  normalizeClauseTaxonomyWeights,
  type ClauseFlag,
} from '@shared/clause-taxonomy';

describe('clause taxonomy', () => {
  it('labels the initial 10 red-flag clause categories', () => {
    const samples: Array<[string, ClauseFlag]> = [
      ['arbitration', flag('arbitration_clause', 'Mandatory arbitration applies.', 'private arbitration')],
      ['liability_cap', flag('liability_limitation', 'Liability is capped.', 'limited liability')],
      ['ip_grant', flag('content_ownership_transfer', 'You grant a perpetual license.', 'perpetual license')],
      ['data_share', flag('third_party_sharing', 'Data is shared with partners.', 'share data')],
      ['governing_law', flag('jurisdiction_change', 'Delaware law governs.', 'governing law')],
      ['unilateral_amendment', flag('unilateral_changes', 'Terms may change without notice.', 'without notice')],
      ['perpetual_term', flag('automatic_renewal', 'Subscription automatically renews.', 'automatically renew')],
      ['exclusivity', flag('other', 'You agree to an exclusive non-compete.', 'exclusive non-compete')],
      ['dispute_costs', flag('other', 'You must pay attorney fees.', 'attorney fees')],
      ['account_termination', flag('no_deletion_right', 'Account may be suspended without refund.', 'suspend account')],
    ];

    const labels = new Set(samples.flatMap(([, sample]) =>
      groupRedFlagsByClauseTaxonomy([sample]).map(group => group.category.id)
    ));

    expect(labels).toEqual(new Set(CLAUSE_TAXONOMY.map(category => category.id)));
  });

  it('uses tunable weights for severity-weighted sorting', () => {
    const groups = groupRedFlagsByClauseTaxonomy([
      flag('arbitration_clause', 'Arbitration applies.', 'arbitration', 'low'),
      flag('third_party_sharing', 'Data is shared.', 'share data', 'high'),
    ], normalizeClauseTaxonomyWeights({
      arbitration: 10,
      data_share: 1,
    }));

    expect(groups[0]?.category.id).toBe('arbitration');
  });
});

function flag(
  category: string,
  description: string,
  quote: string,
  severity = 'high'
): ClauseFlag {
  return {
    category,
    description,
    quote,
    severity,
  };
}
