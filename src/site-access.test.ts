import { describe, expect, it } from 'vitest';
import {
    detectBrowserKind,
    getOriginPattern,
    isIgnoredHostname,
    isRestrictedUrl,
    toContentScriptId
} from './site-access';

describe('site access helpers', () => {
    it('detects major extension browsers', () => {
        expect(detectBrowserKind('Mozilla/5.0 Firefox/138.0')).toBe('firefox');
        expect(detectBrowserKind('Mozilla/5.0 Version/18.0 Safari/605.1.15')).toBe('safari');
        expect(detectBrowserKind('Mozilla/5.0 Chrome/136.0.0.0 Safari/537.36')).toBe('chrome');
    });

    it('creates origin patterns for http and https URLs', () => {
        expect(getOriginPattern('https://example.com/path')).toBe('https://example.com/*');
        expect(getOriginPattern('http://localhost:3000/foo')).toBe('http://localhost:3000/*');
    });

    it('treats non-web URLs as restricted', () => {
        expect(getOriginPattern('chrome://extensions')).toBeNull();
        expect(isRestrictedUrl('about:addons')).toBe(true);
    });

    it('matches ignored hostnames by substring', () => {
        expect(isIgnoredHostname('calendar.google.com', ['google.com'])).toBe(true);
        expect(isIgnoredHostname('example.com', ['google.com'])).toBe(false);
    });

    it('creates deterministic content-script identifiers', () => {
        expect(toContentScriptId('https://example.com/*')).toMatch(/^live-/);
        expect(toContentScriptId('https://example.com/*')).toBe(toContentScriptId('https://example.com/*'));
    });
});
