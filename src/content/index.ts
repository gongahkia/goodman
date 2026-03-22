import { onMessage, sendToBackground } from '@shared/messaging';
import type { Message, MessageResponse } from '@shared/messages';
import type { Runtime } from 'webextension-polyfill';
import { detectCheckboxes } from '@content/detectors/checkbox';
import { detectModals } from '@content/detectors/modal';
import { detectFullPageTC } from '@content/detectors/fullpage';
import { scoreDetections } from '@content/detectors/scoring';
import { extractInlineText } from '@content/extractors/inline';
import { extractLinkedText } from '@content/extractors/linked';
import { normalizeText } from '@content/extractors/normalizer';
import { createOverlay, removeOverlay } from '@content/ui/overlay';
import { getStorage } from '@shared/storage';
import type { Summary } from '@providers/types';

onMessage(
  (msg: Message, _sender: Runtime.MessageSender): Promise<MessageResponse> | undefined => {
    switch (msg.type) {
      case 'DETECT_TC':
        return handleDetectTC();
      default:
        return undefined;
    }
  }
);

async function handleDetectTC(): Promise<MessageResponse> {
  removeOverlay();

  const settingsResult = await getStorage('settings');
  const sensitivity = settingsResult.ok
    ? settingsResult.data.detectionSensitivity
    : 'normal' as const;
  const providerName = settingsResult.ok
    ? settingsResult.data.activeProvider
    : 'openai';

  const detections = [
    ...detectCheckboxes(document.body),
    ...detectModals(document.body),
  ];

  const fullPage = detectFullPageTC(document.body);
  if (fullPage) detections.push(fullPage);

  const scored = scoreDetections(detections, sensitivity);

  if (scored.length === 0) {
    return { ok: true, data: [] };
  }

  const best = scored[0]!;

  let text = extractInlineText(best);

  if (best.nearestLink && text.length < 500) {
    const linked = await extractLinkedText(best.nearestLink);
    if (linked.ok && linked.data.text.length > text.length) {
      text = linked.data.text;
    }
  }

  const normalized = normalizeText(text);
  if (normalized.text.length < 50) {
    return { ok: true, data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })) };
  }

  const summaryResponse = await sendToBackground({
    type: 'SUMMARIZE',
    payload: { text: normalized.text, provider: providerName },
  });

  const result = summaryResponse as { ok: boolean; data?: Summary; error?: string };
  if (!result.ok || !result.data) {
    return { ok: false, error: result.error ?? 'Summarization failed' };
  }

  createOverlay(best, result.data);

  return {
    ok: true,
    data: scored.map((d) => ({ type: d.type, confidence: d.weightedConfidence })),
  };
}
