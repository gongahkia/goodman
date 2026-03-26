// service worker DOM shim — ONLY shim window
// document, history, Node etc. must stay undefined so that
// typeof guards in content script code correctly skip execution
// in the service worker context
if (typeof window === 'undefined') {
  (globalThis as Record<string, unknown>).window = typeof self !== 'undefined' ? self : globalThis;
}
