import type { DetectedElement } from '@content/detectors/checkbox';
import type { AnalysisSourceType } from '@shared/page-analysis';
import { extractInlineText } from './inline';
import { extractLinkedText } from './linked';
import { extractPdfText, isPdfUrl } from './pdf';
import { ExtractionError } from '@shared/errors';
import { fetchLegalDocument, isPdfDocument } from './fetch';

export interface ResolvedTextSource {
  text: string;
  sourceType: AnalysisSourceType;
}

export async function resolveDetectionTextSource(
  detection: DetectedElement
): Promise<ResolvedTextSource> {
  const inlineText = extractInlineText(detection);

  if (!detection.nearestLink) {
    return { text: inlineText, sourceType: 'inline' };
  }

  const resource = await fetchLegalDocument(detection.nearestLink);
  if (isPdfDocument(resource)) {
    const pdfResult = await extractPdfText(detection.nearestLink, resource.bytes);
    if (pdfResult.ok && pdfResult.data.trim()) {
      return { text: pdfResult.data, sourceType: 'pdf' };
    }

    throw new ExtractionError(
      pdfResult.ok ? 'Linked PDF has no legal text' : pdfResult.error.message
    );
  }
  if (isPdfUrl(detection.nearestLink))
    throw new ExtractionError('The linked PDF returned a different document type');

  const linkedResult = await extractLinkedText(detection.nearestLink, resource);
  if (linkedResult.ok && linkedResult.data.text.trim()) {
    return { text: linkedResult.data.text, sourceType: 'linked' };
  }

  throw new ExtractionError(
    linkedResult.ok ? 'Linked agreement has no legal text' : linkedResult.error.message
  );
}
