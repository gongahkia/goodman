import { describe, expect, it } from 'vitest';
import { FixtureProvider } from '@providers/fixture';

describe('FixtureProvider', () => {
  it('returns deterministic red flags for known legal clauses', async () => {
    const provider = new FixtureProvider();

    const result = await provider.summarize(
      `Analyze the following Terms & Conditions document:
---BEGIN T&C---
By continuing, you agree to recurring billing, binding arbitration, and a class action waiver.
---END T&C---`,
      {
        model: 'fixture-v1',
        systemPrompt: 'test',
        maxTokens: 100,
        temperature: 0,
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.severity).toBe('high');
    expect(result.data.redFlags.map((flag) => flag.category)).toEqual([
      'arbitration_clause',
      'class_action_waiver',
      'automatic_renewal',
    ]);
  });
});
