import { ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { TCGuardError } from '@shared/errors';
import type { LLMProvider, Summary, RedFlag } from './types';

export class FixtureProvider implements LLMProvider {
  name = 'fixture';

  constructor(private defaultModel: string = 'fixture-v1') {}

  async summarize(
    text: string
  ): Promise<Result<Summary, TCGuardError>> {
    const termsText = extractTermsText(text);
    const normalized = termsText.toLowerCase();
    const redFlags: RedFlag[] = [];

    if (normalized.includes('binding arbitration')) {
      redFlags.push({
        category: 'arbitration_clause',
        description: 'Disputes must go through private arbitration instead of court.',
        severity: 'high',
        quote: extractQuote(termsText, 'binding arbitration'),
      });
    }

    if (normalized.includes('class action waiver')) {
      redFlags.push({
        category: 'class_action_waiver',
        description: 'The terms waive the user’s ability to participate in class actions.',
        severity: 'high',
        quote: extractQuote(termsText, 'class action waiver'),
      });
    }

    if (
      normalized.includes('recurring billing') ||
      normalized.includes('automatic subscription renewal')
    ) {
      redFlags.push({
        category: 'automatic_renewal',
        description: 'The agreement includes an auto-renewing billing commitment.',
        severity: 'medium',
        quote: extractQuote(
          termsText,
          normalized.includes('recurring billing')
            ? 'recurring billing'
            : 'automatic subscription renewal'
        ),
      });
    }

    const summary = buildSummary(termsText, redFlags);
    return ok(summary);
  }

  async validateApiKey(_key: string): Promise<boolean> {
    return true;
  }

  async listModels(): Promise<string[]> {
    return [this.defaultModel];
  }
}

function extractTermsText(input: string): string {
  const match = input.match(
    /---BEGIN T&C---\s*([\s\S]*?)\s*---END T&C---/
  );
  return (match?.[1] ?? input).trim();
}

function extractQuote(text: string, needle: string): string {
  const sentence = text
    .split(/(?<=[.!?])\s+/)
    .find((part) => part.toLowerCase().includes(needle.toLowerCase()));
  return sentence?.trim() ?? needle;
}

function buildSummary(text: string, redFlags: RedFlag[]): Summary {
  const keyPoints = [
    'The page requires agreement before continuing.',
    'The terms include ongoing billing and dispute-resolution commitments.',
    'The agreement shifts risk toward the company.',
  ];

  const severity: Summary['severity'] =
    redFlags.some((flag) => flag.severity === 'high') ? 'high' : 'medium';

  return {
    summary:
      redFlags.length > 0
        ? 'These terms gate checkout behind agreement and include renewal and dispute provisions that materially affect the user.'
        : `These terms govern the action on this page: ${text.slice(0, 120).trim()}.`,
    keyPoints,
    redFlags,
    severity,
  };
}
