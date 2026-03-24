import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@versioning/schema', () => ({
  getAllTrackedDomains: vi.fn().mockResolvedValue([]),
}));

import { DEFAULT_SETTINGS } from '@shared/storage';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { mockStorage } from '../mocks/chrome';

describe('notification settings', () => {
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

  it('renders a global notification toggle', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderNotificationSettings(container);

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(DEFAULT_SETTINGS.notifyOnChange);
  });

  it('toggling global notification saves to storage', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderNotificationSettings(container);

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const stored = mockStorage.settings as typeof DEFAULT_SETTINGS;
    expect(stored.notifyOnChange).toBe(false);
  });
});
