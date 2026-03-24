import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { renderDetectionSettings } from '@popup/settings/detection';
import { mockStorage } from '../mocks/chrome';

describe('detection settings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockStorage.settings = structuredClone(DEFAULT_SETTINGS);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders 3 sensitivity options', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetectionSettings(container);

    const radios = container.querySelectorAll('input[type="radio"][name="sensitivity"]');
    expect(radios.length).toBe(3);

    const values = Array.from(radios).map((r) => (r as HTMLInputElement).value);
    expect(values).toContain('aggressive');
    expect(values).toContain('normal');
    expect(values).toContain('conservative');
  });

  it('pre-selects the current sensitivity', async () => {
    (mockStorage.settings as typeof DEFAULT_SETTINGS).detectionSensitivity = 'normal';

    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetectionSettings(container);

    const checked = container.querySelector(
      'input[type="radio"][name="sensitivity"]:checked'
    ) as HTMLInputElement;
    expect(checked).not.toBeNull();
    expect(checked.value).toBe('normal');
  });

  it('clicking a sensitivity option saves to storage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetectionSettings(container);

    const aggressiveRadio = container.querySelector(
      'input[type="radio"][value="aggressive"]'
    ) as HTMLInputElement;
    aggressiveRadio.checked = true;
    aggressiveRadio.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const stored = mockStorage.settings as typeof DEFAULT_SETTINGS;
    expect(stored.detectionSensitivity).toBe('aggressive');
  });
});
