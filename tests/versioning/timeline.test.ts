import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionEntry } from '@shared/storage';

vi.mock('@versioning/schema', () => ({
  getVersionHistory: vi.fn(),
}));

import { getVersionHistory } from '@versioning/schema';
import { renderTimeline } from '@versioning/ui/timeline';

describe('renderTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getVersionHistory).mockResolvedValue([
      versionEntry(1, 'Original terms summary.'),
      versionEntry(2, 'Updated terms summary.'),
    ]);
  });

  it('renders keyboard-expandable version entries', async () => {
    const timeline = await renderTimeline('example.com');
    const item = timeline.querySelector('[role="button"]') as HTMLElement;
    const details = item.querySelector('.tc-timeline-summary') as HTMLElement;

    expect(timeline.getAttribute('aria-label')).toBe('Version history for example.com');
    expect(item.tabIndex).toBe(0);
    expect(item.getAttribute('aria-expanded')).toBe('false');
    expect(item.getAttribute('aria-controls')).toBe(details.id);
    expect(details?.getAttribute('aria-hidden')).toBe('true');

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(item.getAttribute('aria-expanded')).toBe('true');
    expect(details?.getAttribute('aria-hidden')).toBe('false');
  });
});

function versionEntry(version: number, summary: string): VersionEntry {
  return {
    domain: 'example.com',
    textHash: `hash-${version}`,
    timestamp: Date.UTC(2026, 0, version),
    version,
    summary: {
      summary,
      keyPoints: [],
      redFlags: [],
      severity: version === 1 ? 'low' : 'medium',
    },
  };
}
