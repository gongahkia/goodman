import * as chrono from 'chrono-node';

export interface ParseResult {
    date: Date;
    text: string;
    start: number;
    end: number;
}

export function parseDate(text: string): ParseResult | null {
    const results = chrono.parse(text);

    if (results.length === 0) {
        return null;
    }

    // Return the first valid result
    const result = results[0];
    const date = result.start.date();

    return {
        date,
        text: result.text,
        start: result.index,
        end: result.index + result.text.length,
    };
}
