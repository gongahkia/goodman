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

describe('background page analysis contracts', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    vi.clearAllMocks();
  });

  it('saves and retrieves page analysis through messages', async () => {
    await importBackground();
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

  it('cleans up page analysis when a tab closes', async () => {
    await importBackground();
    const listener = getRuntimeListener();
    const record = makePageAnalysisRecord();

    await listener({ type: 'SAVE_PAGE_ANALYSIS', payload: record }, {});

    const onRemoved = getTabRemovedListener();
    await onRemoved(record.tabId);
    expect(
      (mockStorage.pageAnalysis as Record<string, PageAnalysisRecord>)[String(record.tabId)]
    ).toBeUndefined();
  });
});
