import { vi } from 'vitest';

export const mockStorage: Record<string, unknown> = {};

export const chrome = {
  storage: {
    local: {
      get: vi.fn((keys: string | string[]) => {
        const result: Record<string, unknown> = {};
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (key in mockStorage) result[key] = mockStorage[key];
        }
        return Promise.resolve(result);
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
        return Promise.resolve();
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    getManifest: vi.fn(() => ({ version: '1.0.0-test' })),
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
    },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  i18n: {
    getMessage: vi.fn((key: string) => key),
  },
};
