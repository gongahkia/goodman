import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chrome } from '../mocks/chrome';

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
});
