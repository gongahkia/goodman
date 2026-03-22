import type { RedFlag, Severity } from '@providers/types';

const SEVERITY_POINTS: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const HIGH_RISK_CATEGORIES = ['data_selling', 'biometric_data'];

export function computeSeverity(redFlags: RedFlag[]): Severity {
  if (redFlags.length === 0) return 'low';

  let totalPoints = 0;
  let hasHighRiskCategory = false;

  for (const flag of redFlags) {
    totalPoints += SEVERITY_POINTS[flag.severity] ?? 0;

    if (
      HIGH_RISK_CATEGORIES.includes(flag.category) &&
      flag.severity === 'high'
    ) {
      hasHighRiskCategory = true;
    }
  }

  let severity: Severity;
  if (totalPoints >= 8) {
    severity = 'critical';
  } else if (totalPoints >= 4) {
    severity = 'high';
  } else if (totalPoints >= 1) {
    severity = 'medium';
  } else {
    severity = 'low';
  }

  if (hasHighRiskCategory && severity === 'medium') {
    severity = 'high';
  }

  return severity;
}
