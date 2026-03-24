import type { Summary } from '@providers/types';
import type { StoredSummary } from '@shared/storage';
import { checkForChanges } from '@versioning/detector';
import type { DiffResult } from '@versioning/diff';
import { notifyChange } from '@versioning/notifications';
import { addVersion } from '@versioning/schema';
import { compareSummaries, type SummaryDiff } from '@versioning/summary-diff';

export interface VersionTrackingResult {
  changed: boolean;
  notified: boolean;
  versionNumber: number | null;
  summaryDiff: SummaryDiff | null;
  textDiff: DiffResult | null;
}

export async function syncVersionHistory(
  domain: string,
  text: string,
  summary: Summary
): Promise<VersionTrackingResult> {
  const changeResult = await checkForChanges(domain, text);
  const versionEntry = await addVersion(domain, text, summary);

  if (!changeResult.previousVersion) {
    return {
      changed: false,
      notified: false,
      versionNumber: versionEntry?.version ?? null,
      summaryDiff: null,
      textDiff: null,
    };
  }

  if (!changeResult.changed || !versionEntry) {
    return {
      changed: false,
      notified: false,
      versionNumber: null,
      summaryDiff: null,
      textDiff: null,
    };
  }

  const previousSummary = toSummary(changeResult.previousVersion.summary);
  const summaryDiff = compareSummaries(previousSummary, summary);
  const meaningfulChange = isMeaningfulSummaryChange(summaryDiff);
  const notified = meaningfulChange
    ? await notifyChange(domain, summaryDiff)
    : false;

  return {
    changed: true,
    notified,
    versionNumber: versionEntry.version,
    summaryDiff,
    textDiff: null, // fullText no longer stored; text diff unavailable
  };
}

function isMeaningfulSummaryChange(diff: SummaryDiff): boolean {
  return (
    diff.addedRedFlags.length > 0 ||
    diff.removedRedFlags.length > 0 ||
    diff.changedRedFlags.length > 0 ||
    diff.severityChange !== null ||
    diff.newKeyPoints.length > 0 ||
    diff.removedKeyPoints.length > 0
  );
}

function toSummary(summary: StoredSummary): Summary {
  return {
    summary: summary.summary,
    keyPoints: summary.keyPoints,
    redFlags: summary.redFlags.map((flag) => ({
      ...flag,
      category: flag.category as Summary['redFlags'][number]['category'],
    })),
    severity: summary.severity,
  };
}
