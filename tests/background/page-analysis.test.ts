import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@shared/messages';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import { chrome, mockStorage } from '../mocks/chrome';

function makePageAnalysisRecord(
  overrides: Partial<PageAnalysisRecord> = {}
): PageAnalysisRecord {
  return {
    tabId: 42,
    url: 'https://example.com/checkout',
    domain: 'example.com',
    status: 'ready',
    sourceType: 'inline',
    detectionType: 'checkbox',
    confidence: 0.9,
    textHash: 'abc123',
    summary: null,
    error: null,
    updatedAt: 1_763_648_400_000,
    ...overrides,
  };
}

async function importBackground(): Promise<void> {
  vi.resetModules();
  await import('@background/index');
}

function getRuntimeListener(): (
  message: Message,
  sender: unknown
) => Promise<unknown> | undefined {
  return chrome.runtime.onMessage.addListener.mock.calls[0]?.[0] as (
    message: Message,
    sender: unknown
  ) => Promise<unknown> | undefined;
}

function getTabRemovedListener(): (tabId: number) => Promise<void> {
  return chrome.tabs.onRemoved.addListener.mock.calls[0]?.[0] as (
    tabId: number
  ) => Promise<void>;
}

function getActionClickListener(): (tab?: { windowId?: number }) => Promise<void> | void {
  return chrome.action.onClicked.addListener.mock.calls[0]?.[0] as (
    tab?: { windowId?: number }
  ) => Promise<void> | void;
}

describe('background page analysis contracts', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it('saves and retrieves page analysis through messages', async () => {
    await importBackground();
    expect(chrome.action.onClicked.addListener).toHaveBeenCalled();
    const listener = getRuntimeListener();
    const record = makePageAnalysisRecord();

    const saveResponse = await listener(
      { type: 'SAVE_PAGE_ANALYSIS', payload: record },
      {}
    );
    expect(saveResponse).toEqual({ ok: true, data: null });

    const getResponse = await listener(
      { type: 'GET_PAGE_ANALYSIS', payload: { tabId: record.tabId } },
      {}
    );
    expect(getResponse).toEqual({ ok: true, data: record });
  });

  it('opens the TC Guard side panel when the action icon is clicked', async () => {
    await importBackground();
    const onClicked = getActionClickListener();

    await onClicked({ windowId: 22 });

    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
      enabled: true,
      path: 'src/popup/index.html',
    });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 22 });
  });

  it('opens the TC Guard workspace from a background message', async () => {
    await importBackground();
    const listener = getRuntimeListener();

    const response = await listener(
      { type: 'OPEN_WORKSPACE_SURFACE', payload: { windowId: 22 } },
      {}
    );

    expect(response).toEqual({ ok: true, data: null });
    expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
      enabled: true,
      path: 'src/popup/index.html',
    });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 22 });
  });

  it('falls back to a popup window when side panel support is unavailable', async () => {
    const originalOpen = chrome.sidePanel.open;
    // Simulate a browser that does not expose the side panel open API.
    (chrome.sidePanel as { open?: unknown }).open = undefined;

    await importBackground();
    const onClicked = getActionClickListener();

    await onClicked({ windowId: 22 });

    expect(chrome.windows.create).toHaveBeenCalledWith({
      url: 'chrome-extension://mock-id/src/popup/index.html',
      type: 'popup',
      width: 500,
      height: 900,
      focused: true,
    });

    chrome.sidePanel.open = originalOpen;
  });

  it('cleans up page analysis when a tab closes', async () => {
    await importBackground();
    const listener = getRuntimeListener();
    const record = makePageAnalysisRecord();

    await listener({ type: 'SAVE_PAGE_ANALYSIS', payload: record }, {});

    const onRemoved = getTabRemovedListener();
    await onRemoved(record.tabId);
    expect(
      (mockStorage.pageAnalysis as Record<string, PageAnalysisRecord>)[record.url]
    ).toBeUndefined();
    expect(
      (mockStorage.pageAnalysisTabs as Record<string, string>)[String(record.tabId)]
    ).toBeUndefined();
  });
});
