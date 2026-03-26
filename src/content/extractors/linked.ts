import { sendToBackground } from '@shared/messaging';
import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { normalizeText } from './normalizer';

export interface LinkedTextResult {
  text: string;
  relatedLinks: RelatedLink[];
}

export interface RelatedLink {
  url: string;
  label: string;
}

const FETCH_TIMEOUT_MS = 5000;

export async function extractLinkedText(
  url: string
): Promise<Result<LinkedTextResult, Error>> {
  try {
    const html = await fetchHtml(url);
    const text = extractMainContent(html);
    const normalized = normalizeText(text);
    const relatedLinks = extractRelatedLinks(html, url);

    return ok({ text: normalized.text, relatedLinks });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

async function fetchHtml(url: string): Promise<string> {
  const requestUrl = resolveUrl(url);
  const msg = { type: 'FETCH_URL' as const, payload: { url: requestUrl, responseType: 'text' as const } };

  for (const timeout of [FETCH_TIMEOUT_MS, Math.round(FETCH_TIMEOUT_MS * 1.5)]) {
    try {
      const response = await fetchWithTimeout<{ ok: boolean; data?: string; error?: string }>(msg, timeout);
      if (response.ok && response.data) return response.data;
    } catch (e) { console.warn('[Goodman] background fetch attempt failed, retrying:', e); }
  }

  const directResponse = await fetch(requestUrl);
  if (!directResponse.ok) {
    throw new Error(`Failed to fetch URL: HTTP ${directResponse.status}`);
  }
  return directResponse.text();
}

async function fetchWithTimeout<T>(
  message: Parameters<typeof sendToBackground>[0],
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<T> {
  return Promise.race([
    sendToBackground(message) as Promise<T>,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Background fetch timed out')), timeoutMs);
    }),
  ]);
}

function extractMainContent(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const selectors = ['main', 'article', '[role="main"]', 'body'];
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el && (el.textContent?.trim().length ?? 0) > 100) {
      removeNonContentElements(el);
      return el.textContent?.trim() ?? '';
    }
  }

  return doc.body?.textContent?.trim() ?? '';
}

function removeNonContentElements(el: Element): void {
  const removeSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    'script',
    'style',
    'noscript',
    'template',
    '[hidden]',
    '[aria-hidden="true"]',
    '[role="navigation"]',
    '.nav',
    '.header',
    '.footer',
    '.sidebar',
  ];
  for (const selector of removeSelectors) {
    for (const toRemove of el.querySelectorAll(selector)) {
      toRemove.remove();
    }
  }
}

function extractRelatedLinks(html: string, baseUrl: string): RelatedLink[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const links: RelatedLink[] = [];
  const legalPatterns = /privacy|terms|legal|eula|tos|policy|conditions/i;

  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    const label = anchor.textContent?.trim() ?? '';
    if (href && legalPatterns.test(label + ' ' + href)) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        if (absoluteUrl !== baseUrl) {
          links.push({ url: absoluteUrl, label });
        }
      } catch (e) {
        console.warn('[Goodman] skipping invalid related link URL:', href, e);
      }
    }
  }

  return links;
}

function resolveUrl(url: string): string {
  try {
    return new URL(url, window.location.href).href;
  } catch (e) {
    console.warn('[Goodman] linked resolveUrl failed, using original:', url, e);
    return url;
  }
}
