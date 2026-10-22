import type { DetectedElement } from '@content/detectors/checkbox';
import { extractElementText } from './dom-text';

const CONTAINER_TAGS = ['DIV', 'SECTION', 'FORM', 'ARTICLE', 'MAIN'];
const MIN_TEXT_LENGTH = 200;

export function extractInlineText(detection: DetectedElement): string {
  const container =
    detection.type === 'fullpage'
      ? (detection.element.querySelector('main,article,[role="main"]') ?? detection.element)
      : findContainer(detection.element);
  let text = extractElementText(container);

  if (
    detection.type !== 'fullpage' &&
    text.length < MIN_TEXT_LENGTH &&
    container.parentElement &&
    container.parentElement !== document.body &&
    container.parentElement !== document.documentElement
  ) {
    const parent = findContainer(container.parentElement);
    text = extractElementText(parent);
  }

  return text;
}

function findContainer(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    if (CONTAINER_TAGS.includes(current.tagName)) {
      return current;
    }
    current = current.parentElement;
  }

  return element.parentElement ?? element;
}
