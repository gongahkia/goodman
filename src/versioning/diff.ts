import { diffLines } from 'diff';
import { MAX_INPUT_TEXT_LENGTH } from '@shared/constants';

export interface DiffSection {
  text: string;
  lineNumber: number;
  previousText?: string;
  previousLineNumber?: number;
}

export interface DiffResult {
  additions: DiffSection[];
  removals: DiffSection[];
  changes: DiffSection[];
  totalChanges: number;
  limited: boolean;
}

export function computeDiff(oldText: string, newText: string): DiffResult {
  const empty = { additions: [], removals: [], changes: [], totalChanges: 0, limited: true };
  if (oldText.length > MAX_INPUT_TEXT_LENGTH || newText.length > MAX_INPUT_TEXT_LENGTH)
    return empty;
  const diffs = diffLines(oldText, newText, { timeout: 250, maxEditLength: 2000 });
  if (!diffs) return empty;
  const additions: DiffSection[] = [];
  const removals: DiffSection[] = [];
  const changes: DiffSection[] = [];

  let lineNumber = 1;
  let previousLineNumber = 1;
  let replacementLineNumber = 1;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i]!;

    if (part.added) {
      const prev = diffs[i - 1];
      if (prev?.removed) {
        changes.push({
          text: part.value,
          lineNumber,
          previousText: prev.value,
          previousLineNumber: replacementLineNumber,
        });
      } else {
        additions.push({ text: part.value, lineNumber });
      }
    } else if (part.removed) {
      replacementLineNumber = previousLineNumber;
      const next = diffs[i + 1];
      if (!next?.added) {
        removals.push({ text: part.value, lineNumber: previousLineNumber });
      }
    }

    if (!part.removed) {
      const lines = part.value.split('\n');
      lineNumber += lines.length - 1;
    }
    if (!part.added) previousLineNumber += part.value.split('\n').length - 1;
  }

  return {
    additions,
    removals,
    changes,
    totalChanges: additions.length + removals.length + changes.length,
    limited: false,
  };
}
