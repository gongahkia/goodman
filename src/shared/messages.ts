import type { Result } from './result';
import type { ClauseTaxonomyWeights } from './clause-taxonomy';
import type { AnalysisSourceType, DetectionType, PageAnalysisRecord } from './page-analysis';
import type { AgreementDocument } from './documents';

export type AnalysisMode = 'detect_only' | 'ask' | 'automatic';
export interface ManualAnalysisInput {
  text?: string;
  url?: string;
  useSelection?: boolean;
}
export interface ManualAnalysisMessage {
  type: 'MANUAL_ANALYSIS';
  payload: ManualAnalysisInput;
}

export interface DetectTCMessage {
  type: 'DETECT_TC';
  payload: { tabId: number; settingsOverride?: Partial<Settings> };
}

export interface CancelTCMessage {
  type: 'CANCEL_TC';
  payload: { tabId: number; expectedUrl?: string };
}

export interface ExtractTextMessage {
  type: 'EXTRACT_TEXT';
  payload: { selector: string; url: string };
}

export interface FetchURLMessage {
  type: 'FETCH_URL';
  payload: { url: string; responseType?: 'text' | 'base64' | 'document' };
}

export interface ParsePdfMessage {
  type: 'PARSE_PDF';
  payload: { body: string };
}

export interface SummarizeMessage {
  type: 'SUMMARIZE';
  payload: { text: string; provider: string };
}

export interface GetSettingsMessage {
  type: 'GET_SETTINGS';
}

export interface SaveSettingsMessage {
  type: 'SAVE_SETTINGS';
  payload: Settings;
}

export interface GetPageAnalysisMessage {
  type: 'GET_PAGE_ANALYSIS';
  payload: { tabId: number };
}

export interface OpenWorkspaceSurfaceMessage {
  type: 'OPEN_WORKSPACE_SURFACE';
  payload: {
    tabId?: number;
    windowId?: number;
    route?: WorkspaceRoute;
    domain?: string;
  };
}

export type WorkspaceRoute =
  | 'current'
  | 'history'
  | 'providers'
  | 'detection'
  | 'monitoring'
  | 'data'
  | 'diagnostics';

export interface CancelPageAnalysisMessage {
  type: 'CANCEL_PAGE_ANALYSIS';
  payload: { tabId: number; expectedUrl?: string };
}

export interface SavePageAnalysisMessage {
  type: 'SAVE_PAGE_ANALYSIS';
  payload: PageAnalysisRecord;
}

export interface ProcessPageAnalysisMessage {
  type: 'PROCESS_PAGE_ANALYSIS';
  payload: {
    document?: AgreementDocument;
    availableDocuments?: AgreementDocument[];
    userInitiated?: boolean;
    text: string;
    provider: string;
    url: string;
    domain: string;
    sourceType: AnalysisSourceType;
    detectionType: DetectionType;
    confidence: number;
  };
}

export interface TCChangedMessage {
  type: 'TC_CHANGED';
  payload: { domain: string; diff: unknown };
}

export interface SetTextRetentionMessage {
  type: 'SET_TEXT_RETENTION';
  payload: { domain: string; enabled: boolean };
}

export type Message =
  | ManualAnalysisMessage
  | DetectTCMessage
  | CancelTCMessage
  | ExtractTextMessage
  | FetchURLMessage
  | ParsePdfMessage
  | SummarizeMessage
  | GetSettingsMessage
  | SaveSettingsMessage
  | GetPageAnalysisMessage
  | OpenWorkspaceSurfaceMessage
  | CancelPageAnalysisMessage
  | SavePageAnalysisMessage
  | ProcessPageAnalysisMessage
  | SetTextRetentionMessage
  | TCChangedMessage;

export type MessageType = Message['type'];

export interface Settings {
  analysisMode: AnalysisMode;
  activeProvider: 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom' | 'fixture';
  providers: Record<string, ProviderConfig>;
  detectionSensitivity: 'aggressive' | 'normal' | 'conservative';
  darkMode: 'auto' | 'light' | 'dark';
  notifyOnChange: boolean;
  corpusContribution: CorpusContributionSettings;
  clauseTaxonomyWeights: ClauseTaxonomyWeights;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export interface CorpusContributionSettings {
  enabled: boolean;
}

export type MessageResponse = Result<unknown, string> | unknown;
