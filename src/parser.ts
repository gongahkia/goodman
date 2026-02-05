import * as chrono from 'chrono-node';

export interface ParseResult {
    date: Date;
    text: string;
    start: number;
    end: number;
}

// Regex for strict military time (e.g., 1400, 2359)
const MILITARY_TIME_REGEX = /^([01]\d|2[0-3])([0-5]\d)$/;
// Regex for colon-separated time (e.g., 14:00, 23:59:00)
const MILITARY_TIME_COLON_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

function parseMilitary(text: string): Date | null {
    const clean = text.trim();
    let match = clean.match(MILITARY_TIME_REGEX);
    if (!match) match = clean.match(MILITARY_TIME_COLON_REGEX);

    if (match) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = match[3] ? parseInt(match[3], 10) : 0;

        const date = new Date();
        date.setHours(hours, minutes, seconds, 0);
        return date;
    }
    return null;

}

// Regex for Unix Epoch timestamps (seconds: 10 digits, ms: 13 digits)
const EPOCH_REGEX = /^(\d{10}|\d{13})$/;

function parseEpoch(text: string): Date | null {
    const clean = text.trim();
    const match = clean.match(EPOCH_REGEX);

    if (match) {
        const timestamp = parseInt(match[1], 10);
        // If 10 digits, assume seconds and multiply by 1000
        // If 13 digits, assume milliseconds
        const date = new Date(match[1].length === 10 ? timestamp * 1000 : timestamp);

        // Sanity check: ensure year is reasonable (e.g., between 1970 and 2100)
        // This helps avoid false positives with phone numbers
        const year = date.getFullYear();
        if (year >= 1970 && year <= 2100) {
            return date;
        }
    }
    return null;
}

export function parseDate(text: string): ParseResult | null {
    // Try custom regex first for strict matches

    // 1. Military time
    const militaryDate = parseMilitary(text);
    if (militaryDate) {
        return {
            date: militaryDate,
            text: text,
            start: 0,
            end: text.length,
        };
    }

    // 2. Epoch timestamp
    const epochDate = parseEpoch(text);
    if (epochDate) {
        return {
            date: epochDate,
            text: text,
            start: 0,
            end: text.length,
        };
    }

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
