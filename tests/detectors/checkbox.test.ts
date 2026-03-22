import { describe, it, expect, afterEach } from 'vitest';
import { detectCheckboxes } from '@content/detectors/checkbox';

describe('detectCheckboxes', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should detect standard checkbox with T&C label with confidence >= 0.8', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <input type="checkbox" id="agree">
      <label for="agree">I agree to the <a href="/terms">Terms and Conditions</a></label>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.confidence).toBeGreaterThanOrEqual(0.8);
    expect(results[0]!.type).toBe('checkbox');
  });

  it('should detect checkbox separated by div wrapper with confidence >= 0.6', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div>
        <input type="checkbox" id="tc">
        <div>
          <span>By checking this box, you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a></span>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('should NOT detect "Remember me" checkbox', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <input type="checkbox" id="remember">
      <label for="remember">Remember me</label>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results).toHaveLength(0);
  });

  it('should return nearest T&C link URL in nearestLink', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <input type="checkbox" id="agree2">
      <label for="agree2">I accept the <a href="/terms-of-service">Terms of Service</a></label>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.nearestLink).toBe('/terms-of-service');
  });

  it('should detect checkbox with label association', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <label><input type="checkbox"> I agree to the terms and conditions and privacy policy</label>
    `;
    document.body.appendChild(root);

    const results = detectCheckboxes(root);

    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
