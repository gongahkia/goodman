import type { Summary, RedFlag } from '@providers/types';

export interface SummaryDiff {
  addedRedFlags: RedFlag[];
  removedRedFlags: RedFlag[];
  changedRedFlags: { old: RedFlag; new: RedFlag }[];
  severityChange: { old: string; new: string } | null;
  newKeyPoints: string[];
  removedKeyPoints: string[];
}

export function compareSummaries(
  oldSummary: Summary,
  newSummary: Summary
): SummaryDiff {
  const addedRedFlags: RedFlag[] = [];
  const removedRedFlags: RedFlag[] = [];
  const changedRedFlags: { old: RedFlag; new: RedFlag }[] = [];

  const oldFlagMap = new Map(oldSummary.redFlags.map((f) => [f.category, f]));
  const newFlagMap = new Map(newSummary.redFlags.map((f) => [f.category, f]));

  for (const [category, newFlag] of newFlagMap) {
    const oldFlag = oldFlagMap.get(category);
    if (!oldFlag) {
      addedRedFlags.push(newFlag);
    } else if (oldFlag.severity !== newFlag.severity || oldFlag.description !== newFlag.description) {
      changedRedFlags.push({ old: oldFlag, new: newFlag });
    }
  }

  for (const [category, oldFlag] of oldFlagMap) {
    if (!newFlagMap.has(category)) {
      removedRedFlags.push(oldFlag);
    }
  }

  const severityChange =
    oldSummary.severity !== newSummary.severity
      ? { old: oldSummary.severity, new: newSummary.severity }
      : null;

  const newKeyPoints = newSummary.keyPoints.filter(
    (point) => !oldSummary.keyPoints.some((old) => jaccardSimilarity(old, point) > 0.5)
  );

  const removedKeyPoints = oldSummary.keyPoints.filter(
    (point) => !newSummary.keyPoints.some((np) => jaccardSimilarity(point, np) > 0.5)
  );

  return {
    addedRedFlags,
    removedRedFlags,
    changedRedFlags,
    severityChange,
    newKeyPoints,
    removedKeyPoints,
  };
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}
