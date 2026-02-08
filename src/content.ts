/* eslint-disable */
import { parseDate } from './parser';
import { calculatePopupPosition } from './positioning';
import { showPopup, hidePopup } from './content-ui';
import { convertToTimezone, getSystemTimezone, getDateDiffLabel, getTargetDateLabel } from './timezone';
import { getSettings } from './storage';
import type { UserSettings } from './storage';

console.log('ONUL Extension Content Script Loaded');

let selectionTimeout: number | undefined;
const DEBOUNCE_DELAY_MS = 200;

let currentSettings: UserSettings | null = null;
let isIgnoredDomain = false;

// Initialize
void (async () => {
    currentSettings = await getSettings();

    // Check Blacklist
    const hostname = window.location.hostname;
    if (currentSettings.ignoredDomains.some(d => hostname.includes(d))) {
        console.log('ONUL Extension: Domain ignored by settings.');
        isIgnoredDomain = true;
    }

    // Listen for storage changes to update settings dynamically
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.targetTimezone || changes.format24h || changes.ignoredDomains || changes.theme || changes.pinnedTimezones) {
                // Refresh settings
                void getSettings().then(s => {
                    currentSettings = s;
                    // Re-check blacklist
                    const newIgnored = s.ignoredDomains.some(d => hostname.includes(d));
                    if (newIgnored !== isIgnoredDomain) {
                        isIgnoredDomain = newIgnored;
                        if (isIgnoredDomain) hidePopup();
                    }
                });
            }
        });
    }

    // Start Listeners
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('mousedown', onMouseDown);
})();

function onSelectionChange() {
    if (isIgnoredDomain) return;

    if (selectionTimeout !== undefined) {
        clearTimeout(selectionTimeout);
    }
    selectionTimeout = window.setTimeout(handleSelection, DEBOUNCE_DELAY_MS);
}

function onMouseDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Don't dismiss if clicking on the popup itself (host)
    if (target.id === 'onul-host') return;

    hidePopup();
}

function handleSelection() {
    if (isIgnoredDomain || !currentSettings) return;

    const selection = window.getSelection();
    if (!selection) {
        hidePopup();
        return;
    }

    const text = selection.toString();
    const cleanText = text.trim();

    // Discard empty or too long selections
    if (!cleanText || cleanText.length > 100) {
        hidePopup();
        return;
    }

    // Ignore selections inside editable fields
    if (isInsideEditable(selection)) {
        hidePopup();
        return;
    }

    // Parse Text
    const parsed = parseDate(cleanText);
    if (!parsed) {
        hidePopup();
        return;
    }

    // Logic: Convert and Show
    try {
        const targetZone = currentSettings.targetTimezone === 'auto'
            ? getSystemTimezone()
            : currentSettings.targetTimezone;
        const timeFormat = currentSettings.format24h ? 'HH:mm' : 'h:mm a';
        const srcFmt = detectSourceFormat(parsed.text);
        const converted = convertToTimezone(parsed.date, targetZone);
        const diffLabel = getDateDiffLabel(parsed.date, converted, parsed.timezoneOffset);
        const timeString = converted.toFormat(timeFormat);
        const zoneString = `${converted.toFormat('ZZZZ')} (${converted.toFormat('ZZ')})`;
        const dateLabel = getTargetDateLabel(converted);
        const rows: { time: string; zone: string; diff: string; date: string; copyText: string }[] = [
            { time: timeString, zone: zoneString, diff: diffLabel, date: dateLabel, copyText: formatMirrored(converted, srcFmt) }
        ];
        for (const pz of currentSettings.pinnedTimezones) {
            if (pz === targetZone) continue;
            const pc = convertToTimezone(parsed.date, pz);
            const pd = getDateDiffLabel(parsed.date, pc, parsed.timezoneOffset);
            rows.push({
                time: pc.toFormat(timeFormat),
                zone: `${pc.toFormat('ZZZZ')} (${pc.toFormat('ZZ')})`,
                diff: pd,
                date: getTargetDateLabel(pc),
                copyText: formatMirrored(pc, srcFmt)
            });
        }
        // Get Coordinates
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const popupHeight = 50 + rows.length * 40; // base + per-row
        const coords = calculatePopupPosition(rect, { width: 220, height: popupHeight });
        showPopup(coords.x, coords.y, {
            rows,
            theme: currentSettings.theme
        });

    } catch (err) {
        console.error('Timezone conversion error:', err);
        hidePopup();
    }
}

/**
 * Checks if the selection is inside an editable element (Input, Textarea, or contenteditable)
 */
interface SourceFormat {
    is24h: boolean;
    hasZoneAbbrev: boolean;
}

function detectSourceFormat(text: string): SourceFormat {
    const t = text.trim();
    const hasAmPm = /[ap]\.?m\.?/i.test(t);
    const isMilitary = /^\d{4}$/.test(t) || /^\d{2}:\d{2}(:\d{2})?$/.test(t);
    const is24h = !hasAmPm && (isMilitary || /\b([01]?\d|2[0-3]):\d{2}\b/.test(t));
    const hasZoneAbbrev = /\b[A-Z]{2,5}\s*$/.test(t) || /\b[A-Z]{2,5}\b/.test(t.replace(/[ap]\.?m\.?/gi, '').trim());
    return { is24h, hasZoneAbbrev };
}

function formatMirrored(converted: ReturnType<typeof convertToTimezone>, fmt: SourceFormat): string {
    let time: string;
    if (fmt.is24h) {
        time = converted.toFormat('HH:mm');
    } else {
        time = converted.toFormat('h:mm a');
    }
    if (fmt.hasZoneAbbrev) {
        time += ` ${converted.toFormat('ZZZZ')}`;
    }
    return time;
}

function isInsideEditable(selection: Selection): boolean {
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;

    return isEditableNode(anchor) || isEditableNode(focus);
}

function isEditableNode(node: Node | null): boolean {
    if (!node) return false;

    const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement;
    if (!element) return false;

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') return true;
    if (element.isContentEditable) return true;

    return false;
}
