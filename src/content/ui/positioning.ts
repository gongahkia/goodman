const VIEWPORT_MARGIN = 8;
const OVERLAY_WIDTH = 380;
const OVERLAY_MAX_WIDTH_RATIO = 0.92;
const OVERLAY_HEIGHT = 500;

export function positionOverlay(
  overlay: HTMLElement,
  anchor: HTMLElement,
  surface = overlay
): () => void {
  // Capture a bounded set once. Scrolling never queries/measures every control on the page.
  const scope = anchor.closest('form,[role="dialog"],section') ?? document.body;
  const controlsToAvoid = [
    ...scope.querySelectorAll(
      'input:not([type="hidden"]),textarea,select,button,a[href],[role="button"]'
    ),
  ].slice(0, 100);
  const reposition = (): void => {
    const anchorRect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const rect = surface.getBoundingClientRect();
    const effectiveWidth =
      rect.width || Math.min(OVERLAY_WIDTH, viewportWidth * OVERLAY_MAX_WIDTH_RATIO);
    const effectiveHeight =
      rect.height || Math.min(OVERLAY_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
    const right = Math.max(VIEWPORT_MARGIN, viewportWidth - effectiveWidth - VIEWPORT_MARGIN);
    const bottom = Math.max(VIEWPORT_MARGIN, viewportHeight - effectiveHeight - VIEWPORT_MARGIN);
    const nearTop = Math.max(VIEWPORT_MARGIN, Math.min(bottom, anchorRect.top));
    const controls = controlsToAvoid
      .filter((element) => element.isConnected)
      .map((element) => element.getBoundingClientRect())
      .filter(
        (box) => box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < viewportHeight
      );
    const candidates = [
      [right, nearTop],
      [VIEWPORT_MARGIN, nearTop],
      [right, bottom],
      [VIEWPORT_MARGIN, bottom],
      [right, VIEWPORT_MARGIN],
      [VIEWPORT_MARGIN, VIEWPORT_MARGIN],
    ];
    const overlap = ([x = 0, y = 0]: number[]): number =>
      controls.reduce(
        (total, box) =>
          total +
          Math.max(0, Math.min(x + effectiveWidth, box.right) - Math.max(x, box.left)) *
            Math.max(0, Math.min(y + effectiveHeight, box.bottom) - Math.max(y, box.top)),
        0
      );
    candidates.sort((a, b) => overlap(a) - overlap(b));
    const [left, top] = candidates[0] ?? [VIEWPORT_MARGIN, VIEWPORT_MARGIN];

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
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      reposition();
    });
  };

  window.addEventListener('scroll', throttledReposition, { passive: true });
  window.addEventListener('resize', throttledReposition, { passive: true });

  return () => {
    window.removeEventListener('scroll', throttledReposition, {
      passive: true,
    } as EventListenerOptions);
    window.removeEventListener('resize', throttledReposition, {
      passive: true,
    } as EventListenerOptions);
    if (rafId) cancelAnimationFrame(rafId);
  };
}
