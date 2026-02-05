import { parseDate } from './parser';
import { calculatePopupPosition } from './positioning';
import { showPopup, hidePopup } from './content-ui';
import { convertToTimezone, getSystemTimezone, getDateDiffLabel } from './timezone';
import { getSettings } from './storage';
import type { UserSettings } from './storage';

console.log('ONUL Extension Content Script Loaded');

let selectionTimeout: number | undefined;
const DEBOUNCE_DELAY_MS = 200;

let currentSettings: UserSettings | null = null;
let isIgnoredDomain = false;

// Initialize
(async () => {
    currentSettings = await getSettings();

    // Check Blacklist
    const hostname = window.location.hostname;
    if (currentSettings.ignoredDomains && currentSettings.ignoredDomains.some(d => hostname.includes(d))) {
        console.log('ONUL Extension: Domain ignored by settings.');
        isIgnoredDomain = true;
    }

    // Listen for storage changes to update settings dynamically
    if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.targetTimezone || changes.format24h || changes.ignoredDomains) {
                // Refresh settings
                getSettings().then(s => {
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

        const converted = convertToTimezone(parsed.date, targetZone);
        const diffLabel = getDateDiffLabel(parsed.date, converted, parsed.timezoneOffset);

        // Get Coordinates
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Calculate Position
        const coords = calculatePopupPosition(rect, { width: 220, height: 90 });

        // Format Output based on Settings
        const timeFormat = currentSettings.format24h ? 'HH:mm' : 'h:mm a';
        const timeString = converted.toFormat(timeFormat);
        const zoneString = `${converted.toFormat('ZZZZ')} (${converted.toFormat('ZZ')})`;

        showPopup(coords.x, coords.y, {
            time: timeString,
            zone: zoneString,
            diff: diffLabel
        });

    } catch (err) {
        console.error('Timezone conversion error:', err);
        hidePopup();
    }
}

/**
 * Checks if the selection is inside an editable element (Input, Textarea, or contenteditable)
 */
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
