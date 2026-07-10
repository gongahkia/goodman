import { describe, expect, it } from 'vitest';
import { CONSENT_DARK_PATTERN_CATALOG } from '@shared/dark-patterns';

describe('CONSENT_DARK_PATTERN_CATALOG', () => {
  it('covers the initial consent dark-pattern signals', () => {
    const ids = CONSENT_DARK_PATTERN_CATALOG.map((entry) => entry.id);

    expect(ids).toContain('accept_all_without_equal_reject');
    expect(ids).toContain('prechecked_data_opt_in');
    expect(ids).toContain('hidden_reject_path');
    expect(ids).toContain('coercive_continue_copy');
  });

  it('keeps rules tuneable through catalog metadata', () => {
    for (const entry of CONSENT_DARK_PATTERN_CATALOG) {
      expect(['low', 'medium', 'high']).toContain(entry.defaultSeverity);
      expect(entry.evidenceHint.length).toBeGreaterThan(0);
      expect(entry.sources.length).toBeGreaterThan(0);
    }
  });
});
