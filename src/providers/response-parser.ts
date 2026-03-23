import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { InvalidResponseError } from '@shared/errors';
import type { TCGuardError } from '@shared/errors';
import type { Summary, RedFlag, RedFlagCategory, Severity, RedFlagSeverity } from './types';

const VALID_CATEGORIES: RedFlagCategory[] = [
  'data_selling', 'arbitration_clause', 'class_action_waiver',
  'automatic_renewal', 'biometric_data', 'third_party_sharing',
  'jurisdiction_change', 'liability_limitation', 'content_ownership_transfer',
  'unilateral_changes', 'no_deletion_right', 'location_tracking',
];

const VALID_SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];
const VALID_FLAG_SEVERITIES: RedFlagSeverity[] = ['low', 'medium', 'high'];

export function parseSummaryResponse(
  raw: string
): Result<Summary, TCGuardError> {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;

    if (!parsed || typeof parsed !== 'object') {
      return err(new InvalidResponseError('Response is not an object'));
    }

    const obj = parsed as Record<string, unknown>;
    const summary = parseSummaryObject(obj);
    return ok(summary);
  } catch (e) {
    if (e instanceof InvalidResponseError) return err(e);
    return err(new InvalidResponseError('Failed to parse JSON response'));
  }
}

export function parseSummaryObject(raw: unknown): Summary {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidResponseError('Response is not an object');
  }

  return validateSummary(raw as Record<string, unknown>);
}

function validateSummary(obj: Record<string, unknown>): Summary {
  const summary = typeof obj['summary'] === 'string' ? obj['summary'] : 'Summary unavailable.';

  const keyPoints = Array.isArray(obj['keyPoints'])
    ? (obj['keyPoints'] as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];

  const redFlags = Array.isArray(obj['redFlags'])
    ? (obj['redFlags'] as unknown[]).map(validateRedFlag).filter((f): f is RedFlag => f !== null)
    : [];

  const severity = VALID_SEVERITIES.includes(obj['severity'] as Severity)
    ? (obj['severity'] as Severity)
    : 'medium';

  return { summary, keyPoints, redFlags, severity };
}

function validateRedFlag(raw: unknown): RedFlag | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const category = VALID_CATEGORIES.includes(obj['category'] as RedFlagCategory)
    ? (obj['category'] as RedFlagCategory)
    : null;

  if (!category) return null;

  const description = typeof obj['description'] === 'string' ? obj['description'] : '';
  const severity = VALID_FLAG_SEVERITIES.includes(obj['severity'] as RedFlagSeverity)
    ? (obj['severity'] as RedFlagSeverity)
    : 'medium';
  const quote = typeof obj['quote'] === 'string' ? obj['quote'] : '';

  return { category, description, severity, quote };
}
