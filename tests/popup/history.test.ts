import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@versioning/schema', () => ({
  getAllTrackedDomains: vi.fn(),
  getDomainHistorySummaries: vi.fn(),
  getVersionHistorySnapshot: vi.fn(),
}));

vi.mock('@versioning/ui/timeline', () => ({
  renderTimeline: vi.fn(),
}));

vi.mock('@versioning/notifications', () => ({
  clearNotification: vi.fn(),
}));

import {
  getAllTrackedDomains,
  getDomainHistorySummaries,
  getVersionHistorySnapshot,
} from '@versioning/schema';
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
    vi.mocked(getDomainHistorySummaries).mockResolvedValue([
      makeDomainSummary('example.com', 'medium', 'up'),
      makeDomainSummary('other.com', 'low', 'new'),
    ]);
    vi.mocked(getVersionHistorySnapshot).mockResolvedValue({
      'example.com': [makeDomainSummary('example.com', 'medium', 'up').latest],
      'other.com': [makeDomainSummary('other.com', 'low', 'new').latest],
    });
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

  it('labels the domain selector', async () => {
    const container = document.createElement('div');

    await renderHistoryPanel(container, 'example.com');

    const select = container.querySelector('select') as HTMLSelectElement;
    const label = container.querySelector('label.tc-select-label') as HTMLLabelElement;
    expect(label.htmlFor).toBe(select.id);
    expect(label.textContent).toContain('Domain');
  });

  it('shows domain history cards with summary and trend', async () => {
    const container = document.createElement('div');

    await renderHistoryPanel(container, 'example.com');

    expect(container.textContent).toContain('Your T&C history');
    expect(container.textContent).toContain('example.com');
    expect(container.textContent).toContain('Latest summary for example.com');
    expect(container.textContent).toContain('severity up');
  });

  it('exports only local version history as JSON', async () => {
    const container = document.createElement('div');
    const createObjectURL = vi.fn(() => 'blob:goodman-history');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    await renderHistoryPanel(container, 'example.com');
    const button = Array.from(container.querySelectorAll('button')).find((item) => item.textContent === 'Export JSON');
    button?.click();
    await Promise.resolve();

    expect(getVersionHistorySnapshot).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();

    click.mockRestore();
    vi.unstubAllGlobals();
  });
});

function makeDomainSummary(
  domain: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  severityTrend: 'new' | 'up' | 'down' | 'unchanged'
) {
  return {
    domain,
    versionCount: severityTrend === 'new' ? 1 : 2,
    latest: {
      domain,
      textHash: `${domain}-hash`,
      timestamp: Date.UTC(2026, 6, 10),
      version: severityTrend === 'new' ? 1 : 2,
      summary: {
        summary: `Latest summary for ${domain}`,
        keyPoints: [],
        redFlags: [],
        severity,
      },
    },
    previous: null,
    lastDiffAt: severityTrend === 'new' ? null : Date.UTC(2026, 6, 10),
    severityTrend,
  };
}
