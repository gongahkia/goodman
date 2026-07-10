import { afterEach, describe, expect, it } from 'vitest';
import { detectConsentDarkPatterns } from '@content/detectors/dark-patterns';
import { DARK_PATTERN_CONSENT_FIXTURES } from '../fixtures/dark-pattern-consent';

describe('dark-pattern consent fixtures', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  for (const fixture of DARK_PATTERN_CONSENT_FIXTURES) {
    it(`matches ${fixture.id}`, () => {
      const root = document.createElement('main');
      root.innerHTML = fixture.html;
      document.body.appendChild(root);

      const findings = detectConsentDarkPatterns(root);

      expect(findings.map((finding) => ({
        id: finding.id,
        severity: finding.severity,
      }))).toEqual(expect.arrayContaining(fixture.expectedFindings));
      if (fixture.expectedFindings.length === 0) {
        expect(findings).toHaveLength(0);
      }
    });
  }

  it('documents public fixture sources without private user data', () => {
    for (const fixture of DARK_PATTERN_CONSENT_FIXTURES) {
      expect(fixture.sourceUrl).toMatch(/^https:\/\//);
      expect(fixture.html).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    }
  });
});
