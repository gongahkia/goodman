import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractLinkedText } from '@content/extractors/linked';
import { chrome } from '../mocks/chrome';
import { legalDocumentResponse } from '../mocks/legal-document';

describe('extractLinkedText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      error: 'Failed to fetch URL: HTTP 404',
    });
  });

  it('removes script, style, and hidden noise from linked legal pages', async () => {
    chrome.runtime.sendMessage.mockResolvedValue(
      legalDocumentResponse(`
            <html>
              <body>
                <main>
                  <style>.hidden { display:none; }</style>
                  <script>window.__TRACKING__ = "collect every click";</script>
                  <noscript>Enable JavaScript to continue.</noscript>
                  <div hidden>Hidden upsell copy</div>
                  <p>These Terms of Service require binding arbitration.</p>
                  <p>Your subscription renews automatically unless cancelled.</p>
                </main>
              </body>
            </html>
          `)
    );

    const result = await extractLinkedText('https://example.com/terms');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.text).toContain('These Terms of Service require binding arbitration.');
    expect(result.data.text).toContain('Your subscription renews automatically unless cancelled.');
    expect(result.data.text).not.toContain('window.__TRACKING__');
    expect(result.data.text).not.toContain('Enable JavaScript to continue.');
    expect(result.data.text).not.toContain('Hidden upsell copy');
  });

  it('returns the upstream error without an unbounded direct retry', async () => {
    const direct = vi.fn();
    vi.stubGlobal('fetch', direct);
    const result = await extractLinkedText('https://example.test/missing');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('HTTP 404');
    expect(direct).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
