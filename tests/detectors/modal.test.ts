import { describe, it, expect, afterEach } from 'vitest';
import { detectModals } from '@content/detectors/modal';

describe('detectModals', () => {
  afterEach(() => {
    document.body.innerHTML = '';
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
