export type BrowserKind = 'chrome' | 'firefox' | 'safari' | 'unknown';

export function detectBrowserKind(userAgent = navigator.userAgent): BrowserKind {
  if (/Firefox\//i.test(userAgent)) {
    return 'firefox';
  }

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent) && !/Chromium\//i.test(userAgent)) {
    return 'safari';
  }

  if (/Chrome\//i.test(userAgent) || /Chromium\//i.test(userAgent)) {
    return 'chrome';
  }

  return 'unknown';
}

export function getOriginPattern(urlString: string): string | null {
  let url;

  try {
    url = new URL(urlString);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  return `${url.origin}/*`;
}

export function isRestrictedUrl(urlString: string): boolean {
  return getOriginPattern(urlString) === null;
}

export function isIgnoredHostname(hostname: string, ignoredDomains: string[]): boolean {
  return ignoredDomains.some((domain) => hostname.includes(domain));
}

export function toContentScriptId(originPattern: string): string {
  return `live-${originPattern.replace(/[^a-z0-9]/gi, '_').slice(0, 64)}`;
}
