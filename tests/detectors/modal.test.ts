import { describe, it, expect, afterEach } from 'vitest';
import { detectModals } from '@content/detectors/modal';

describe('detectModals', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const legalCopy =
    'Read the terms and conditions, privacy policy, cookie policy and data processing agreement. These legal documents describe consent, responsibilities, recurring billing, cancellation rights and governing law.';

  it.each(['Acceptable Use Policies', 'Data Processing Agreement', 'Manageable Licenses'])(
    'does not mistake the navigation label %s for a consent action',
    (label) => {
      document.body.innerHTML = `<div class="sidebar" style="position:sticky"><p>${legalCopy}</p><a href="/site-policy">${label}</a></div>`;
      expect(detectModals(document.body)).toHaveLength(0);
    }
  );

  it.each(['hidden', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:hidden"'])(
    'ignores a hidden ancestor (%s) around an otherwise valid consent dialog',
    (attribute) => {
      document.body.innerHTML = `<div ${attribute}><div role="dialog"><p>${legalCopy}</p><button>Accept all cookies</button></div></div>`;
      expect(detectModals(document.body)).toHaveLength(0);
    }
  );

  it('retains a visible consent action implemented as an anchor', () => {
    document.body.innerHTML = `<div class="cookie-consent" style="position:fixed"><p>${legalCopy}</p><a href="#consent">I agree</a></div>`;
    expect(detectModals(document.body)).toHaveLength(1);
  });

  it('does not treat navigation controls as consent actions in a sticky parent', () => {
    document.body.innerHTML = `<div style="position:sticky"><p>${legalCopy}</p><nav><button>Manage account</button></nav></div>`;
    expect(detectModals(document.body)).toHaveLength(0);
  });

  it('should detect cookie consent banner by class', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="cookie-consent" style="position: fixed; bottom: 0;">
        <p>We use cookies and similar tracking technologies to ensure you get the best experience on our website. By continuing to browse, you agree to our cookie policy and the use of cookies for analytics, personalization, and advertising purposes. You can manage your preferences at any time.</p>
        <button>Accept All</button>
        <button>Manage</button>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(results[0]!.darkPatterns).toContainEqual(
      expect.objectContaining({
        id: 'accept_all_without_equal_reject',
      })
    );
  });

  it('attaches dark-pattern findings to consent modals', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div role="dialog">
        <h2>Cookie Preferences</h2>
        <p>We use cookies and similar technologies for analytics, advertising, personalization, and partner measurement. You must agree to continue using this service and allow processing for these purposes.</p>
        <button>Accept All Cookies</button>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.darkPatterns).toContainEqual(
      expect.objectContaining({
        id: 'coercive_continue_copy',
        severity: 'high',
      })
    );
  });

  it('should detect dialog with role and terms heading', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div role="dialog">
        <h2>Terms of Service</h2>
        <p>Please read and agree to our terms and conditions before proceeding. By clicking the button below, you acknowledge that you have read, understood, and agree to be bound by these terms and conditions, including our privacy policy and data processing agreement.</p>
        <button>I Agree</button>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.type).toBe('modal');
  });

  it('should NOT detect ultra-short cookie banner', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="cookie-consent" style="position: fixed; bottom: 0;">
        <p>We use cookies.</p>
        <button>Accept</button>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);
    expect(results).toHaveLength(0);
  });

  it('should NOT detect regular navigation bar', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <nav>
        <a href="/">Home</a>
        <a href="/about">About</a>
        <a href="/contact">Contact</a>
      </nav>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);

    expect(results).toHaveLength(0);
  });
});
