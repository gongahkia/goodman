/**
 * Adding a New LLM Provider
 *
 * Step 1: Create `src/providers/{name}.ts` implementing `LLMProvider`.
 *         Your class must implement `summarize()`, `validateApiKey()`, and optionally `listModels()`.
 *
 * Step 2: Register it in `src/providers/factory.ts` by adding to the provider map.
 *         Add your provider name as a key and the constructor as a value.
 *
 * Step 3: Add a settings tab in `src/popup/settings/providers.ts`.
 *         Follow the existing pattern for API key input, model selector, and test button.
 *
 * Step 4: Add the provider name to the `activeProvider` union type in `src/shared/messages.ts`.
 *         Also add default config in `src/shared/storage.ts` DEFAULT_SETTINGS.providers.
 *
 * Step 5: Write tests in `tests/providers/{name}.test.ts`.
 *         Mock the HTTP calls — never make real API calls in tests.
 *
 * Minimum implementation example:
 *
 * ```typescript
 * import type { LLMProvider, Summary, SummarizeOptions } from './types';
 *
 * export class MyProvider implements LLMProvider {
 *   name = 'myprovider';
 *
 *   async summarize(text: string, options: SummarizeOptions): Promise<Summary> {
 *     const response = await fetch('https://api.myprovider.com/v1/chat', {
 *       method: 'POST',
 *       headers: { 'Authorization': `Bearer ${options.apiKey}` },
 *       body: JSON.stringify({ prompt: text, model: options.model }),
 *     });
 *     const json = await response.json();
 *     return parseSummary(json);
 *   }
 *
 *   async validateApiKey(key: string): Promise<boolean> {
 *     // Make a minimal API call to verify the key
 *     return true;
 *   }
 * }
 * ```
 */

import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import type { AnalysisSourceType, DetectionType } from '@shared/page-analysis';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type RedFlagSeverity = 'low' | 'medium' | 'high';

export type RedFlagCategory =
  | 'data_selling'
  | 'arbitration_clause'
  | 'class_action_waiver'
  | 'automatic_renewal'
  | 'biometric_data'
  | 'third_party_sharing'
  | 'jurisdiction_change'
  | 'liability_limitation'
  | 'content_ownership_transfer'
  | 'unilateral_changes'
  | 'no_deletion_right'
  | 'location_tracking';

export interface RedFlag {
  category: RedFlagCategory;
  description: string;
  severity: RedFlagSeverity;
  quote: string;
}

export interface Summary {
  summary: string;
  keyPoints: string[];
  redFlags: RedFlag[];
  severity: Severity;
}

export interface SummarizeOptions {
  model: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  rawText?: string;
  metadata?: {
    url?: string;
    domain?: string;
    sourceType?: AnalysisSourceType;
    detectionType?: DetectionType;
    clientVersion?: string;
  };
}

export interface LLMProvider {
  name: string;
  summarize(
    text: string,
    options: SummarizeOptions
  ): Promise<Result<Summary, TCGuardError>>;
  validateApiKey(key: string): Promise<boolean>;
  listModels?(): Promise<string[]>;
}
