import type { Result } from './result';
import type {
  AnalysisSourceType,
  DetectionType,
  PageAnalysisRecord,
} from './page-analysis';

export interface DetectTCMessage {
  type: 'DETECT_TC';
  payload: { tabId: number };
}

export interface ExtractTextMessage {
  type: 'EXTRACT_TEXT';
  payload: { selector: string; url: string };
}

export interface FetchURLMessage {
  type: 'FETCH_URL';
  payload: { url: string };
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

export interface SavePageAnalysisMessage {
  type: 'SAVE_PAGE_ANALYSIS';
  payload: PageAnalysisRecord;
}

export interface ProcessPageAnalysisMessage {
  type: 'PROCESS_PAGE_ANALYSIS';
  payload: {
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

export type Message =
  | DetectTCMessage
  | ExtractTextMessage
  | FetchURLMessage
  | SummarizeMessage
  | GetSettingsMessage
  | SaveSettingsMessage
  | GetPageAnalysisMessage
  | SavePageAnalysisMessage
  | ProcessPageAnalysisMessage
  | TCChangedMessage;

export type MessageType = Message['type'];

export interface Settings {
  activeProvider: 'openai' | 'claude' | 'gemini' | 'ollama' | 'custom';
  providers: Record<string, ProviderConfig>;
  detectionSensitivity: 'aggressive' | 'normal' | 'conservative';
  darkMode: 'auto' | 'light' | 'dark';
  notifyOnChange: boolean;
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export type MessageResponse = Result<unknown, string> | unknown;
