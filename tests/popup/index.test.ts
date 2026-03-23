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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain(
      'This page asks you to agree to terms.'
    );
    expect(document.body.textContent).toContain('Source: inline');
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

    expect(document.body.textContent).toContain('Advanced provider setup required');
    expect(document.body.textContent).toContain('Open Settings');
  });

  it('renders the hosted consent state from persisted analysis', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'needs_consent',
        summary: null,
        error:
          'Accept the TC Guard Cloud privacy disclosure before hosted analysis can run.',
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('Enable TC Guard Cloud');
    expect(document.body.textContent).toContain('Accept and Analyze');
  });

  it('accepts hosted consent and reruns analysis from the popup', async () => {
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': {
        ...readyAnalysis(),
        status: 'needs_consent',
        summary: null,
        error:
          'Accept the TC Guard Cloud privacy disclosure before hosted analysis can run.',
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
      (button) => button.textContent === 'Accept and Analyze'
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
        error: 'TC Guard Cloud is temporarily unavailable. Please try again shortly.',
      },
    };

    await loadPopupModule();
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush();

    expect(document.body.textContent).toContain('TC Guard Cloud is unavailable');
    expect(document.body.textContent).toContain('Retry');
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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

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
    mockStorage.pageAnalysis = {
      'https://example.com/checkout': readyAnalysis(),
    };

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
