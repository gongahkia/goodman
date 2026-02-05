import { DateTime } from 'luxon';

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
