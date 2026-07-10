import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@versioning/schema', () => ({
  getAllTrackedDomains: vi.fn(),
}));

import { getAllTrackedDomains } from '@versioning/schema';
import { renderDomainSettings } from '@popup/settings/domains';
import { DEFAULT_DOMAIN_PREFERENCES } from '@shared/domain-preferences';
import { mockStorage } from '../mocks/chrome';

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
    expect(container.querySelector('select')?.getAttribute('aria-label')).toBe('spotify.com notification threshold');
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

    const language = container.querySelector('input[aria-label="spotify.com summary language"]') as HTMLInputElement;
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
});
