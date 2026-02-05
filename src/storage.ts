export interface UserSettings {
    targetTimezone: string; // IANA zone or 'auto'
    format24h: boolean;
    ignoredDomains: string[];
}

const DEFAULT_SETTINGS: UserSettings = {
    targetTimezone: 'auto',
    format24h: false,
    ignoredDomains: [],
};

export async function getSettings(): Promise<UserSettings> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        // Wrap in promise for explicit async handling if API doesn't return promise (Manifest V3 returns promise)
        // Actually Chrome MV3 API returns Promise? 
        // Types might say callback. But newer chrome types support promises.
        // Safe to use await/promise wrapper.
        const result = await chrome.storage.local.get(['targetTimezone', 'format24h', 'ignoredDomains']) as any;
        return {
            targetTimezone: result.targetTimezone || DEFAULT_SETTINGS.targetTimezone,
            format24h: result.format24h ?? DEFAULT_SETTINGS.format24h,
            ignoredDomains: result.ignoredDomains || DEFAULT_SETTINGS.ignoredDomains,
        };
    }
    return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.local.set(settings);
    }
}
