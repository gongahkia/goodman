import { DateTime, FixedOffsetZone } from 'luxon';

/**
 * Returns the user's system timezone (IANA format, e.g. "America/New_York")
 */
export function getSystemTimezone(): string {
    return DateTime.local().zoneName; // Defaults to system zone
}

/**
 * Converts a Date object to the target timezone
 */
export function convertToTimezone(date: Date, targetZone: string): DateTime {
    return DateTime.fromJSDate(date).setZone(targetZone);
}

/**
 * Returns a label indicating if the target date is on a different day than the source date.
 * @param sourceDate The original JS Date object (absolute time)
 * @param targetDateTime The converted Luxon DateTime object
 * @param sourceOffsetMinutes Optional timezone offset of the source in minutes (from Chrono)
 */
export function getDateDiffLabel(sourceDate: Date, targetDateTime: DateTime, sourceOffsetMinutes?: number): string {
    if (sourceOffsetMinutes === undefined) {
        return '';
    }

    // Create Source DateTime in its original timezone
    // FixedOffsetZone expects offset in minutes
    const sourceDateTime = DateTime.fromJSDate(sourceDate).setZone(FixedOffsetZone.instance(sourceOffsetMinutes));

    const sourceDay = sourceDateTime.toISODate();
    const targetDay = targetDateTime.toISODate();

    if (sourceDay === targetDay) {
        return '';
    }

    // Calculate difference in days based on Calendar Date only
    // We convert the ISO String (YYYY-MM-DD) back to a UTC DateTime to compare apples-to-apples
    const s = DateTime.fromISO(sourceDay!, { zone: 'UTC' });
    const t = DateTime.fromISO(targetDay!, { zone: 'UTC' });
    const diff = t.diff(s, 'days').days;

    if (diff === 1) return '(Next Day)';
    if (diff === -1) return '(Prev Day)';

    // Fallback for >1 day diff
    return `(${diff > 0 ? '+' : ''}${Math.round(diff)} Days)`;
}

// Common deprecated or legacy timezone names mapped to modern IANA identifiers
const DEPRECATED_TIMEZONES: Record<string, string> = {
    'US/EASTERN': 'America/New_York',
    'US/CENTRAL': 'America/Chicago',
    'US/MOUNTAIN': 'America/Denver',
    'US/PACIFIC': 'America/Los_Angeles',
    'US/ALASKA': 'America/Anchorage',
    'US/HAWAII': 'Pacific/Honolulu',
    'US/ARIZONA': 'America/Phoenix',
    'ASIA/CALCUTTA': 'Asia/Kolkata',
    'ASIA/SAIGON': 'Asia/Ho_Chi_Minh',
    'ASIA/KATMANDU': 'Asia/Kathmandu',
    'ASIA/RANGOON': 'Asia/Yangon',
    'AUSTRALIA/ACT': 'Australia/Sydney',
    'AUSTRALIA/NORTH': 'Australia/Darwin',
    'AUSTRALIA/QUEENSLAND': 'Australia/Brisbane',
    'AUSTRALIA/SOUTH': 'Australia/Adelaide',
    'AUSTRALIA/TASMANIA': 'Australia/Hobart',
    'AUSTRALIA/VICTORIA': 'Australia/Melbourne',
    'AUSTRALIA/WEST': 'Australia/Perth',
    'BRAZIL/EAST': 'America/Sao_Paulo',
    'CANADA/ATLANTIC': 'America/Halifax',
    'CANADA/CENTRAL': 'America/Winnipeg',
    'CANADA/EASTERN': 'America/Toronto',
    'CANADA/MOUNTAIN': 'America/Edmonton',
    'CANADA/PACIFIC': 'America/Vancouver',
    'CANADA/SASKATCHEWAN': 'America/Regina',
    'CANADA/YUKON': 'America/Whitehorse',
    'CET': 'Europe/Paris',
    'CST6CDT': 'America/Chicago',
    'EST': 'America/New_York',
    'EST5EDT': 'America/New_York',
    'ETC/GMT': 'UTC',
    'ETC/UTC': 'UTC',
    'GMT': 'UTC',
    'HST': 'Pacific/Honolulu',
    'MST': 'America/Denver',
    'MST7MDT': 'America/Denver',
    'PST': 'America/Los_Angeles',
    'PST8PDT': 'America/Los_Angeles',
    'UTC': 'UTC',
    'Z': 'UTC',
};

/**
 * Normalizes a timezone string to a modern IANA format if possible.
 * Returns the original string if no mapping is found.
 */
export function normalizeTimezone(zone: string): string {
    const cleanZone = zone.trim();
    // Case-insensitive lookup
    return DEPRECATED_TIMEZONES[cleanZone.toUpperCase()] || cleanZone;
}

