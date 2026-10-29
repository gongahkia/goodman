import { expect, it } from 'vitest';
import { groundSummary } from '@summarizer/evidence';
import { computeSeverity } from '@summarizer/severity';
import { groupRedFlagsByClauseTaxonomy } from '@shared/clause-taxonomy';
import type { Summary } from '@providers/types';
it('keeps source quotations and removes invented evidence without inventing reassurance', () => {
  const input: Summary = { summary: 'Summary', keyPoints: [], severity: 'low', redFlags: [
    { category: 'arbitration_clause', severity: 'high', description: 'Concern', quote: 'Disputes require arbitration.' },
    { category: 'data_selling', severity: 'high', description: 'Unverified', quote: 'We sell your data.' },
  ] };
  const result = groundSummary(input, 'Disputes require\n arbitration.');
  expect(result.redFlags.map(flag => flag.quote)).toEqual(['Disputes require arbitration.', '']);
  expect(result.severity).toBe(computeSeverity(result.redFlags));
});
it('uses the canonical category even when a quotation mentions another concern', () => {
  const groups = groupRedFlagsByClauseTaxonomy([{ category: 'automatic_renewal', severity: 'medium', description: 'Renews', quote: 'Recurring billing and a class action waiver apply.' }]);
  expect(groups.map(group => group.category.id)).toEqual(['perpetual_term']);
});
