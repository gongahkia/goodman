import { vi, beforeEach } from 'vitest';
import { chrome, mockStorage } from './chrome';

Object.defineProperty(globalThis, 'chrome', { value: chrome, writable: true });

vi.mock('webextension-polyfill', () => ({
  default: chrome,
}));

beforeEach(() => {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  vi.clearAllMocks();
});
