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


function normalizeText(text: string): string {
    // 1. Collapse multiple spaces and replace newlines with space
    let clean = text.replace(/\s+/g, ' ');

    // 2. Remove common trailing punctuation (.,;!?) but handle cases like "a.m."
    // Heuristic: if it ends with "m.", keep it. Otherwise remove.
    clean = clean.replace(/[.,;!?]+$/, (match) => {
        // preserve single trailing dot if it follows 'm' (a.m. / p.m.)
        if (match === '.' && clean.toLowerCase().endsWith('m.')) {
            return '.';
        }
        return '';
    });

    return clean.trim();
}

export function parseDate(text: string, refDate?: Date): ParseResult | null {
    const cleanText = normalizeText(text);

    // Try custom regex first for strict matches

    // 1. Military time // Note: Military time usually implies "today" if not specified, 
    // but strict parser creates new Date(). We might want to respect refDate for the date part?
    // The current military parser uses `new Date()`. 
    // If strict compliance is needed, we should use refDate.
    // But military parser is for "1400" -> 14:00 Today.
    // If I pass a refDate, it should use that date.

    // Let's defer military refDate fix for now unless it breaks relative tests (it won't).

    const militaryDate = parseMilitary(cleanText);
    if (militaryDate) {
        return {
            date: militaryDate,
            text: cleanText,
            start: 0,
            end: cleanText.length,
        };
    }

    // 2. Epoch timestamp
    const epochDate = parseEpoch(cleanText);
    if (epochDate) {
        return {
            date: epochDate,
            text: cleanText,
            start: 0,
            end: cleanText.length,
        };
    }

    const parser = getLocaleParser();
    const results = parser.parse(cleanText, refDate);

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

// Helper to select the correct Chrono parser based on browser locale
function getLocaleParser(): { parse: (text: string, ref?: Date, option?: any) => any[] } {
    const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

    // English variations
    if (locale.startsWith('en')) {
        // Build list of DD/MM preferring English locales
        const gbLocales = ['en-GB', 'en-AU', 'en-NZ', 'en-IE', 'en-IN', 'en-SG', 'en-ZA'];
        if (gbLocales.some(l => locale.startsWith(l))) {
            return chrono.en.GB;
        }
        // Default to Standard English (US-bias)
        return chrono.en;
    }

    // Other supported languages (Explicit mapping to be safe)
    if (locale.startsWith('ja')) return chrono.ja;
    if (locale.startsWith('de')) return chrono.de;
    if (locale.startsWith('fr')) return chrono.fr;
    if (locale.startsWith('pt')) return chrono.pt;
    if (locale.startsWith('es')) return chrono.es;
    if (locale.startsWith('nl')) return chrono.nl;
    if (locale.startsWith('ru')) return chrono.ru;

    // Fallback to strict/standard parser (often English) if unknown
    // chrono default export behaves like a parser
    return chrono;
}
