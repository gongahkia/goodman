import { getDetectionRoots, type DetectionRoot } from './roots';
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

  const observed = new WeakSet<DetectionRoot>();
  const observeRoots = (root: DetectionRoot): void => {
    for (const tree of getDetectionRoots(root)) {
      if (observed.has(tree)) continue;
      observed.add(tree);
      observer?.observe(tree, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          'hidden',
          'aria-hidden',
          'aria-checked',
          'aria-labelledby',
          'class',
          'style',
          'href',
          'for',
          'type',
          'role',
          'checked',
          'disabled',
        ],
      });
    }
  };

  observer = new MutationObserver((mutations: MutationRecord[]) => {
    const relevant = mutations.filter(isRelevantMutation);
    for (const mutation of relevant) {
      for (const node of mutation.addedNodes) if (node instanceof Element) observeRoots(node);
    }
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

  observeRoots(document.body);

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
  return Boolean(
    node.closest('#goodman-overlay-host, #goodman-consent-warning-host, #goodman-summary-chip')
  );
}
