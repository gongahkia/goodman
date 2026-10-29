import { describe, it, expect, beforeEach } from 'vitest';
import { detectCheckboxes } from '@content/detectors/checkbox';
import { detectImplicitConsent } from '@content/detectors/implicit';
import { detectModals } from '@content/detectors/modal';
import { getDetectionRoots } from '@content/detectors/roots';
import { scoreDetections } from '@content/detectors/scoring';

const terms =
  'By continuing, I agree to the terms and conditions and privacy policy. We collect data under this agreement. '.repeat(
    3
  );
const scan = () =>
  scoreDetections(
    getDetectionRoots(document.body).flatMap((root) => [
      ...detectCheckboxes(root),
      ...detectImplicitConsent(root),
      ...detectModals(root),
    ]),
    'conservative'
  );
describe('consent coverage matrix', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  it.each(['input type="checkbox"', 'span role="checkbox" aria-checked="false"'])(
    'detects %s',
    (control) => {
      document.body.innerHTML = `<form><label><${control}></${control.split(' ')[0]}>${terms}<a href="/terms">Terms</a></label><button>Continue</button></form>`;
      expect(scan()[0]?.type).toBe('checkbox');
      expect(scan()[0]?.weightedConfidence).toBeLessThanOrEqual(1);
    }
  );
  it('detects a fixed banner at the default threshold', () => {
    document.body.innerHTML = `<div id="cookie-consent" style="position:fixed;bottom:0">${terms}<button>Accept</button><button>Reject</button></div>`;
    expect(scan().length).toBeGreaterThan(0);
  });
  it('detects implicit consent tied to a form action', () => {
    document.body.innerHTML = `<form><p>${terms}<a href="/terms">Terms</a></p><button>Create account</button></form>`;
    expect(scan()[0]?.type).toBe('implicit');
  });
  it('detects consent in an open shadow tree', () => {
    const host = document.createElement('div');
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML =
      `<label><input type="checkbox">${terms}<a href="/terms">Terms</a></label>`;
    expect(scan()[0]?.type).toBe('checkbox');
  });
  it('ignores consent modals inside a hidden shadow host', () => {
    const host = document.createElement('div');
    host.hidden = true;
    document.body.append(host);
    host.attachShadow({ mode: 'open' }).innerHTML =
      `<div role="dialog" class="cookie-banner">${terms}<button>Accept</button></div>`;
    expect(scan()).toHaveLength(0);
  });
  it.each([
    '我同意服务条款和隐私政策',
    'Acepto los términos y condiciones de privacidad',
    'J’accepte les conditions générales et la confidentialité',
    'Nutzungsbedingungen und Datenschutz akzeptieren',
  ])('recognizes supported language: %s', (text) => {
    document.body.innerHTML = `<form><p>${text} <a href="/terms">Terms</a></p><button>Continue</button></form>`;
    expect(scan()[0]?.type).toBe('implicit');
  });
  it.each([
    `<form><label><input type="checkbox">Subscribe to our newsletter</label><button>Subscribe</button></form>`,
    `<footer><p>${terms}</p><button>Continue</button></footer>`,
    `<form hidden><label><input type="checkbox">${terms}</label><button>Continue</button></form>`,
  ])('does not detect unrelated, passive, or hidden content', (html) => {
    document.body.innerHTML = html;
    expect(scan()).toHaveLength(0);
  });
});
