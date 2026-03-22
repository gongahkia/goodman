import type { DetectedElement } from '@content/detectors/checkbox';

const CONTAINER_TAGS = ['DIV', 'SECTION', 'FORM', 'ARTICLE', 'MAIN'];
const MIN_TEXT_LENGTH = 200;

export function extractInlineText(detection: DetectedElement): string {
  const container = findContainer(detection.element);
  let text = container.innerText.trim();

  if (text.length < MIN_TEXT_LENGTH && container.parentElement) {
    const parent = findContainer(container.parentElement);
    text = parent.innerText.trim();
  }

  return text.replace(/\s+/g, ' ').trim();
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
