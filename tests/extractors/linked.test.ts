import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractLinkedText } from '@content/extractors/linked';
import { chrome } from '../mocks/chrome';

describe('extractLinkedText', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: false,
      error: 'Failed to fetch URL: HTTP 404',
    });
  });

  it('removes script, style, and hidden noise from linked legal pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `
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
          `,
          {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }
        )
      )
    );

    const result = await extractLinkedText('https://example.com/terms');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.text).toContain(
      'These Terms of Service require binding arbitration.'
    );
    expect(result.data.text).toContain(
      'Your subscription renews automatically unless cancelled.'
    );
    expect(result.data.text).not.toContain('window.__TRACKING__');
    expect(result.data.text).not.toContain('Enable JavaScript to continue.');
    expect(result.data.text).not.toContain('Hidden upsell copy');
  });
});
