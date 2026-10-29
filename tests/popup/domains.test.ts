import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@versioning/schema', () => ({
  getAllTrackedDomains: vi.fn(),
  getTextRetention: vi.fn().mockResolvedValue(false),
}));

import { getAllTrackedDomains } from '@versioning/schema';
import { renderDomainSettings } from '@popup/settings/domains';
import { DEFAULT_DOMAIN_PREFERENCES } from '@shared/domain-preferences';
import { mockStorage, chrome } from '../mocks/chrome';

describe('domain settings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.mocked(getAllTrackedDomains).mockResolvedValue(['spotify.com']);
  });

  it('renders per-domain procedural preference controls', async () => {
    const container = document.createElement('div');

    await renderDomainSettings(container);

    expect(container.textContent).toContain('Per-domain preferences');
    expect(container.textContent).toContain('spotify.com');
    expect(container.textContent).toContain('Arbitration');
    expect(
      container
        .querySelector('select[aria-label="spotify.com notification threshold"]')
        ?.getAttribute('aria-label')
    ).toBe('spotify.com notification threshold');
  });

  it('saves watched clause and summary language overrides', async () => {
    mockStorage.domainPreferences = {
      'spotify.com': DEFAULT_DOMAIN_PREFERENCES,
    };
    const container = document.createElement('div');

    await renderDomainSettings(container);
    const arbitration = container.querySelector('input[value="arbitration"]') as HTMLInputElement;
    arbitration.checked = true;
    arbitration.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(mockStorage.domainPreferences).toMatchObject({
        'spotify.com': {
          watchClauses: ['arbitration'],
        },
      });
    });

    const language = container.querySelector(
      'input[aria-label="spotify.com summary language"]'
    ) as HTMLInputElement;
    language.value = 'Spanish';
    language.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(() => {
      expect(mockStorage.domainPreferences).toMatchObject({
        'spotify.com': {
          watchClauses: ['arbitration'],
          summaryLanguage: 'Spanish',
        },
      });
    });
  });

  it('keeps text retention off by default and sends an explicit preference change', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: true, data: null });
    const container = document.createElement('div');
    await renderDomainSettings(container);
    const check = container.querySelector(
      '[aria-label="spotify.com save agreement text on this device"]'
    ) as HTMLInputElement;
    expect(check.checked).toBe(false);
    expect(container.textContent).toContain('Turning off deletes saved text');
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(check.disabled).toBe(true);
    await vi.waitFor(() => expect(check.disabled).toBe(false));
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'SET_TEXT_RETENTION',
      payload: { domain: 'spotify.com', enabled: true },
    });
    expect(container.textContent).toContain('Agreement text will be saved from future analyses');
  });

  it('restores the checkbox and reports a failed preference save', async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({
      ok: false,
      error: 'synthetic quota failure',
    });
    const container = document.createElement('div');
    await renderDomainSettings(container);
    const check = container.querySelector(
      '[aria-label="spotify.com save agreement text on this device"]'
    ) as HTMLInputElement;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(check.disabled).toBe(false));
    expect(check.checked).toBe(false);
    expect(container.textContent).toContain('Could not save this preference');
  });
});
