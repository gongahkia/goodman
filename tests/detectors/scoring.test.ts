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
  it('should pass 0.55 confidence checkbox in normal mode', () => {
    const detections = [makeDetection(0.55, 'checkbox')];
    const scored = scoreDetections(detections, 'normal');

    // 0.55 * 1.2 = 0.66, above 0.5 threshold
    expect(scored).toHaveLength(1);
  });

  it('should filter 0.55 confidence checkbox in conservative mode', () => {
    const detections = [makeDetection(0.55, 'checkbox')];
    const scored = scoreDetections(detections, 'conservative');

    // 0.55 * 1.2 = 0.66, below 0.7 threshold
    expect(scored).toHaveLength(0);
  });

  it('should pass low confidence in aggressive mode', () => {
    const detections = [makeDetection(0.35, 'checkbox')];
    const scored = scoreDetections(detections, 'aggressive');

    // 0.35 * 1.2 = 0.42, above 0.3 threshold
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
