import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@versioning/schema', () => ({
  getAllTrackedDomains: vi.fn(),
}));

vi.mock('@versioning/ui/timeline', () => ({
  renderTimeline: vi.fn(),
}));

vi.mock('@versioning/notifications', () => ({
  clearNotification: vi.fn(),
}));

import { getAllTrackedDomains } from '@versioning/schema';
import { clearNotification } from '@versioning/notifications';
import { renderTimeline } from '@versioning/ui/timeline';
import { renderHistoryPanel } from '@popup/history';

describe('renderHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllTrackedDomains).mockResolvedValue([
      'example.com',
      'other.com',
    ]);
    vi.mocked(renderTimeline).mockImplementation(async (domain: string) => {
      const div = document.createElement('div');
      div.textContent = `Timeline for ${domain}`;
      return div;
    });
  });

  it('clears notifications for the initially selected domain', async () => {
    const container = document.createElement('div');

    await renderHistoryPanel(container, 'example.com');

    expect(clearNotification).toHaveBeenCalledWith('example.com');
    expect(container.textContent).toContain('Timeline for example.com');
  });

  it('clears notifications when the selected domain changes', async () => {
    const container = document.createElement('div');

    await renderHistoryPanel(container, 'example.com');

    const select = container.querySelector('select') as HTMLSelectElement;
    select.value = 'other.com';
    select.dispatchEvent(new Event('change'));
    await Promise.resolve();

    expect(clearNotification).toHaveBeenCalledWith('other.com');
  });
});
