import type { RedFlag, RedFlagSeverity } from '@providers/types';

const SEVERITY_RANK: Record<RedFlagSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function deduplicateRedFlagsBySeverity(flags: RedFlag[]): RedFlag[] {
  const seen = new Map<string, RedFlag>();

  for (const flag of flags) {
    const existing = seen.get(flag.category);
    if (!existing || hasHigherSeverity(flag.severity, existing.severity)) {
      seen.set(flag.category, flag);
    }
  }

  return [...seen.values()];
}

function hasHigherSeverity(
  candidate: RedFlagSeverity,
  current: RedFlagSeverity
): boolean {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current];
}
