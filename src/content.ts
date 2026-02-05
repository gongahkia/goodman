import { parseDate } from './parser';
import { calculatePopupPosition } from './positioning';
import { showPopup, hidePopup } from './content-ui';
import { convertToTimezone, getSystemTimezone, getDateDiffLabel } from './timezone';

console.log('Timezone Extension Content Script Loaded');

let selectionTimeout: number | undefined;
const DEBOUNCE_DELAY_MS = 200;

// Listen for selection changes
document.addEventListener('selectionchange', () => {
    if (selectionTimeout !== undefined) {
        clearTimeout(selectionTimeout);
    }
    selectionTimeout = window.setTimeout(handleSelection, DEBOUNCE_DELAY_MS);
});

// Listen for clicks to dismiss popup (Click Outside)
document.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    // Don't dismiss if clicking on the popup itself (host)
    if (target.id === 'timezone-extension-host') return;

    hidePopup();
});

function handleSelection() {
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
        const targetZone = getSystemTimezone();
        const converted = convertToTimezone(parsed.date, targetZone);
        const diffLabel = getDateDiffLabel(parsed.date, converted, parsed.timezoneOffset);

        // Get Coordinates
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // Calculate Position
        // Estimated popup size (width: 200, height: 80) for positioning calculation
        const coords = calculatePopupPosition(rect, { width: 200, height: 80 });

        // Format Output
        const timeString = converted.toFormat('h:mm a');
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
