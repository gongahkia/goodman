import type { Summary } from '@providers/types';
import { computeSeverity } from './severity';

/** Only present a quotation as evidence if it occurs in the extracted agreement. */
export function groundSummary(summary: Summary, text: string): Summary {
  const normalize = (value: string): string => value.normalize('NFC').replace(/\s+/g, ' ').trim();
  const source = normalize(text);
  const redFlags = summary.redFlags.map(flag => ({
    ...flag,
    quote: flag.quote.trim() && source.includes(normalize(flag.quote)) ? flag.quote : '',
  }));
  return { ...summary, redFlags, severity: computeSeverity(redFlags) };
}
