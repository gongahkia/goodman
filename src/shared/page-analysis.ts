import type { Summary } from '@providers/types';

export type DetectionType = 'checkbox' | 'modal' | 'banner' | 'fullpage';
export type AnalysisSourceType = 'inline' | 'linked' | 'pdf';
export type PageAnalysisStatus =
  | 'idle'
  | 'analyzing'
  | 'no_detection'
  | 'needs_provider'
  | 'error'
  | 'ready';

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
  updatedAt: number;
}
