import type { StoredSummary } from './storage';

export function isStoredSummary(value: unknown): value is StoredSummary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const summary = value as StoredSummary;
  return (
    typeof summary.summary === 'string' &&
    !!summary.summary.trim() &&
    ['low', 'medium', 'high', 'critical'].includes(summary.severity) &&
    Array.isArray(summary.keyPoints) &&
    summary.keyPoints.every((point) => typeof point === 'string') &&
    (!('tldr' in summary) || typeof summary.tldr === 'string') &&
    Array.isArray(summary.redFlags) &&
    summary.redFlags.every(
      (flag) =>
        flag &&
        typeof flag === 'object' &&
        typeof flag.category === 'string' &&
        typeof flag.description === 'string' &&
        typeof flag.quote === 'string' &&
        ['low', 'medium', 'high'].includes(flag.severity)
    )
  );
}

export function copyStoredSummary(summary: StoredSummary): StoredSummary {
  return {
    summary: summary.summary,
    keyPoints: [...summary.keyPoints],
    redFlags: summary.redFlags.map((flag) => ({
      category: flag.category,
      description: flag.description,
      severity: flag.severity,
      quote: flag.quote,
    })),
    severity: summary.severity,
    ...(summary.tldr ? { tldr: summary.tldr } : {}),
  };
}
