import { ok, err } from '@shared/result';
import type { Result } from '@shared/result';
import { normalizeExtractedText } from './normalizer';
import { extractElementText } from './dom-text';
import { decodeLegalDocument, fetchLegalDocument, type LegalDocument } from './fetch';

export interface LinkedTextResult {
  text: string;
  relatedLinks: RelatedLink[];
  language?: string;
  title?: string;
}

export interface RelatedLink {
  url: string;
  label: string;
}

export async function extractLinkedText(
  url: string,
  downloaded?: LegalDocument
): Promise<Result<LinkedTextResult, Error>> {
  try {
    const resource = downloaded ?? (await fetchLegalDocument(url));
    const mime = resource.contentType.split(';')[0]?.trim().toLowerCase();
    if (mime && !['text/html', 'application/xhtml+xml', 'text/plain'].includes(mime))
      throw new Error('Unsupported linked agreement content type');
    const html = decodeLegalDocument(resource);
    if (mime === 'text/plain')
      return ok({ text: normalizeExtractedText(html).text, relatedLinks: [] });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const relatedLinks = extractRelatedLinks(doc, resource.url);
    const title = doc.title.trim() || doc.querySelector('h1')?.textContent?.trim() || '';
    const text = extractMainContent(doc);
    const normalized = normalizeExtractedText(text);
    return ok({ text: normalized.text, relatedLinks, language: doc.documentElement.lang, title });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

function extractMainContent(doc: Document): string {
  const selectors = ['main', 'article', '[role="main"]', 'body'];
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    if (el) {
      removeNonContentElements(el);
      const text = extractElementText(el);
      if (text) return text;
    }
  }

  return '';
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

function extractRelatedLinks(doc: Document, baseUrl: string): RelatedLink[] {
  const links: RelatedLink[] = [];
  const legalPatterns = /privacy|terms|legal|eula|tos|policy|conditions/i;

  for (const anchor of doc.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    const label = anchor.textContent?.trim() ?? '';
    if (href && legalPatterns.test(label + ' ' + href)) {
      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        if (
          ['http:', 'https:'].includes(new URL(absoluteUrl).protocol) &&
          absoluteUrl !== baseUrl
        ) {
          links.push({ url: absoluteUrl, label });
        }
      } catch (e) {
        console.warn('[Goodman] skipping invalid related link URL:', href, e);
      }
    }
  }

  return links;
}
