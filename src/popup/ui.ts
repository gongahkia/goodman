export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'pill';

export type PillVariant =
  | 'default'
  | 'muted'
  | 'blue'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export function cx(
  ...tokens: Array<string | false | null | undefined>
): string {
  return tokens.filter(Boolean).join(' ');
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (textContent !== undefined) {
    node.textContent = textContent;
  }
  return node;
}

export function appendChildren(
  parent: HTMLElement,
  ...children: Array<HTMLElement | Text | null | undefined | false>
): HTMLElement {
  for (const child of children) {
    if (child) {
      parent.appendChild(child);
    }
  }
  return parent;
}

export function createButton(
  label: string,
  variant: ButtonVariant,
  onClick?: () => void
): HTMLButtonElement {
  const button = createElement(
    'button',
    cx('tc-button', `tc-button--${variant}`),
    label
  );
  button.type = 'button';
  if (onClick) {
    button.addEventListener('click', () => {
      onClick();
    });
  }
  return button;
}

export function createPill(
  label: string,
  variant: PillVariant = 'default'
): HTMLSpanElement {
  return createElement('span', cx('tc-pill', `tc-pill--${variant}`), label);
}

export function createFieldLabel(text: string, forId?: string): HTMLLabelElement {
  const label = createElement('label', 'tc-field-label', text);
  if (forId) label.htmlFor = forId;
  return label;
}

export function createInput(
  type: 'text' | 'password',
  placeholder: string,
  value = '',
  id?: string
): HTMLInputElement {
  const input = createElement('input', 'tc-input') as HTMLInputElement;
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
  if (id) input.id = id;
  if (!id) input.setAttribute('aria-label', placeholder);
  return input;
}

export function createSectionHeading(
  title: string,
  subtitle?: string
): HTMLDivElement {
  const wrapper = createElement('div', 'tc-section-heading');
  appendChildren(
    wrapper,
    createElement('h3', 'tc-section-title', title),
    subtitle ? createElement('p', 'tc-section-copy', subtitle) : null
  );
  return wrapper;
}

export function createEmptyMessage(text: string): HTMLParagraphElement {
  return createElement('p', 'tc-empty-note', text);
}

export function createIcon(svgString: string, className?: string): HTMLSpanElement {
  const span = createElement('span', className);
  const template = document.createElement('template');
  template.innerHTML = svgString;
  const svg = template.content.firstChild;
  if (svg instanceof Element) {
    svg.setAttribute('aria-hidden', 'true');
    (svg as HTMLElement).style.display = 'block';
    span.appendChild(svg);
  }
  return span;
}

export function announceStatus(message: string): void {
  const region = document.getElementById('tc-status');
  if (region) region.textContent = message;
}

export function createSkeleton(variant: 'wide' | 'medium' | 'short' = 'wide'): HTMLDivElement {
  return createElement('div', cx('tc-skeleton', `tc-skeleton--${variant}`));
}

export function createSkeletonGroup(): HTMLElement {
  const group = createElement('div', 'tc-page');
  group.style.gap = '8px';
  appendChildren(group, createSkeleton('wide'), createSkeleton('medium'), createSkeleton('short'));
  return group;
}
