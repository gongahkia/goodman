import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserMock = vi.hoisted(() => ({
    storage: {
        local: {
            get: vi.fn(),
            set: vi.fn(),
        },
    },
}));

vi.mock('./browser', () => ({
    default: browserMock,
}));

import { getSettings, saveSettings } from './storage';

describe('Storage Helpers', () => {
    beforeEach(() => {
        browserMock.storage.local.get.mockReset();
        browserMock.storage.local.set.mockReset();
    });

    it('should return default settings if storage access fails', async () => {
        browserMock.storage.local.get.mockRejectedValue(new Error('storage unavailable'));

        const settings = await getSettings();
        expect(settings.targetTimezone).toBe('auto');
        expect(settings.pinnedTimezones).toEqual([]);
    });

    it('should fetch settings from extension storage', async () => {
        browserMock.storage.local.get.mockResolvedValue({ targetTimezone: 'Asia/Tokyo' });

        const settings = await getSettings();
        expect(browserMock.storage.local.get).toHaveBeenCalledWith([
            'targetTimezone',
            'format24h',
            'ignoredDomains',
            'theme',
            'pinnedTimezones'
        ]);
        expect(settings.targetTimezone).toBe('Asia/Tokyo');
    });

    it('should fall back to defaults if storage is empty', async () => {
        browserMock.storage.local.get.mockResolvedValue({});

        const settings = await getSettings();
        expect(settings.targetTimezone).toBe('auto');
        expect(settings.format24h).toBe(false);
    });

    it('should save settings', async () => {
        browserMock.storage.local.set.mockResolvedValue(undefined);

        await saveSettings({ targetTimezone: 'Europe/Paris' });
        expect(browserMock.storage.local.set).toHaveBeenCalledWith({ targetTimezone: 'Europe/Paris' });
    });
});
