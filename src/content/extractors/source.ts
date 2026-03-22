import type { DetectedElement } from '@content/detectors/checkbox';
import type { AnalysisSourceType } from '@shared/page-analysis';
import { extractInlineText } from './inline';
import { extractLinkedText } from './linked';
import { extractPdfText, isPdfUrl } from './pdf';

const MIN_INLINE_TEXT_LENGTH = 500;

export interface ResolvedTextSource {
  text: string;
  sourceType: AnalysisSourceType;
}

export async function resolveDetectionTextSource(
  detection: DetectedElement
): Promise<ResolvedTextSource> {
  const inlineText = extractInlineText(detection);

  if (!detection.nearestLink || inlineText.length >= MIN_INLINE_TEXT_LENGTH) {
    return { text: inlineText, sourceType: 'inline' };
  }

  if (isPdfUrl(detection.nearestLink)) {
    const pdfResult = await extractPdfText(detection.nearestLink);
    if (pdfResult.ok && pdfResult.data.length > inlineText.length) {
      return { text: pdfResult.data, sourceType: 'pdf' };
    }

    return { text: inlineText, sourceType: 'inline' };
  }

  const linkedResult = await extractLinkedText(detection.nearestLink);
  if (linkedResult.ok && linkedResult.data.text.length > inlineText.length) {
    return { text: linkedResult.data.text, sourceType: 'linked' };
  }

  return { text: inlineText, sourceType: 'inline' };
}
