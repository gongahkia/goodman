export type WatchClauseId =
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

export type NotificationThreshold = 'any' | 'material' | 'red_flag_only';

export interface DomainPreferences {
  watchClauses: WatchClauseId[];
  notificationThreshold: NotificationThreshold;
  summaryLanguage: string;
  ignorePatterns: string[];
}

export interface WatchClauseOption {
  id: WatchClauseId;
  label: string;
  providerCategories: string[];
  keywords: string[];
}

export const DEFAULT_DOMAIN_PREFERENCES: DomainPreferences = {
  watchClauses: [],
  notificationThreshold: 'any',
  summaryLanguage: '',
  ignorePatterns: [],
};

export const WATCH_CLAUSE_OPTIONS: WatchClauseOption[] = [
  {
    id: 'arbitration',
    label: 'Arbitration',
    providerCategories: ['arbitration_clause', 'class_action_waiver'],
    keywords: ['arbitration', 'class action', 'jury trial'],
  },
  {
    id: 'liability_cap',
    label: 'Liability cap',
    providerCategories: ['liability_limitation'],
    keywords: ['liability', 'indemnity', 'damages'],
  },
  {
    id: 'ip_grant',
    label: 'IP grant',
    providerCategories: ['content_ownership_transfer'],
    keywords: ['license', 'content ownership', 'perpetual'],
  },
  {
    id: 'data_share',
    label: 'Data sharing',
    providerCategories: ['data_selling', 'third_party_sharing', 'ai_training', 'government_disclosure'],
    keywords: ['data', 'third party', 'share', 'sell', 'training'],
  },
  {
    id: 'governing_law',
    label: 'Governing law',
    providerCategories: ['jurisdiction_change'],
    keywords: ['jurisdiction', 'governing law', 'forum'],
  },
  {
    id: 'unilateral_amendment',
    label: 'Unilateral changes',
    providerCategories: ['unilateral_changes'],
    keywords: ['change terms', 'modify', 'notice'],
  },
  {
    id: 'perpetual_term',
    label: 'Perpetual term',
    providerCategories: ['automatic_renewal', 'data_retention'],
    keywords: ['auto renew', 'survive', 'retention', 'perpetual'],
  },
  {
    id: 'exclusivity',
    label: 'Exclusivity',
    providerCategories: [],
    keywords: ['exclusive', 'non-compete', 'non compete'],
  },
  {
    id: 'dispute_costs',
    label: 'Dispute costs',
    providerCategories: [],
    keywords: ['fee shifting', 'attorney fees', 'costs'],
  },
  {
    id: 'account_termination',
    label: 'Account termination',
    providerCategories: ['no_deletion_right'],
    keywords: ['terminate', 'account', 'refund', 'deletion'],
  },
];

const WATCH_CLAUSE_IDS = new Set(WATCH_CLAUSE_OPTIONS.map(option => option.id));
const THRESHOLDS = new Set<NotificationThreshold>(['any', 'material', 'red_flag_only']);
const MAX_IGNORE_PATTERNS = 10;
const MAX_LANGUAGE_LENGTH = 40;
const MAX_PATTERN_LENGTH = 120;

export function normalizeDomainPreferences(value: unknown): DomainPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_DOMAIN_PREFERENCES };
  const input = value as Record<string, unknown>;
  return {
    watchClauses: normalizeWatchClauses(input['watchClauses']),
    notificationThreshold: normalizeThreshold(input['notificationThreshold']),
    summaryLanguage: normalizeSummaryLanguage(input['summaryLanguage']),
    ignorePatterns: normalizeIgnorePatterns(input['ignorePatterns']),
  };
}

export function matchesWatchedClause(
  category: string,
  watchClauses: WatchClauseId[],
  text = ''
): boolean {
  if (watchClauses.length === 0) return true;
  const normalizedCategory = normalizeToken(category);
  const normalizedText = text.toLowerCase();
  return watchClauses.some(id => {
    const option = WATCH_CLAUSE_OPTIONS.find(item => item.id === id);
    if (!option) return false;
    if (option.providerCategories.some(item => normalizeToken(item) === normalizedCategory)) return true;
    return option.keywords.some(keyword => normalizedText.includes(keyword));
  });
}

function normalizeWatchClauses(value: unknown): WatchClauseId[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.filter((item): item is WatchClauseId =>
      typeof item === 'string' && WATCH_CLAUSE_IDS.has(item as WatchClauseId)
    )
  ));
}

function normalizeThreshold(value: unknown): NotificationThreshold {
  return typeof value === 'string' && THRESHOLDS.has(value as NotificationThreshold)
    ? value as NotificationThreshold
    : DEFAULT_DOMAIN_PREFERENCES.notificationThreshold;
}

function normalizeSummaryLanguage(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_LANGUAGE_LENGTH);
}

function normalizeIgnorePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, MAX_PATTERN_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_IGNORE_PATTERNS);
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
