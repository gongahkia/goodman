export type DetectionRoot = Element | ShadowRoot;

/** Each document/frame owns its roots. Closed shadow trees remain browser-private. */
export function getDetectionRoots(root: DetectionRoot): DetectionRoot[] {
  const roots: DetectionRoot[] = [root];
  const visit = (element: Element): void => {
    if (element.id.startsWith('goodman-')) return;
    if (element.shadowRoot) roots.push(...getDetectionRoots(element.shadowRoot));
  };
  if (root instanceof Element) visit(root);
  for (const element of root.querySelectorAll('*')) visit(element);
  return roots;
}

export function isVisibleSurface(element: Element): boolean {
  for (let current: Element | null = element; current;) {
    if (current.matches('[hidden], [aria-hidden="true"], [inert]') || current.id.startsWith('goodman-')) return false;
    const style = getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    current = current.parentElement ?? (current.getRootNode() instanceof ShadowRoot ? (current.getRootNode() as ShadowRoot).host : null);
  }
  return true;
}
