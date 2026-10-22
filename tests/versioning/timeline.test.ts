import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionEntry } from '@shared/storage';

vi.mock('@versioning/schema', () => ({
  getVersionHistory: vi.fn(),
}));

import { getVersionHistory } from '@versioning/schema';
import { renderTimeline } from '@versioning/ui/timeline';

describe('renderTimeline', () => {
  it('preserves an expanded comparison across data-driven view refreshes', async () => {
    const expanded = new Set<string>();
    const first = await renderTimeline('example.com', expanded);
    (first.querySelector('button') as HTMLButtonElement).click();
    const refreshed = await renderTimeline('example.com', expanded);
    expect(refreshed.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    (refreshed.querySelector('button') as HTMLButtonElement).click();
    expect(
      (await renderTimeline('example.com', expanded))
        .querySelector('button')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
  });
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
    const details = timeline.querySelector(`#${item.getAttribute('aria-controls')}`) as HTMLElement;
    expect(item.tagName).toBe('BUTTON');

    expect(timeline.getAttribute('aria-label')).toBe('Version history for example.com');
    expect(item.tabIndex).toBe(0);
    expect(item.getAttribute('aria-expanded')).toBe('false');
    expect(item.getAttribute('aria-controls')).toBe(details.id);
    expect(details?.getAttribute('aria-hidden')).toBe('true');

    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(item.getAttribute('aria-expanded')).toBe('true');
    expect(details?.getAttribute('aria-hidden')).toBe('false');
  });

  it('shows both literal agreement versions without executing their markup', async () => {
    vi.mocked(getVersionHistory).mockResolvedValue([
      {
        ...versionEntry(1, 'Original summary.'),
        sourceText: 'Cancel monthly.\n<img src=x onerror="alert(1)">\n',
      },
      {
        ...versionEntry(2, 'Updated summary.'),
        sourceText: 'Cancel annually.\n<script>alert(2)</script>\n',
      },
    ]);
    const timeline = await renderTimeline('example.com');
    (timeline.querySelector('button') as HTMLButtonElement).click();
    expect(timeline.textContent).toContain('Cancel monthly.');
    expect(timeline.textContent).toContain('Cancel annually.');
    expect(timeline.textContent).toContain('<script>alert(2)</script>');
    expect(timeline.querySelector('img, script')).toBeNull();
    const before = timeline.querySelector('.tc-text-diff--removed')!;
    before.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(timeline.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('explains unavailable source text and shows key-point-only summary changes', async () => {
    vi.mocked(getVersionHistory).mockResolvedValue([
      versionEntry(1, 'Original summary.'),
      {
        ...versionEntry(2, 'Updated summary.'),
        summary: {
          ...versionEntry(2, '').summary,
          summary: 'Updated summary.',
          keyPoints: ['Cancellation fee added.'],
        },
      },
    ]);
    const timeline = await renderTimeline('example.com');
    (timeline.querySelector('button') as HTMLButtonElement).click();
    expect(timeline.textContent).toContain('Text was not saved for both versions');
    expect(timeline.textContent).toContain('+ Cancellation fee added.');
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
