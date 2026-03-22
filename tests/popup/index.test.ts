import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chrome, mockStorage } from '../mocks/chrome';

vi.mock('@popup/history', () => ({
  renderHistoryPanel: vi.fn(async (container: HTMLElement, domain: string) => {
    container.textContent = `History for ${domain}`;
  }),
}));

import { renderHistoryPanel } from '@popup/history';

function readyAnalysis() {
  return {
    tabId: 7,
    url: 'https://example.com/checkout',
    domain: 'example.com',
    status: 'ready',
    sourceType: 'inline',
    detectionType: 'checkbox',
    confidence: 0.91,
    textHash: 'hash-1',
    summary: {
      summary: 'This page asks you to agree to terms.',
      keyPoints: ['Point one'],
      redFlags: [],
      severity: 'low',
    },
    error: null,
    updatedAt: Date.now(),
  };
}

async function loadPopupModule(): Promise<void> {
  vi.resetModules();
  await import('@popup/index');
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('popup index', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
    chrome.tabs.query.mockResolvedValue([
      { id: 7, url: 'https://example.com/checkout' },
    ]);
  });

  it('renders persisted ready analysis on load', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: readyAnalysis(),
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain(
      'This page asks you to agree to terms.'
    );
    expect(document.body.textContent).toContain('Source: inline');
  });

  it('renders provider setup state from persisted analysis', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: {
        ...readyAnalysis(),
        status: 'needs_provider',
        summary: null,
        error: 'OpenAI encountered an error. Try again or switch providers.',
      },
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Provider setup required');
    expect(document.body.textContent).toContain('Open Settings');
  });

  it('refreshes persisted analysis after a manual analyze', async () => {
    let fetchCount = 0;
    chrome.runtime.sendMessage.mockImplementation(async () => {
      fetchCount += 1;
      return {
        ok: true,
        data:
          fetchCount === 1
            ? {
                ...readyAnalysis(),
                status: 'no_detection',
                summary: null,
              }
            : readyAnalysis(),
      };
    });
    chrome.tabs.sendMessage.mockResolvedValue({ ok: true });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const analyzeButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Analyze This Page'
    );

    analyzeButton?.click();
    await flush();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: 'DETECT_TC',
      payload: { tabId: 7 },
    });
    expect(document.body.textContent).toContain(
      'This page asks you to agree to terms.'
    );
  });

  it('renders a current-domain notification banner', async () => {
    mockStorage.pendingNotifications = [
      {
        domain: 'example.com',
        addedRedFlags: 2,
        timestamp: Date.now(),
        viewed: false,
      },
    ];
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: readyAnalysis(),
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Terms changed on example.com');
    expect(document.body.textContent).toContain(
      '2 new red flags were added since the last saved version.'
    );
  });

  it('renders a generic banner for changes on other domains', async () => {
    mockStorage.pendingNotifications = [
      {
        domain: 'other.com',
        addedRedFlags: 1,
        timestamp: Date.now(),
        viewed: false,
      },
      {
        domain: 'tracked.test',
        addedRedFlags: 0,
        timestamp: Date.now(),
        viewed: false,
      },
    ];
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: readyAnalysis(),
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Tracked T&C changes detected');
    expect(document.body.textContent).toContain(
      '2 tracked domains have new terms changes ready for review.'
    );
  });

  it('opens history for the first pending domain when the banner CTA is clicked', async () => {
    mockStorage.pendingNotifications = [
      {
        domain: 'other.com',
        addedRedFlags: 1,
        timestamp: Date.now(),
        viewed: false,
      },
      {
        domain: 'tracked.test',
        addedRedFlags: 0,
        timestamp: Date.now(),
        viewed: false,
      },
    ];
    chrome.runtime.sendMessage.mockResolvedValue({
      ok: true,
      data: readyAnalysis(),
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const openHistoryButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Open History'
    );

    openHistoryButton?.click();
    await flush();

    expect(renderHistoryPanel).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'other.com'
    );
    expect(document.body.textContent).toContain('History for other.com');
  });
});
