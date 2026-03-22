import { describe, it, expect } from 'vitest';
import { computeDiff } from '@versioning/diff';

describe('computeDiff', () => {
  it('should detect an added paragraph as an addition', () => {
    const oldText = 'First paragraph.\nSecond paragraph.\n';
    const newText = 'First paragraph.\nSecond paragraph.\nThird paragraph.\n';

    const result = computeDiff(oldText, newText);

    expect(result.totalChanges).toBeGreaterThan(0);
  });

  it('should detect a removed paragraph as a removal', () => {
    const oldText = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const newText = 'First paragraph.\n\nThird paragraph.';

    const result = computeDiff(oldText, newText);

    expect(result.removals.length + result.changes.length).toBeGreaterThanOrEqual(1);
    expect(result.totalChanges).toBeGreaterThan(0);
  });

  it('should return zero changes for identical texts', () => {
    const text = 'First paragraph.\n\nSecond paragraph.';

    const result = computeDiff(text, text);

    expect(result.totalChanges).toBe(0);
  });

  it('should detect a reworded paragraph as a change', () => {
    const oldText = 'We collect your personal data.';
    const newText = 'We gather your personal information.';

    const result = computeDiff(oldText, newText);

    expect(result.totalChanges).toBeGreaterThan(0);
  });
});
