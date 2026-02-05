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
});
