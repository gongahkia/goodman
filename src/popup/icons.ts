const svg = (size: number, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const iconShield = (size = 20): string =>
  svg(size, '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>');

export const iconShieldCheck = (size = 20): string =>
  svg(size, '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>');

export const iconFlag = (size = 16): string =>
  svg(size, '<path d="M4 15s1-1 4-1 5 2 8 2V3s-3-1-5-1-4 1-7 1z"/><line x1="4" y1="22" x2="4" y2="15"/>');

export const iconAlertTriangle = (size = 20): string =>
  svg(size, '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');

export const iconSettings = (size = 18): string =>
  svg(size, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>');

export const iconRefresh = (size = 18): string =>
  svg(size, '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>');

export const iconExternalLink = (size = 16): string =>
  svg(size, '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>');

export const iconChevronRight = (size = 16): string =>
  svg(size, '<polyline points="9 18 15 12 9 6"/>');

export const iconChevronLeft = (size = 16): string =>
  svg(size, '<polyline points="15 18 9 12 15 6"/>');

export const iconClock = (size = 16): string =>
  svg(size, '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');

export const iconCheck = (size = 16): string =>
  svg(size, '<polyline points="20 6 9 17 4 12"/>');

export const iconX = (size = 16): string =>
  svg(size, '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>');

export const iconZap = (size = 20): string =>
  svg(size, '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>');

export const iconInfo = (size = 16): string =>
  svg(size, '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>');

export const iconTerminal = (size = 16): string =>
  svg(size, '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>');
