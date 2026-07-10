import { parseDate } from './parser';

export interface HoverEntity {
    start: number;
    end: number;
    text: string;
}

const HOVER_CANDIDATE_REGEX = /\b(?:tomorrow|today|yesterday)(?:\s+at)?\s+\d{1,2}(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?(?:\s+[A-Z]{2,5})?\b|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?\b|\b\d{13}\b|\b\d{10}\b|\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[A-Z]{2,5})?\b|\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)(?:\s*[A-Z]{2,5})?\b/gi;

export function findHoverEntities(text: string): HoverEntity[] {
    const entities: HoverEntity[] = [];
    const seen = new Set<string>();

    for (const match of text.matchAll(HOVER_CANDIDATE_REGEX)) {
        const rawCandidate = match[0];
        const rawStart = match.index;
        const leadingWhitespace = rawCandidate.length - rawCandidate.trimStart().length;
        const candidate = rawCandidate.trim();
        const parsed = parseDate(candidate);

        if (!parsed) {
            continue;
        }

        const start = rawStart + leadingWhitespace + parsed.start;
        const end = start + parsed.text.length;
        const key = `${String(start)}:${String(end)}`;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        entities.push({ start, end, text: text.slice(start, end) });
    }

    return entities.sort((a, b) => a.start - b.start);
}
