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
});
