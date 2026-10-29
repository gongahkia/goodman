import { beforeEach, expect, it } from 'vitest';
import { createDocument, mergeDocuments } from '@shared/documents';
import { syncVersionHistory } from '@background/version-tracking';
import { getVersionHistory } from '@versioning/schema';
import { mockStorage } from '../mocks/chrome';
const summary = { summary: 'Summary', keyPoints: [], redFlags: [], severity: 'low' as const };
beforeEach(() => {
  for (const key of Object.keys(mockStorage)) delete mockStorage[key];
});
it('versions terms and privacy independently on the same hostname', async () => {
  const terms = createDocument('https://example.com/terms?utm_source=x');
  const privacy = createDocument('https://example.com/privacy');
  expect((await syncVersionHistory('example.com', 'terms v1', summary, terms)).changed).toBe(false);
  expect((await syncVersionHistory('example.com', 'privacy v1', summary, privacy)).changed).toBe(
    false
  );
  expect((await syncVersionHistory('example.com', 'terms v2', summary, terms)).versionNumber).toBe(
    2
  );
  const history = await getVersionHistory('example.com', terms.id);
  expect(history.map((entry) => entry.version)).toEqual([1, 2]);
  expect(await getVersionHistory('example.com', privacy.id)).toHaveLength(1);
  expect(terms.url).toBe('https://example.com/terms');
});
it('does not compare a sourced agreement to ambiguous legacy history', async () => {
  await syncVersionHistory('example.com', 'old unknown document', summary);
  const result = await syncVersionHistory(
    'example.com',
    'terms',
    summary,
    createDocument('https://example.com/terms')
  );
  expect(result.changed).toBe(false);
  expect(result.versionNumber).toBe(1);
});

it('preserves query-based document routes while removing known sensitive and tracking parameters', () => {
  const doc = createDocument(
    'https://example.com/legal?doc=privacy&tenant=public&token=secret&utm_source=test'
  );
  expect(doc.url).toBe('https://example.com/legal?doc=privacy&tenant=public');
  expect(doc.id).not.toBe(createDocument('https://example.com/legal?doc=terms&tenant=public').id);
});

it('replaces discovery metadata with a known language without merging different locales', () => {
  const unknown = createDocument('https://example.com/terms');
  const english = createDocument(unknown.url, '', 'en');
  const french = createDocument(unknown.url, '', 'fr');
  expect(mergeDocuments([unknown], [english])).toEqual([english]);
  expect(mergeDocuments([english], [unknown])).toEqual([english]);
  expect(mergeDocuments([english], [french])).toEqual([english, french]);
});
