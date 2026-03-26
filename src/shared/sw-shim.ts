// this module MUST be the first import in background/index.ts
// it ensures window/document/history globals exist before any bundled
// content script code (injected by crxjs) tries to access them
if (typeof window === 'undefined') {
  const g = globalThis as Record<string, unknown>;
  g.window = typeof self !== 'undefined' ? self : globalThis;
}
if (typeof document === 'undefined') {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ relList: { supports: () => false } }),
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    head: { appendChild: () => {} },
    body: null,
    title: '',
    addEventListener: () => {},
  };
}
if (typeof history === 'undefined') {
  (globalThis as Record<string, unknown>).history = {
    pushState: () => {},
    replaceState: () => {},
  };
}
if (typeof Node === 'undefined') {
  (globalThis as Record<string, unknown>).Node = { ELEMENT_NODE: 1 };
}
if (typeof getComputedStyle === 'undefined') {
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({ position: '' });
}
if (typeof DOMParser === 'undefined') {
  (globalThis as Record<string, unknown>).DOMParser = class {
    parseFromString() { return { querySelector: () => null, querySelectorAll: () => [], body: { textContent: '' } }; }
  };
}
if (typeof TextDecoder === 'undefined') {
  (globalThis as Record<string, unknown>).TextDecoder = class { decode() { return ''; } };
}
