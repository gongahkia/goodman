import browser from './browser';

export type Theme = 'light' | 'dark' | 'auto';

export interface UserSettings {
    targetTimezone: string; // IANA zone or 'auto'
    format24h: boolean; // true = 14:00, false = 2:00 PM
    ignoredDomains: string[];
    theme: Theme;
    pinnedTimezones: string[]; // additional IANA zones to show (max 4)
}

const DEFAULT_SETTINGS: UserSettings = {
    targetTimezone: 'auto',
    format24h: false,
    ignoredDomains: [],
    theme: 'auto',
    pinnedTimezones: [],
};

export async function getSettings(): Promise<UserSettings> {
    try {
        const result = await browser.storage.local.get([
            'targetTimezone',
            'format24h',
            'ignoredDomains',
            'theme',
            'pinnedTimezones'
        ]) as Partial<UserSettings>;

        return {
            targetTimezone: result.targetTimezone ?? DEFAULT_SETTINGS.targetTimezone,
            format24h: result.format24h ?? DEFAULT_SETTINGS.format24h,
            ignoredDomains: result.ignoredDomains ?? DEFAULT_SETTINGS.ignoredDomains,
            theme: result.theme ?? DEFAULT_SETTINGS.theme,
            pinnedTimezones: result.pinnedTimezones ?? DEFAULT_SETTINGS.pinnedTimezones,
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
    await browser.storage.local.set(settings);
}
