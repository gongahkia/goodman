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
