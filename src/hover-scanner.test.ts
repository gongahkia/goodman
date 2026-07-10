import { describe, expect, it } from 'vitest';
import { findHoverEntities } from './hover-scanner';

describe('hover scanner', () => {
    it('detects supported hover date/time entities', () => {
        const text = 'Meet at 2pm PST, 14:00 UTC, tomorrow at 5pm, 2023-05-20T10:30:00Z, and 1672531200000.';
        const entities = findHoverEntities(text).map((entity) => entity.text);

        expect(entities).toEqual([
            '2pm PST',
            '14:00 UTC',
            'tomorrow at 5pm',
            '2023-05-20T10:30:00Z',
            '1672531200000',
        ]);
    });

    it('ignores invalid epoch-like entities', () => {
        const entities = findHoverEntities('Ignore 9876543210 here.');

        expect(entities).toEqual([]);
    });

    it('detects abbreviated pm times with timezone labels in dynamic text', () => {
        const entities = findHoverEntities('Dynamic update at 9pm CET').map((entity) => entity.text);

        expect(entities).toEqual(['9pm CET']);
    });
});
