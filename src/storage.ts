import browser from './browser';

export type Theme = 'light' | 'dark' | 'auto';

export interface UserSettings {
    targetTimezone: string; // IANA zone or 'auto'
    format24h: boolean; // true = 14:00, false = 2:00 PM
    ignoredDomains: string[];
    theme: Theme;
    pinnedTimezones: string[]; // additional IANA zones to show (max 4)
}

const SETTINGS_KEYS: (keyof UserSettings)[] = [
    'targetTimezone',
    'format24h',
    'ignoredDomains',
    'theme',
    'pinnedTimezones'
];
const DEFAULT_SETTINGS: UserSettings = {
    targetTimezone: 'auto',
    format24h: false,
    ignoredDomains: [],
    theme: 'auto',
    pinnedTimezones: [],
};

const ONBOARDING_DISMISSED_KEY = 'onboardingDismissed';

export async function getSettings(): Promise<UserSettings> {
    try {
        const result = await browser.storage.local.get(SETTINGS_KEYS) as Partial<UserSettings>;

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

export async function isOnboardingDismissed(): Promise<boolean> {
    try {
        const result = await browser.storage.local.get([ONBOARDING_DISMISSED_KEY]) as Partial<Record<typeof ONBOARDING_DISMISSED_KEY, boolean>>;
        return result.onboardingDismissed ?? false;
    } catch {
        return false;
    }
}

export async function setOnboardingDismissed(dismissed: boolean): Promise<void> {
    await browser.storage.local.set({ [ONBOARDING_DISMISSED_KEY]: dismissed });
}

export async function shouldShowOnboarding(): Promise<boolean> {
    try {
        const result = await browser.storage.local.get([...SETTINGS_KEYS, ONBOARDING_DISMISSED_KEY]) as Partial<UserSettings> & Partial<Record<typeof ONBOARDING_DISMISSED_KEY, boolean>>;

        if (result.onboardingDismissed) {
            return false;
        }

        return !SETTINGS_KEYS.some((key) => result[key] !== undefined);
    } catch {
        return false;
    }
}
