import { describe, it, expect, afterEach } from 'vitest';
import { extractInlineText } from '@content/extractors/inline';
import type { DetectedElement } from '@content/detectors/checkbox';

describe('extractInlineText', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should extract text from parent form container', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <p>By checking this box, you agree to our terms and conditions.</p>
      <p>We collect personal data including name, email, and usage data.</p>
      <p>Your data may be shared with third-party advertising partners.</p>
      <input type="checkbox" id="agree">
      <label for="agree">I agree</label>
    `;
    document.body.appendChild(form);

    const checkbox = form.querySelector('input') as HTMLElement;
    const detection: DetectedElement = {
      element: checkbox,
      type: 'checkbox',
      confidence: 0.9,
      keywords: ['terms'],
      nearestLink: null,
    };

    const text = extractInlineText(detection);

    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('terms and conditions');
  });

  it('should expand to parent container if text too short', () => {
    const outerDiv = document.createElement('div');
    outerDiv.innerHTML = `
      <p>These are the complete terms of service for our platform. You must read and agree to them before using our services. We collect and process your personal data as described below.</p>
      <div>
        <input type="checkbox" id="cb">
        <label for="cb">Agree</label>
      </div>
    `;
    document.body.appendChild(outerDiv);

    const checkbox = outerDiv.querySelector('input') as HTMLElement;
    const detection: DetectedElement = {
      element: checkbox,
      type: 'checkbox',
      confidence: 0.8,
      keywords: ['terms'],
      nearestLink: null,
    };

    const text = extractInlineText(detection);

    expect(text.length).toBeGreaterThanOrEqual(100);
  });
});
