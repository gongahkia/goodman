/* eslint-disable */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSettings, saveSettings } from './storage';

describe('Storage Helpers', () => {
    beforeEach(() => {
        // Mock global chrome object
        globalThis.chrome = {
            storage: {
                local: {
                    get: vi.fn(),
                    set: vi.fn(),
                },
            },
        } as any;
    });

    afterEach(() => {
        // @ts-expect-error
        delete globalThis.chrome;
    });

    it('should return default settings if chrome.storage is not available (dev mode safety)', async () => {
        // Remove chrome mock for this test
        // @ts-expect-error
        delete globalThis.chrome;

        const settings = await getSettings();
        expect(settings.targetTimezone).toBe('auto');
    });

    it('should fetch settings from chrome storage', async () => {
        const mockGet = vi.fn().mockResolvedValue({ targetTimezone: 'Asia/Tokyo' });

        globalThis.chrome.storage.local.get = mockGet;

        const settings = await getSettings();
        expect(mockGet).toHaveBeenCalledWith(['targetTimezone', 'format24h', 'ignoredDomains', 'theme']);
        expect(settings.targetTimezone).toBe('Asia/Tokyo');
    });

    it('should fall back to defaults if storage is empty', async () => {
        const mockGet = vi.fn().mockResolvedValue({});

        globalThis.chrome.storage.local.get = mockGet;

        const settings = await getSettings();
        expect(settings.targetTimezone).toBe('auto');
        expect(settings.format24h).toBe(false);
    });

    it('should save settings', async () => {
        const mockSet = vi.fn().mockResolvedValue(undefined);

        globalThis.chrome.storage.local.set = mockSet;

        await saveSettings({ targetTimezone: 'Europe/Paris' });
        expect(mockSet).toHaveBeenCalledWith({ targetTimezone: 'Europe/Paris' });
    });
});
