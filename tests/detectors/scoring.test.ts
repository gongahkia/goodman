import { describe, it, expect } from 'vitest';
import { scoreDetections } from '@content/detectors/scoring';
import type { DetectedElement } from '@content/detectors/checkbox';

function makeDetection(
  confidence: number,
  type: DetectedElement['type'] = 'checkbox',
  element?: HTMLElement
): DetectedElement {
  return {
    element: element ?? document.createElement('div'),
    type,
    confidence,
    keywords: ['terms'],
    nearestLink: null,
  };
}

describe('scoreDetections', () => {
  it('should pass a strong checkbox detection in normal mode', () => {
    const detections = [makeDetection(0.6, 'checkbox')];
    const scored = scoreDetections(detections, 'normal');

    // 0.6 * 1.15 = 0.69, above 0.65 threshold
    expect(scored).toHaveLength(1);
  });

  it('should filter a mid-confidence checkbox in conservative mode', () => {
    const detections = [makeDetection(0.6, 'checkbox')];
    const scored = scoreDetections(detections, 'conservative');

    // 0.6 * 1.15 = 0.69, below 0.8 threshold
    expect(scored).toHaveLength(0);
  });

  it('should pass lower confidence detections in aggressive mode', () => {
    const detections = [makeDetection(0.4, 'checkbox')];
    const scored = scoreDetections(detections, 'aggressive');

    // 0.4 * 1.15 = 0.46, above 0.4 threshold
    expect(scored).toHaveLength(1);
  });

  it('should deduplicate overlapping detections', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    const detections = [
      makeDetection(0.9, 'modal', parent),
      makeDetection(0.7, 'checkbox', child),
    ];

    const scored = scoreDetections(detections, 'normal');

    expect(scored).toHaveLength(1);
    expect(scored[0]!.element).toBe(parent);
  });

  it('should sort by confidence descending', () => {
    const detections = [
      makeDetection(0.6, 'checkbox'),
      makeDetection(0.9, 'checkbox'),
      makeDetection(0.7, 'checkbox'),
    ];

    const scored = scoreDetections(detections, 'normal');

    expect(scored[0]!.weightedConfidence).toBeGreaterThanOrEqual(
      scored[1]!.weightedConfidence
    );
  });
});
