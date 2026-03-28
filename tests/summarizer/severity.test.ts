import { describe, it, expect } from 'vitest';
import { computeSeverity } from '@summarizer/severity';
import type { RedFlag } from '@providers/types';

function makeFlag(severity: 'low' | 'medium' | 'high', category = 'liability_limitation' as const): RedFlag {
  return { category, description: 'test', severity, quote: 'test' };
}

describe('computeSeverity', () => {
  it('should return low for zero red flags', () => {
    expect(computeSeverity([])).toBe('low');
  });

  it('should return medium for one medium flag', () => {
    expect(computeSeverity([makeFlag('medium')])).toBe('medium');
  });

  it('should return high for two high flags (6 points)', () => {
    expect(computeSeverity([makeFlag('high'), makeFlag('high')])).toBe('high');
  });

  it('should return critical for three high flags (9 points)', () => {
    expect(computeSeverity([
      makeFlag('high'),
      makeFlag('high'),
      makeFlag('high'),
    ])).toBe('critical');
  });

  it('should return at least high for data_selling with high severity', () => {
    const flags = [makeFlag('high', 'data_selling')];
    const result = computeSeverity(flags);
    expect(['high', 'critical']).toContain(result);
  });

  it('should return at least high for biometric_data with high severity', () => {
    const flags = [makeFlag('high', 'biometric_data')];
    const result = computeSeverity(flags);
    expect(['high', 'critical']).toContain(result);
  });

  it('should return at least high for ai_training with high severity', () => {
    const flags = [makeFlag('high', 'ai_training')];
    const result = computeSeverity(flags);
    expect(['high', 'critical']).toContain(result);
  });

  it('should return medium for one low flag (1 point)', () => {
    expect(computeSeverity([makeFlag('low')])).toBe('medium');
  });

  it('should return high for 4 points (two medium flags)', () => {
    expect(computeSeverity([makeFlag('medium'), makeFlag('medium')])).toBe('high');
  });
});
