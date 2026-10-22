import { DEBOUNCE_MS } from '@shared/constants';

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMutations: MutationRecord[] = [];

export function startObserver(
  callback: (mutations: MutationRecord[]) => void
): MutationObserver | null {
  if (typeof MutationObserver === 'undefined') return null; // guard: service worker has no DOM
  if (observer) {
    stopObserver();
  }

  observer = new MutationObserver((mutations: MutationRecord[]) => {
    const relevant = mutations.filter(isRelevantMutation);
    if (relevant.length === 0) return;

    // Keep a bounded sample and flush even while a page changes continuously.
    pendingMutations.push(...relevant.slice(0, 100 - pendingMutations.length));
    if (debounceTimer) return;

    debounceTimer = setTimeout(() => {
      const batch = [...pendingMutations];
      pendingMutations = [];
      debounceTimer = null;
      callback(batch);
    }, DEBOUNCE_MS);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'hidden',
      'aria-hidden',
      'class',
      'style',
      'href',
      'for',
      'type',
      'role',
      'aria-label',
      'checked',
      'disabled',
    ],
  });

  return observer;
}

export function stopObserver(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  pendingMutations = [];
}

function isRelevantMutation(mutation: MutationRecord): boolean {
  const target =
    mutation.target.nodeType === Node.ELEMENT_NODE
      ? (mutation.target as Element)
      : mutation.target.parentElement;
  if (target && isOverlayNode(target)) return false;
  if (mutation.type === 'characterData' || mutation.type === 'attributes') return true;
  if (mutation.type !== 'childList') return false;

  for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
    if (
      node.nodeType === Node.TEXT_NODE ||
      (node.nodeType === Node.ELEMENT_NODE && !isOverlayNode(node as Element))
    ) {
      return true;
    }
  }

  return false;
}

function isOverlayNode(node: Element): boolean {
  return Boolean(node.closest('#goodman-overlay-host, #goodman-consent-warning-host'));
}
