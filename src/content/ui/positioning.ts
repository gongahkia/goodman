const VIEWPORT_MARGIN = 8;
const OVERLAY_WIDTH = 380;
const OVERLAY_HEIGHT = 500;

export function positionOverlay(overlay: HTMLElement, anchor: HTMLElement): () => void {
  const reposition = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = anchorRect.right + VIEWPORT_MARGIN;
    let top = anchorRect.top + (anchorRect.height / 2) - (OVERLAY_HEIGHT / 2);

    if (left + OVERLAY_WIDTH > viewportWidth - VIEWPORT_MARGIN) {
      left = anchorRect.left - OVERLAY_WIDTH - VIEWPORT_MARGIN;
    }
    if (left < VIEWPORT_MARGIN) {
      left = VIEWPORT_MARGIN;
    }
    if (top + OVERLAY_HEIGHT > viewportHeight - VIEWPORT_MARGIN) {
      top = viewportHeight - OVERLAY_HEIGHT - VIEWPORT_MARGIN;
    }
    if (top < VIEWPORT_MARGIN) {
      top = VIEWPORT_MARGIN;
    }

    overlay.style.position = 'fixed';
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
    overlay.style.width = '0';
    overlay.style.height = '0';
  };

  reposition();

  let rafId = 0;
  const throttledReposition = (): void => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; reposition(); });
  };

  window.addEventListener('scroll', throttledReposition, { passive: true });
  window.addEventListener('resize', throttledReposition, { passive: true });

  return () => {
    window.removeEventListener('scroll', throttledReposition, { passive: true } as EventListenerOptions);
    window.removeEventListener('resize', throttledReposition, { passive: true } as EventListenerOptions);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
