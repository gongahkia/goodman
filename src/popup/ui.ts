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

export function createFieldLabel(text: string): HTMLLabelElement {
  return createElement('label', 'tc-field-label', text);
}

export function createInput(
  type: 'text' | 'password',
  placeholder: string,
  value = ''
): HTMLInputElement {
  const input = createElement('input', 'tc-input') as HTMLInputElement;
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;
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
  span.innerHTML = svgString;
  const svgEl = span.querySelector('svg');
  if (svgEl) svgEl.style.display = 'block';
  return span;
}
