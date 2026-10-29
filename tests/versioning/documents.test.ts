import { beforeEach, expect, it } from 'vitest';
import { createDocument } from '@shared/documents';
import { syncVersionHistory } from '@background/version-tracking';
import { getVersionHistory } from '@versioning/schema';
import { mockStorage } from '../mocks/chrome';
const summary = { summary: 'Summary', keyPoints: [], redFlags: [], severity: 'low' as const };
beforeEach(() => { for (const key of Object.keys(mockStorage)) delete mockStorage[key]; });
it('versions terms and privacy independently on the same hostname', async () => {
  const terms = createDocument('https://example.com/terms?utm_source=x');
  const privacy = createDocument('https://example.com/privacy');
  expect((await syncVersionHistory('example.com', 'terms v1', summary, terms)).changed).toBe(false);
  expect((await syncVersionHistory('example.com', 'privacy v1', summary, privacy)).changed).toBe(false);
  expect((await syncVersionHistory('example.com', 'terms v2', summary, terms)).versionNumber).toBe(2);
  const history = await getVersionHistory('example.com', terms.id);
  expect(history.map(entry => entry.version)).toEqual([1, 2]);
  expect((await getVersionHistory('example.com', privacy.id))).toHaveLength(1);
  expect(terms.url).toBe('https://example.com/terms');
});
it('does not compare a sourced agreement to ambiguous legacy history', async () => {
  await syncVersionHistory('example.com', 'old unknown document', summary);
  const result = await syncVersionHistory('example.com', 'terms', summary, createDocument('https://example.com/terms'));
  expect(result.changed).toBe(false);
  expect(result.versionNumber).toBe(1);
});
