export type ClauseTaxonomyId =
  | 'arbitration'
  | 'liability_cap'
  | 'ip_grant'
  | 'data_share'
  | 'governing_law'
  | 'unilateral_amendment'
  | 'perpetual_term'
  | 'exclusivity'
  | 'dispute_costs'
  | 'account_termination';

export interface ClauseTaxonomyCategory {
  id: ClauseTaxonomyId;
  label: string;
  description: string;
  color: string;
  defaultWeight: number;
  providerCategories: string[];
  keywords: string[];
}

export interface ClauseFlag {
  category: string;
  description: string;
  severity: string;
  quote: string;
}

export interface ClauseTaxonomyGroup {
  category: ClauseTaxonomyCategory;
  flags: ClauseFlag[];
  score: number;
}

export type ClauseTaxonomyWeights = Record<ClauseTaxonomyId, number>;

export const CLAUSE_TAXONOMY: ClauseTaxonomyCategory[] = [
  {
    id: 'arbitration',
    label: 'Arbitration',
    description: 'Mandatory arbitration, jury-trial waiver, or class-action waiver.',
    color: '#8f5fd3',
    defaultWeight: 5,
    providerCategories: ['arbitration_clause', 'class_action_waiver'],
    keywords: ['arbitration', 'class action', 'jury trial'],
  },
  {
    id: 'liability_cap',
    label: 'Liability cap',
    description: 'Disclaimers, indemnities, warranty exclusions, or damages caps.',
    color: '#c4662d',
    defaultWeight: 4,
    providerCategories: ['liability_limitation'],
    keywords: ['liability', 'indemnify', 'indemnity', 'damages', 'warranty'],
  },
  {
    id: 'ip_grant',
    label: 'IP grant',
    description: 'Broad, perpetual, or irrevocable licence over user content.',
    color: '#277da1',
    defaultWeight: 4,
    providerCategories: ['content_ownership_transfer'],
    keywords: ['content', 'license', 'licence', 'perpetual', 'irrevocable'],
  },
  {
    id: 'data_share',
    label: 'Data sharing',
    description: 'Third-party data sharing, selling, government disclosure, or AI training.',
    color: '#2f855a',
    defaultWeight: 5,
    providerCategories: ['data_selling', 'third_party_sharing', 'ai_training', 'government_disclosure', 'biometric_data', 'location_tracking'],
    keywords: ['data', 'third party', 'share', 'sell', 'ai training', 'biometric', 'location'],
  },
  {
    id: 'governing_law',
    label: 'Governing law',
    description: 'Non-local jurisdiction, forum selection, or venue requirement.',
    color: '#6b7280',
    defaultWeight: 3,
    providerCategories: ['jurisdiction_change'],
    keywords: ['governing law', 'jurisdiction', 'forum', 'venue'],
  },
  {
    id: 'unilateral_amendment',
    label: 'Unilateral changes',
    description: 'Vendor can change terms without meaningful notice or consent.',
    color: '#b07b12',
    defaultWeight: 4,
    providerCategories: ['unilateral_changes'],
    keywords: ['modify', 'change these terms', 'without notice', 'sole discretion'],
  },
  {
    id: 'perpetual_term',
    label: 'Perpetual term',
    description: 'Auto-renewal, survival of clauses, or indefinite retention.',
    color: '#9b5a2e',
    defaultWeight: 3,
    providerCategories: ['automatic_renewal', 'data_retention'],
    keywords: ['auto-renew', 'automatically renew', 'survive', 'survival', 'indefinite'],
  },
  {
    id: 'exclusivity',
    label: 'Exclusivity',
    description: 'Non-compete, exclusivity, or exclusive dealing restrictions.',
    color: '#4d7c0f',
    defaultWeight: 3,
    providerCategories: [],
    keywords: ['exclusive', 'exclusivity', 'non-compete', 'non compete'],
  },
  {
    id: 'dispute_costs',
    label: 'Dispute costs',
    description: 'Fee-shifting, loser-pays, or attorney-fee burden.',
    color: '#be123c',
    defaultWeight: 4,
    providerCategories: [],
    keywords: ['fee shifting', 'attorney fees', 'legal costs', 'costs of dispute'],
  },
  {
    id: 'account_termination',
    label: 'Account termination',
    description: 'At-will termination, no refund, suspension, or deletion limits.',
    color: '#0f766e',
    defaultWeight: 4,
    providerCategories: ['no_deletion_right'],
    keywords: ['terminate', 'suspend', 'no refund', 'delete your account', 'deletion'],
  },
];

const TAXONOMY_IDS = new Set(CLAUSE_TAXONOMY.map(category => category.id));
const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const DEFAULT_CLAUSE_TAXONOMY_WEIGHTS: ClauseTaxonomyWeights = Object.fromEntries(
  CLAUSE_TAXONOMY.map(category => [category.id, category.defaultWeight])
) as ClauseTaxonomyWeights;

export function normalizeClauseTaxonomyWeights(value: unknown): ClauseTaxonomyWeights {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CLAUSE_TAXONOMY_WEIGHTS };
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    CLAUSE_TAXONOMY.map(category => [
      category.id,
      normalizeWeight(input[category.id], category.defaultWeight),
    ])
  ) as ClauseTaxonomyWeights;
}

export function groupRedFlagsByClauseTaxonomy(
  flags: ClauseFlag[],
  weights: ClauseTaxonomyWeights = DEFAULT_CLAUSE_TAXONOMY_WEIGHTS
): ClauseTaxonomyGroup[] {
  const groups = new Map<ClauseTaxonomyId, ClauseTaxonomyGroup>();

  for (const flag of flags) {
    for (const category of CLAUSE_TAXONOMY) {
      if (!matchesCategory(flag, category)) continue;
      const existing = groups.get(category.id) ?? {
        category,
        flags: [],
        score: 0,
      };
      existing.flags.push(flag);
      existing.score += (SEVERITY_RANK[flag.severity] ?? 1) * weights[category.id];
      groups.set(category.id, existing);
    }
  }

  return [...groups.values()].sort((left, right) =>
    right.score - left.score || left.category.label.localeCompare(right.category.label)
  );
}

export function getClauseTaxonomyCategory(id: string): ClauseTaxonomyCategory | null {
  return TAXONOMY_IDS.has(id as ClauseTaxonomyId)
    ? CLAUSE_TAXONOMY.find(category => category.id === id) ?? null
    : null;
}

function matchesCategory(flag: ClauseFlag, category: ClauseTaxonomyCategory): boolean {
  const normalizedCategory = normalizeToken(flag.category);
  if (category.providerCategories.some(item => normalizeToken(item) === normalizedCategory)) return true;
  const haystack = `${flag.category} ${flag.description} ${flag.quote}`.toLowerCase();
  return category.keywords.some(keyword => haystack.includes(keyword));
}

function normalizeWeight(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
