import { DEBOUNCE_MS } from '@shared/constants';

let observer: MutationObserver | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingMutations: MutationRecord[] = [];

export function startObserver(
  callback: (mutations: MutationRecord[]) => void
): MutationObserver {
  if (observer) {
    stopObserver();
  }

  observer = new MutationObserver((mutations: MutationRecord[]) => {
    const relevant = mutations.filter(isRelevantMutation);
    if (relevant.length === 0) return;

    pendingMutations.push(...relevant);

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

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
  if (mutation.type !== 'childList') return false;

  for (const node of mutation.addedNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return true;
    }
  }

  return false;
}
