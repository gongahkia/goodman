import { afterEach, describe, expect, it } from 'vitest';
import { detectConsentDarkPatterns } from '@content/detectors/dark-patterns';

describe('detectConsentDarkPatterns', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('flags accept-all controls without a visible reject-all path', () => {
    const root = render(`
      <div>
        <p>We use cookies for analytics, advertising, personalization, and partner measurement across this website.</p>
        <button class="primary">Accept All Cookies</button>
        <button>Manage Preferences</button>
      </div>
    `);

    const findings = detectConsentDarkPatterns(root);

    expect(findings).toContainEqual(expect.objectContaining({
      id: 'accept_all_without_equal_reject',
      severity: 'medium',
    }));
    expect(findings[0]!.evidence).toContain('Accept All Cookies');
  });

  it('flags pre-checked analytics or data-sharing choices', () => {
    const root = render(`
      <div>
        <input type="checkbox" id="analytics" checked>
        <label for="analytics">Share analytics and advertising data with third-party partners</label>
      </div>
    `);

    const findings = detectConsentDarkPatterns(root);

    expect(findings).toContainEqual(expect.objectContaining({
      id: 'prechecked_data_opt_in',
      severity: 'high',
    }));
  });

  it('flags hidden reject controls', () => {
    const root = render(`
      <div>
        <p>We use cookies for analytics and advertising. Choose how your data is processed.</p>
        <button>Accept All Cookies</button>
        <button style="display: none">Reject All</button>
      </div>
    `);

    const findings = detectConsentDarkPatterns(root);

    expect(findings).toContainEqual(expect.objectContaining({
      id: 'hidden_reject_path',
      severity: 'high',
    }));
  });

  it('flags agree-to-continue copy with no decline path', () => {
    const root = render(`
      <div>
        <p>You must agree to continue using this service and allow cookie processing for analytics.</p>
        <button>I Agree</button>
      </div>
    `);

    const findings = detectConsentDarkPatterns(root);

    expect(findings).toContainEqual(expect.objectContaining({
      id: 'coercive_continue_copy',
      severity: 'medium',
    }));
  });

  it('does not flag balanced accept and reject controls', () => {
    const root = render(`
      <div>
        <p>We use cookies for analytics. Choose whether to allow optional cookies.</p>
        <button>Accept All Cookies</button>
        <button>Reject All Cookies</button>
      </div>
    `);

    const findings = detectConsentDarkPatterns(root);

    expect(findings).toHaveLength(0);
  });
});

function render(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}
