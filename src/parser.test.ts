import { describe, it, expect } from 'vitest';
import { parseDate } from './parser';

describe('Parser', () => {
    it('should parse "tomorrow at 5pm" via chrono', () => {
        const text = 'tomorrow at 5pm';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.text).toContain('tomorrow at 5pm');
    });

    it('should parse "1400" as military time', () => {
        const text = '1400';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getHours()).toBe(14);
        expect(result?.date.getMinutes()).toBe(0);
    });

    it('should parse "23:59" as military time', () => {
        const text = '23:59';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getHours()).toBe(23);
        expect(result?.date.getMinutes()).toBe(59);
    });

    it('should parse "0930" as military time', () => {
        const text = '0930';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getHours()).toBe(9);
        expect(result?.date.getMinutes()).toBe(30);
    });
    it('should parse 10-digit epoch (seconds)', () => {
        // Fri Feb 13 2009 23:31:30 UTC
        const text = '1234567890';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.toISOString()).toBe('2009-02-13T23:31:30.000Z');
    });

    it('should parse 13-digit epoch (milliseconds)', () => {
        // Sun Jan 01 2023 00:00:00 UTC
        const text = '1672531200000';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.toISOString()).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should ignore epoch-like strings that are out of year range', () => {
        // 9876543210 -> Year 2282. Allowed range 1970-2100.
        const text = '9876543210';
        const result = parseDate(text);
        expect(result).toBeNull();
    });


    // Locale tests
    it('should parse 01/02/2023 as 2 Jan in en-US (default match)', () => {
        // Mock navigator for US
        Object.defineProperty(globalThis, 'navigator', {
            value: { language: 'en-US' },
            writable: true,
            configurable: true,
        });

        const result = parseDate('01/02/2023');
        expect(result).not.toBeNull();
        expect(result?.date.getMonth()).toBe(0); // Jan
        expect(result?.date.getDate()).toBe(2);
    });

    it('should parse 01/02/2023 as 1 Feb in en-GB', () => {
        // Mock navigator for GB
        Object.defineProperty(globalThis, 'navigator', {
            value: { language: 'en-GB' },
            writable: true,
            configurable: true,
        });

        const result = parseDate('01/02/2023');
        expect(result).not.toBeNull();
        expect(result?.date.getMonth()).toBe(1); // Feb
        expect(result?.date.getDate()).toBe(1);
    });

    it('should normalize text (remove trailing dot, collapse spaces)', () => {
        const text = 'Tomorrow \n  at \t 5pm.';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.text).toContain('Tomorrow at 5pm');
    });

    it('should handle timezone abbreviations (EST)', () => {
        // 5pm EST should be 22:00 UTC
        const text = '5pm EST';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        // Check if the date corresponds to 22:00 UTC (assuming 5pm = 17:00)
        // Note: Date object is just a timestamp. 
        expect(result?.date.getUTCHours()).toBe(22);
    });

    it('should handle timezone abbreviations (CET)', () => {
        // 5pm CET (UTC+1) should be 16:00 UTC
        const text = '5pm CET';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getUTCHours()).toBe(16);
    });

    it('should handle timezone abbreviations (JST)', () => {
        // 5pm JST (UTC+9) should be 08:00 UTC
        const text = '5pm JST';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getUTCHours()).toBe(8);
    });

    it('should handle relative time ("in 2 hours")', () => {
        // Mock a reference date: 2023-01-01 12:00:00 Local time? 
        // parseDate accepts refDate.
        const refDate = new Date('2023-01-01T12:00:00Z'); // UTC ref
        const text = 'in 2 hours';
        // Note: chrono uses local timezone of the environment unless specified in ref?
        // Actually refDate sets the "now". 
        // If "in 2 hours", result should be refDate + 2 hours.
        const result = parseDate(text, refDate);

        expect(result).not.toBeNull();
        // 12:00 + 2h = 14:00
        expect(result?.date.getTime()).toBe(refDate.getTime() + 2 * 60 * 60 * 1000);
    });

    it('should handle relative time ("30 mins ago")', () => {
        const refDate = new Date('2023-01-01T12:00:00Z');
        const text = '30 mins ago';
        const result = parseDate(text, refDate);
        expect(result).not.toBeNull();
        // 12:00 - 30m = 11:30
        expect(result?.date.getTime()).toBe(refDate.getTime() - 30 * 60 * 1000);
    });

    it('should parse ISO 8601 strings', () => {
        const text = '2023-05-20T10:30:00Z';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.toISOString()).toBe('2023-05-20T10:30:00.000Z');
    });

    it('should parse "12 January 2023"', () => {
        const text = '12 January 2023';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getFullYear()).toBe(2023);
        expect(result?.date.getMonth()).toBe(0); // Jan
        expect(result?.date.getDate()).toBe(12);
    });

    it('should parse "Jan 12, 2023"', () => {
        const text = 'Jan 12, 2023';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.date.getFullYear()).toBe(2023);
        expect(result?.date.getMonth()).toBe(0); // Jan
        expect(result?.date.getDate()).toBe(12);
    });
});
