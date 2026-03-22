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

export async function extractLinkedText(
  url: string
): Promise<Result<LinkedTextResult, Error>> {
  try {
    const response = await sendToBackground({
      type: 'FETCH_URL',
      payload: { url },
    });

    const result = response as { ok: boolean; data?: string; error?: string };
    if (!result.ok || !result.data) {
      return err(new Error(result.error ?? 'Failed to fetch URL'));
    }

    const html = result.data;
    const text = extractMainContent(html);
    const normalized = normalizeText(text);
    const relatedLinks = extractRelatedLinks(html, url);

    return ok({ text: normalized.text, relatedLinks });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
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
  const removeSelectors = ['nav', 'header', 'footer', 'aside', '[role="navigation"]', '.nav', '.header', '.footer', '.sidebar'];
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
      } catch {
        // skip invalid URLs
      }
    }
  }

  return links;
}
