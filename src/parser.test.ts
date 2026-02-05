import { describe, it, expect } from 'vitest';
import { parseDate } from './parser';

describe('Parser', () => {
    it('should parse "tomorrow at 5pm"', () => {
        const text = 'tomorrow at 5pm';
        const result = parseDate(text);
        expect(result).not.toBeNull();
        expect(result?.text).toContain('tomorrow at 5pm');
    });
});
