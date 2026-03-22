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
        <p>We use cookies to ensure you get the best experience. By continuing, you agree to our cookie policy.</p>
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
        <p>Please read and agree to our terms and conditions.</p>
        <button>I Agree</button>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectModals(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.type).toBe('modal');
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
