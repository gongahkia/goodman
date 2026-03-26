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
    mockStorage.onboardingCompleted = true;
    vi.clearAllMocks();
    chrome.tabs.query.mockResolvedValue([
      { id: 7, url: 'https://example.com/checkout' },
    ]);
  });

  it('renders persisted ready analysis on load', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain(
      'This page asks you to agree to terms.'
    );
    expect(document.body.textContent).toContain('inline');
    expect(document.body.textContent).toContain('View Details');
  });

  it('opens a persistent workspace from the action bar', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, data: null });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const viewDetailsButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'View Details'
    );

    viewDetailsButton?.click();
    await flush();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'OPEN_WORKSPACE_SURFACE',
      payload: {
        tabId: 7,
        windowId: undefined,
      },
    });
  });

  it('renders provider setup state from persisted analysis', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'needs_provider',
        summary: null,
        error: 'OpenAI encountered an error. Try again or switch providers.',
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Provider setup required');
    expect(document.body.textContent).toContain('Open Settings');
  });

  it('renders the hosted consent state from persisted analysis', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'needs_consent',
        summary: null,
        error:
          'Accept the Goodman Cloud privacy disclosure before hosted analysis can run.',
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Enable Goodman Cloud');
    expect(document.body.textContent).toContain('Accept & Analyze');
  });

  it('accepts hosted consent and reruns analysis from the popup', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'needs_consent',
        summary: null,
        error:
          'Accept the Goodman Cloud privacy disclosure before hosted analysis can run.',
      },
    };
    chrome.tabs.sendMessage.mockImplementation(async () => {
      mockStorage.pageAnalysis = {
        'https://example.com/checkout': readyAnalysis(),
      };
      return { ok: true };
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const acceptButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Accept & Analyze'
    );

    acceptButton?.click();
    await flush();

    expect((mockStorage.settings as { hostedConsentAccepted: boolean }).hostedConsentAccepted).toBe(
      true
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: 'DETECT_TC',
      payload: {
        tabId: 7,
        settingsOverride: { hostedConsentAccepted: true },
      },
    });
    expect(document.body.textContent).toContain(
      'This page asks you to agree to terms.'
    );
  });

  it('renders a hosted service unavailable state from persisted analysis', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'service_unavailable',
        summary: null,
        error: 'Goodman Cloud is temporarily unavailable. Please try again shortly.',
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Cloud unavailable');
    expect(document.body.textContent).toContain('Retry');
  });

  it('renders progress details and live logs while analysis is running', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'analyzing',
        summary: null,
        progressPercent: 72,
        progressLabel: 'Checking cache',
        progressLogs: [
          {
            timestamp: Date.now() - 2000,
            message: 'Detected a likely Terms or Conditions surface on the page.',
            progress: 18,
            level: 'info',
          },
          {
            timestamp: Date.now() - 1000,
            message: 'Computed a text fingerprint and started checking the local summary cache.',
            progress: 72,
            level: 'info',
          },
        ],
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Checking cache');
    expect(document.body.textContent).toContain('72%');
  });

  it('cancels an in-flight analysis from the popup', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'analyzing',
        summary: null,
        progressPercent: 65,
        progressLabel: 'Sending to background worker',
        progressLogs: [
          {
            timestamp: Date.now() - 1000,
            message: 'Handing off the prepared text to the background worker for summarization.',
            progress: 65,
            level: 'info',
          },
        ],
      },
    };
    chrome.runtime.sendMessage.mockResolvedValue({ ok: true, data: { cancelled: true } });
    chrome.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
      if (message.type === 'CANCEL_TC') {
        mockStorage.pageAnalysis = {
          'https://example.com/checkout': {
            ...readyAnalysis(),
            status: 'cancelled',
            summary: null,
            progressPercent: 65,
            progressLabel: 'Cancelled',
            progressLogs: [
              {
                timestamp: Date.now(),
                message: 'Analysis was cancelled before completion.',
                progress: 65,
                level: 'warning',
              },
            ],
          },
        };
      }
      return { ok: true };
    });

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const cancelButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel Analysis'
    );

    cancelButton?.click();
    await flush();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: 'CANCEL_TC',
      payload: { tabId: 7 },
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CANCEL_PAGE_ANALYSIS',
      payload: { tabId: 7 },
    });
    expect(document.body.textContent).toContain('Analysis cancelled');
  });

  it('refreshes persisted analysis after a manual analyze', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'no_detection',
        summary: null,
      },
    };
    chrome.tabs.sendMessage.mockImplementation(async () => {
      mockStorage.pageAnalysis = {
        'https://example.com/checkout': readyAnalysis(),
      };
      return { ok: true };
    });

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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Terms changed on example.com');
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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('2 domains with T&C changes');
  });

  it('refreshes the panel when the active tab changes', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
      'https://second.test/legal': {
        ...readyAnalysis(),
        tabId: 8,
        url: 'https://second.test/legal',
        domain: 'second.test',
        summary: {
          summary: 'Second tab terms summary.',
          keyPoints: ['Different point'],
          redFlags: [],
          severity: 'medium',
        },
      },
    };

    chrome.tabs.query
      .mockResolvedValueOnce([{ id: 7, url: 'https://example.com/checkout' }])
      .mockResolvedValue([{ id: 8, url: 'https://second.test/legal' }]);

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const onActivated = chrome.tabs.onActivated.addListener.mock.calls[0]?.[0] as
      | (() => void)
      | undefined;
    onActivated?.();
    await flush();

    expect(document.body.textContent).toContain('Second tab terms summary.');
    expect(document.body.textContent).toContain('second.test');
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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    const historyButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'History'
    );

    historyButton?.click();
    await flush();

    expect(renderHistoryPanel).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      'other.com'
    );
    expect(document.body.textContent).toContain('History for other.com');
  });
});
