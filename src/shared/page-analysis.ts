import type { Summary } from '@providers/types';

export type DetectionType = 'checkbox' | 'modal' | 'banner' | 'fullpage';
export type AnalysisSourceType = 'inline' | 'linked' | 'pdf';
export type PageAnalysisLogLevel = 'info' | 'success' | 'warning' | 'error';
export type PageAnalysisStatus =
  | 'idle'
  | 'analyzing'
  | 'no_detection'
  | 'extraction_failed'
  | 'needs_consent'
  | 'needs_provider'
  | 'service_unavailable'
  | 'error'
  | 'ready';

export interface PageAnalysisLogEntry {
  timestamp: number;
  message: string;
  progress: number;
  level: PageAnalysisLogLevel;
}

export interface PageAnalysisRecord {
  tabId: number;
  url: string;
  domain: string;
  status: PageAnalysisStatus;
  sourceType: AnalysisSourceType | null;
  detectionType: DetectionType | null;
  confidence: number | null;
  textHash: string | null;
  summary: Summary | null;
  error: string | null;
  progressPercent?: number | null;
  progressLabel?: string | null;
  progressLogs?: PageAnalysisLogEntry[];
  updatedAt: number;
}
