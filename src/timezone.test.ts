import { describe, it, expect } from 'vitest';
import { getSystemTimezone, convertToTimezone } from './timezone';


describe('Timezone Logic', () => {
    it('should get system timezone', () => {
        const tz = getSystemTimezone();
        expect(typeof tz).toBe('string');
        expect(tz.length).toBeGreaterThan(0);
        // Should look like Area/Location or UTC
        expect(tz).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+|UTC|GMT$/);
    });

    it('should convert date to target timezone', () => {
        const date = new Date('2023-01-01T12:00:00Z'); // 12:00 UTC
        const targetZone = 'Asia/Tokyo'; // UTC+9

        const converted = convertToTimezone(date, targetZone);

        expect(converted.zoneName).toBe(targetZone);
        expect(converted.year).toBe(2023);
        expect(converted.month).toBe(1);
        expect(converted.day).toBe(1);
        expect(converted.hour).toBe(21); // 12 + 9 = 21
    });

    it('should handle invalid timezone gracefully (luxon behavior check)', () => {
        const date = new Date();
        const invalidZone = 'Mars/Phobos';

        const converted = convertToTimezone(date, invalidZone);
        // Luxon usually defaults to invalid or keeps previous?
        // Actually luxon 3.x returns INVALID if zone is bad.
        // check isValid
        expect(converted.isValid).toBe(false);
    });
});

import { getDateDiffLabel } from './timezone';

describe('Date Rollover Logic', () => {
    // Helper to fixed date
    const date = new Date('2023-01-01T12:00:00Z'); // 12:00 UTC

    it('should return empty string if no offset provided', () => {
        const converted = convertToTimezone(date, 'UTC');
        expect(getDateDiffLabel(date, converted, undefined)).toBe('');
    });

    it('should return empty string for same day', () => {
        // JST (UTC+9) 10 PM Tue -> EST (UTC-5) 8 AM Tue
        // 2023-01-03 22:00:00 JST = 2023-01-03 13:00:00 UTC
        const iso = '2023-01-03T13:00:00Z';
        const d = new Date(iso);
        const sourceOffset = 540; // UTC+9
        const targetZone = 'America/New_York'; // UTC-5

        const converted = convertToTimezone(d, targetZone);
        // Target is 2023-01-03 08:00
        expect(getDateDiffLabel(d, converted, sourceOffset)).toBe('');
    });

    it('should detect Next Day', () => {
        // EST (UTC-5) 11 PM Tue -> JST (UTC+9) 1 PM Wed
        // 2023-01-03 23:00:00 EST = 2023-01-04 04:00:00 UTC
        // OFFSET -5 hours = -300 min
        const iso = '2023-01-04T04:00:00Z';
        const d = new Date(iso);
        const sourceOffset = -300; // EST
        const targetZone = 'Asia/Tokyo'; // JST

        const converted = convertToTimezone(d, targetZone);
        // Target should be Wed Jan 04 13:00
        // Source was Tue Jan 03 23:00 (in source zone)
        expect(converted.day).toBe(4);
        expect(getDateDiffLabel(d, converted, sourceOffset)).toBe('(Next Day)');
    });

    it('should detect Previous Day', () => {
        // JST (UTC+9) 2 AM Wed -> EST (UTC-5) 12 PM Tue
        // 2023-01-04 02:00:00 JST = 2023-01-03 17:00:00 UTC
        const iso = '2023-01-03T17:00:00Z';
        const d = new Date(iso);
        const sourceOffset = 540; // JST
        const targetZone = 'America/New_York'; // EST

        const converted = convertToTimezone(d, targetZone);
        // Target should be Tue Jan 03 12:00
        // Source was Wed Jan 04 02:00
        expect(converted.day).toBe(3);
        expect(getDateDiffLabel(d, converted, sourceOffset)).toBe('(Prev Day)');
    });
});

import { normalizeTimezone } from './timezone';

describe('Timezone Normalization', () => {
    it('should normalize deprecated US zones', () => {
        expect(normalizeTimezone('US/Eastern')).toBe('America/New_York');
        expect(normalizeTimezone('US/Pacific')).toBe('America/Los_Angeles');
    });

    it('should normalize Asian legacy zones', () => {
        expect(normalizeTimezone('Asia/Calcutta')).toBe('Asia/Kolkata');
        expect(normalizeTimezone('Asia/Saigon')).toBe('Asia/Ho_Chi_Minh');
    });

    it('should be case-insensitive', () => {
        expect(normalizeTimezone('us/eastern')).toBe('America/New_York');
        expect(normalizeTimezone('asia/calcutta')).toBe('Asia/Kolkata');
        expect(normalizeTimezone('PST')).toBe('America/Los_Angeles');
        expect(normalizeTimezone('pst')).toBe('America/Los_Angeles');
    });

    it('should return original string if unknown', () => {
        expect(normalizeTimezone('Mars/Phobos')).toBe('Mars/Phobos');
        expect(normalizeTimezone('America/New_York')).toBe('America/New_York');
    });
});
