export interface RawCorpusContribution {
  legalText?: unknown;
  hostname?: unknown;
  url?: unknown;
  capturedAt?: unknown;
  summary?: unknown;
  diff?: unknown;
  [key: string]: unknown;
}

export interface CorpusSummaryMetadata {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  keyPoints?: string[];
  redFlags?: Array<{
    category: string;
    severity: 'low' | 'medium' | 'high';
  }>;
}

export interface CorpusDiffMetadata {
  addedRedFlags?: number;
  removedRedFlags?: number;
  summaryChanged?: boolean;
  changedSections?: string[];
}

export interface SanitizedCorpusContribution {
  schemaVersion: 1;
  hostname: string;
  capturedAt: string;
  legalText: string;
  summary?: CorpusSummaryMetadata;
  diff?: CorpusDiffMetadata;
}

export type CorpusIntakeResult =
  | { ok: true; data: SanitizedCorpusContribution }
  | { ok: false; error: string };

const LEGAL_TEXT_PATTERN = /\b(terms|conditions|agreement|privacy|policy|service|liability|arbitration|license|consent|contract)\b/i;
const MAX_LEGAL_TEXT_LENGTH = 250_000;
const MAX_METADATA_ITEMS = 25;

export function sanitizeCorpusContribution(input: RawCorpusContribution): CorpusIntakeResult {
  const hostname = normalizeHostname(input.hostname ?? input.url);
  if (!hostname) return { ok: false, error: 'hostname_required' };

  const capturedAt = normalizeTimestamp(input.capturedAt);
  if (!capturedAt) return { ok: false, error: 'captured_at_required' };

  const legalText = normalizeLegalText(input.legalText);
  if (!legalText) return { ok: false, error: 'legal_text_required' };

  const summary = sanitizeSummary(input.summary);
  const diff = sanitizeDiff(input.diff);
  return {
    ok: true,
    data: {
      schemaVersion: 1,
      hostname,
      capturedAt,
      legalText,
      ...(summary ? { summary } : {}),
      ...(diff ? { diff } : {}),
    },
  };
}

function normalizeHostname(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeLegalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length < 50 || text.length > MAX_LEGAL_TEXT_LENGTH) return null;
  if (!LEGAL_TEXT_PATTERN.test(text)) return null;
  return text;
}

function sanitizeSummary(value: unknown): CorpusSummaryMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const summary: CorpusSummaryMetadata = {};
  const severity = input['severity'];
  if (isSummarySeverity(severity)) summary.severity = severity;
  const keyPoints = toStringList(input['keyPoints']);
  if (keyPoints.length > 0) summary.keyPoints = keyPoints;
  const redFlags = toRedFlags(input['redFlags']);
  if (redFlags.length > 0) summary.redFlags = redFlags;
  return Object.keys(summary).length > 0 ? summary : undefined;
}

function sanitizeDiff(value: unknown): CorpusDiffMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>;
  const diff: CorpusDiffMetadata = {};
  const addedRedFlags = toNonNegativeInteger(input['addedRedFlags']);
  if (addedRedFlags !== null) diff.addedRedFlags = addedRedFlags;
  const removedRedFlags = toNonNegativeInteger(input['removedRedFlags']);
  if (removedRedFlags !== null) diff.removedRedFlags = removedRedFlags;
  if (typeof input['summaryChanged'] === 'boolean') diff.summaryChanged = input['summaryChanged'];
  const changedSections = toStringList(input['changedSections']);
  if (changedSections.length > 0) diff.changedSections = changedSections;
  return Object.keys(diff).length > 0 ? diff : undefined;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, MAX_METADATA_ITEMS);
}

function toRedFlags(value: unknown): NonNullable<CorpusSummaryMetadata['redFlags']> {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const category = typeof record['category'] === 'string' ? record['category'].trim() : '';
      const severity = record['severity'];
      if (!category || !isRedFlagSeverity(severity)) return null;
      return { category, severity };
    })
    .filter((item): item is NonNullable<CorpusSummaryMetadata['redFlags']>[number] => item !== null)
    .slice(0, MAX_METADATA_ITEMS);
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function isSummarySeverity(value: unknown): value is NonNullable<CorpusSummaryMetadata['severity']> {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isRedFlagSeverity(value: unknown): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}
