import type { DetectedElement } from './checkbox';
import { SENSITIVITY_THRESHOLDS } from '@shared/constants';

export interface ScoredDetection extends DetectedElement {
  weightedConfidence: number;
}

const TYPE_WEIGHTS: Record<string, number> = {
  checkbox: 1.2,
  modal: 1.0,
  fullpage: 0.9,
  banner: 0.8,
};

export function scoreDetections(
  detections: DetectedElement[],
  sensitivity: 'aggressive' | 'normal' | 'conservative'
): ScoredDetection[] {
  const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

  const scored = detections.map((d) => {
    const weight = TYPE_WEIGHTS[d.type] ?? 1.0;
    const weightedConfidence = d.confidence * weight;
    return { ...d, weightedConfidence };
  });

  const filtered = scored.filter((d) => d.weightedConfidence >= threshold);
  const sorted = filtered.sort((a, b) => b.weightedConfidence - a.weightedConfidence);
  return deduplicateOverlapping(sorted);
}

function deduplicateOverlapping(detections: ScoredDetection[]): ScoredDetection[] {
  const result: ScoredDetection[] = [];

  for (const detection of detections) {
    const isOverlapping = result.some(
      (existing) =>
        existing.element.contains(detection.element) ||
        detection.element.contains(existing.element)
    );
    if (!isOverlapping) {
      result.push(detection);
    }
  }

  return result;
}
