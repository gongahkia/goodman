import { describe, expect, it } from 'vitest';
import { renderCorpusSettings } from '@popup/settings/corpus';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { mockStorage } from '../mocks/chrome';

describe('corpus settings', () => {
  it('defaults anonymous corpus contribution to off', async () => {
    mockStorage.settings = structuredClone(DEFAULT_SETTINGS);
    const container = document.createElement('div');

    await renderCorpusSettings(container);

    const check = container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(check?.checked).toBe(false);
    expect(container.textContent).toContain('This build does not upload corpus data.');
  });

  it('persists explicit corpus opt-in preference', async () => {
    mockStorage.settings = structuredClone(DEFAULT_SETTINGS);
    const container = document.createElement('div');

    await renderCorpusSettings(container);
    const check = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    await Promise.resolve();
    await Promise.resolve();

    expect((mockStorage.settings as typeof DEFAULT_SETTINGS).corpusContribution.enabled).toBe(true);
  });
});
