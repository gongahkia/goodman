import type {
  PageAnalysisLogEntry,
  PageAnalysisLogLevel,
} from './page-analysis';

const MAX_PROGRESS_LOGS = 8;

export function clampProgress(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

export function appendProgressLog(
  logs: PageAnalysisLogEntry[] | undefined,
  message: string,
  progress: number,
  level: PageAnalysisLogLevel = 'info'
): PageAnalysisLogEntry[] {
  const normalizedProgress = clampProgress(progress);
  const nextLogs = [...(logs ?? [])];
  const last = nextLogs[nextLogs.length - 1];

  if (
    last &&
    last.message === message &&
    last.level === level &&
    last.progress === normalizedProgress
  ) {
    return nextLogs;
  }

  nextLogs.push({
    timestamp: Date.now(),
    message,
    progress: normalizedProgress,
    level,
  });

  return nextLogs.slice(-MAX_PROGRESS_LOGS);
}
