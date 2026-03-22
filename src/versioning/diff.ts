import { diffLines } from 'diff';

export interface DiffSection {
  text: string;
  lineNumber: number;
}

export interface DiffResult {
  additions: DiffSection[];
  removals: DiffSection[];
  changes: DiffSection[];
  totalChanges: number;
}

export function computeDiff(oldText: string, newText: string): DiffResult {
  const diffs = diffLines(oldText, newText);
  const additions: DiffSection[] = [];
  const removals: DiffSection[] = [];
  const changes: DiffSection[] = [];

  let lineNumber = 1;

  for (let i = 0; i < diffs.length; i++) {
    const part = diffs[i]!;

    if (part.added) {
      const prev = diffs[i - 1];
      if (prev?.removed) {
        changes.push({ text: part.value, lineNumber });
      } else {
        additions.push({ text: part.value, lineNumber });
      }
    } else if (part.removed) {
      const next = diffs[i + 1];
      if (!next?.added) {
        removals.push({ text: part.value, lineNumber });
      }
    }

    if (!part.removed) {
      const lines = part.value.split('\n');
      lineNumber += lines.length - 1;
    }
  }

  return {
    additions,
    removals,
    changes,
    totalChanges: additions.length + removals.length + changes.length,
  };
}
