import { describe, it, expect, afterEach } from 'vitest';
import { detectFullPageTC } from '@content/detectors/fullpage';

describe('detectFullPageTC', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should detect full page with legal text exceeding threshold', () => {
    const root = document.createElement('div');
    const legalText = Array(100)
      .fill(
        'Terms and conditions. Privacy policy. Agreement. Liability. Jurisdiction. Consent. ' +
          'Indemnify. Warranty. Disclaimer. Termination. Intellectual property. Governing law.'
      )
      .join(' ');
    root.textContent = legalText;
    document.body.appendChild(root);

    const result = detectFullPageTC(root);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('fullpage');
    expect(result!.confidence).toBeGreaterThanOrEqual(0.3);
  });

  it('should NOT detect a short blog post', () => {
    const root = document.createElement('div');
    root.textContent = 'This is a blog post about terms. Short content.';
    document.body.appendChild(root);

    const result = detectFullPageTC(root);

    expect(result).toBeNull();
  });

  it('should NOT detect regular content with few legal keywords', () => {
    const root = document.createElement('div');
    const normalText = Array(500)
      .fill('The quick brown fox jumps over the lazy dog. Technology and innovation are important.')
      .join(' ');
    root.textContent = normalText;
    document.body.appendChild(root);

    const result = detectFullPageTC(root);

    expect(result).toBeNull();
  });
});
