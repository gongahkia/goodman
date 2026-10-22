// Read a detached copy so extraction never changes the page or reads user inputs.
export function extractElementText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  for (const node of copy.querySelectorAll(
    'script,style,noscript,template,nav,header,footer,aside,[hidden],[aria-hidden="true"],' +
      '[role="navigation"],input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),' +
      '[role="textbox"],#goodman-overlay-host,#goodman-consent-warning-host'
  ))
    node.remove();
  const blocks = new Set([
    'P',
    'DIV',
    'SECTION',
    'ARTICLE',
    'MAIN',
    'FORM',
    'LI',
    'UL',
    'OL',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'TABLE',
    'TR',
    'BLOCKQUOTE',
    'PRE',
  ]);
  const read = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (node.tagName === 'BR') return '\n';
    const text = Array.from(node.childNodes, read).join('');
    if (blocks.has(node.tagName)) return `\n${text}\n`;
    if (node.tagName === 'TD' || node.tagName === 'TH') return `${text}\t`;
    return text;
  };
  return read(copy)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
