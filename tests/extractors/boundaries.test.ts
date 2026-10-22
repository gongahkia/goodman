import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractInlineText } from '@content/extractors/inline';
import { extractLinkedText } from '@content/extractors/linked';
import { resolveDetectionTextSource } from '@content/extractors/source';
import { detectCheckboxes, type DetectedElement } from '@content/detectors/checkbox';
import { chrome } from '../mocks/chrome';
import { legalDocumentResponse } from '../mocks/legal-document';

function detection(element: HTMLElement, nearestLink: string | null = null): DetectedElement {
  return { element, nearestLink, type: 'checkbox', confidence: 1, keywords: ['terms'] };
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('legal extraction boundaries', () => {
  it('does not send form entries, hidden text, scripts or extension UI as legal terms', () => {
    const legal =
      'These Terms and Conditions require binding arbitration and recurring billing. '.repeat(3);
    document.body.innerHTML = `<form><p>${legal}</p>
      <textarea>synthetic-private-draft</textarea><select><option>synthetic-private-account</option></select>
      <div contenteditable="true">synthetic-private-editor</div><p hidden>synthetic-private-hidden</p>
      <script>synthetic-private-script</script><style>synthetic-private-css</style>
      <div id="goodman-overlay-host">synthetic-private-extension-output</div>
      <input type="checkbox" id="agree"><label for="agree">I agree to the Terms and Conditions.</label></form>`;
    const text = extractInlineText(detection(document.getElementById('agree')!));
    expect(text).toContain(legal.trim());
    expect(text).not.toContain('synthetic-private-');
    expect(document.querySelector('textarea')?.value).toBe('synthetic-private-draft');
  });

  it('extracts a full-page detection from its body without including head content', () => {
    document.head.innerHTML = '<title>synthetic-private-title</title>';
    document.body.innerHTML = '<main><h1>Terms</h1><p>Binding arbitration applies.</p></main>';
    const text = extractInlineText({ ...detection(document.body), type: 'fullpage' });
    expect(text).toContain('Binding arbitration applies.');
    expect(text).not.toContain('synthetic-private-title');
  });

  it('retains decoded literal angle brackets, entity spelling, dates and block boundaries', async () => {
    chrome.runtime.sendMessage.mockResolvedValue(
      legalDocumentResponse(`<main>
      <p>Effective date: March 15, 2026</p>
      <p>These Terms preserve &lt;LICENSE_CODE&gt; and the literal spelling &amp;lt; for license purposes.</p>
      <p>Second clause: rights remain with you and binding arbitration applies to disputes.</p></main>`)
    );
    const result = await extractLinkedText('https://example.test/terms');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.text).toContain('Effective date: March 15, 2026');
    expect(result.data.text).toContain('<LICENSE_CODE>');
    expect(result.data.text).toContain('spelling &lt;');
    expect(result.data.text).toMatch(/purposes\.\s+Second clause:/);
  });

  it('uses a linked agreement even when unrelated checkout context is longer than 500 characters', async () => {
    document.body.innerHTML = `<form><p>${'synthetic-private-order-details '.repeat(30)}</p>
      <input type="checkbox" id="agree"><label for="agree">I agree to the Terms and Conditions.</label></form>`;
    const legal =
      'These Terms require binding arbitration and recurring billing for the subscription.';
    chrome.runtime.sendMessage.mockResolvedValue(
      legalDocumentResponse(`<main><p>${legal.repeat(3)}</p></main>`)
    );
    const result = await resolveDetectionTextSource(
      detection(document.getElementById('agree')!, 'https://example.test/terms')
    );
    expect(result.sourceType).toBe('linked');
    expect(result.text).toContain('binding arbitration');
    expect(result.text).not.toContain('synthetic-private-order-details');
  });

  it('handles valid checkbox IDs containing selector punctuation', () => {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'synthetic["id';
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = 'I agree to the Terms and Conditions and Privacy Policy before continuing.';
    document.body.append(checkbox, label);
    expect(() => detectCheckboxes(document.body)).not.toThrow();
    expect(detectCheckboxes(document.body).some((item) => item.element === checkbox)).toBe(true);
  });
});
