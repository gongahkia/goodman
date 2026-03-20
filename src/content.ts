import browser from './browser';
import { showPopup, hidePopup, isPopupEvent } from './content-ui';
import { isRuntimeMessage } from './messages';
import type { ManualConvertResponse, RuntimeMessage } from './messages';
import { parseDate } from './parser';
import { calculatePopupPosition } from './positioning';
import { isIgnoredHostname } from './site-access';
import { getSettings } from './storage';
import type { UserSettings } from './storage';
import { convertToTimezone, getDateDiffLabel, getSystemTimezone, getTargetDateLabel } from './timezone';

declare global {
    interface Window {
        __ONUL_CONTENT_CONTROLLER__?: OnulContentController;
    }
}

class OnulContentController {
    private selectionTimeout: number | undefined;
    private readonly debounceDelayMs = 200;
    private currentSettings: UserSettings | null = null;
    private liveSelectionEnabled = false;
    private bootPromise: Promise<void> | null = null;

    private readonly onSelectionChange = () => {
        if (!this.liveSelectionEnabled || this.isIgnoredDomain()) {
            return;
        }

        if (this.selectionTimeout !== undefined) {
            clearTimeout(this.selectionTimeout);
        }

        this.selectionTimeout = window.setTimeout(() => {
            void this.handleSelection({ allowIgnoredDomain: false, fallbackToCenter: false });
        }, this.debounceDelayMs);
    };

    private readonly onMouseDown = (event: MouseEvent) => {
        if (isPopupEvent(event)) {
            return;
        }

        hidePopup();
    };

    private readonly onStorageChanged = (changes: Record<string, browser.Storage.StorageChange>) => {
        if (
            'targetTimezone' in changes ||
            'format24h' in changes ||
            'ignoredDomains' in changes ||
            'theme' in changes ||
            'pinnedTimezones' in changes
        ) {
            void this.refreshSettings();
        }
    };

    private readonly onRuntimeMessage = async (message: RuntimeMessage): Promise<ManualConvertResponse | undefined> => {
        await this.boot();

        switch (message.type) {
            case 'ONUL_RUN_MANUAL_CONVERT':
                return this.handleSelection({
                    allowIgnoredDomain: true,
                    fallbackToCenter: false,
                });
            case 'ONUL_CONTEXT_MENU_CONVERT':
                return this.handleContextMenuConvert(message.text);
            case 'ONUL_SET_LIVE_MODE':
                this.setLiveSelectionEnabled(message.enabled);

                if (!message.enabled) {
                    hidePopup();
                }

                return { ok: true };
            default:
                return undefined;
        }
    };

    async boot(): Promise<void> {
        if (this.bootPromise) {
            return this.bootPromise;
        }

        this.bootPromise = this.initialize();
        return this.bootPromise;
    }

    private async initialize(): Promise<void> {
        this.currentSettings = await getSettings();
        browser.storage.onChanged.addListener(this.onStorageChanged);
        browser.runtime.onMessage.addListener((message: unknown) => {
            if (!isRuntimeMessage(message)) {
                return undefined;
            }

            return this.onRuntimeMessage(message);
        });

        try {
            const mode: { liveSelectionEnabled?: boolean } = await browser.runtime.sendMessage({
                type: 'ONUL_GET_CONTENT_MODE',
                url: window.location.href,
            } satisfies RuntimeMessage);

            this.setLiveSelectionEnabled(mode.liveSelectionEnabled ?? false);
        } catch {
            this.setLiveSelectionEnabled(false);
        }
    }

    private async refreshSettings(): Promise<void> {
        this.currentSettings = await getSettings();

        if (this.liveSelectionEnabled && this.isIgnoredDomain()) {
            hidePopup();
        }
    }

    private setLiveSelectionEnabled(enabled: boolean): void {
        if (enabled === this.liveSelectionEnabled) {
            return;
        }

        this.liveSelectionEnabled = enabled;

        if (enabled) {
            document.addEventListener('selectionchange', this.onSelectionChange);
            document.addEventListener('mousedown', this.onMouseDown);
            return;
        }

        if (this.selectionTimeout !== undefined) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = undefined;
        }

        document.removeEventListener('selectionchange', this.onSelectionChange);
        document.removeEventListener('mousedown', this.onMouseDown);
    }

    private handleSelection(options: {
        allowIgnoredDomain: boolean;
        fallbackToCenter: boolean;
    }): ManualConvertResponse {
        if (!this.currentSettings) {
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        if (!options.allowIgnoredDomain && this.isIgnoredDomain()) {
            hidePopup();
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        const selection = window.getSelection();
        if (!selection) {
            hidePopup();
            return { ok: false, reason: 'NO_SELECTION' };
        }

        const cleanText = selection.toString().trim();
        if (!cleanText) {
            hidePopup();
            return { ok: false, reason: 'NO_SELECTION' };
        }

        if (cleanText.length > 100) {
            hidePopup();
            return { ok: false, reason: 'SELECTION_TOO_LONG' };
        }

        if (isInsideEditable(selection)) {
            hidePopup();
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        const popupData = this.buildPopupData(cleanText);
        if (!popupData) {
            hidePopup();
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        const rect = selection.rangeCount > 0
            ? selection.getRangeAt(0).getBoundingClientRect()
            : options.fallbackToCenter
                ? new DOMRect(window.innerWidth / 2 - 110, window.innerHeight / 2 - 45, 0, 0)
                : null;

        if (!rect) {
            hidePopup();
            return { ok: false, reason: 'NO_RANGE' };
        }

        const popupHeight = 50 + popupData.rows.length * 40;
        const coords = calculatePopupPosition(rect, { width: 220, height: popupHeight });
        showPopup(coords.x, coords.y, {
            rows: popupData.rows,
            theme: this.currentSettings.theme,
        });

        return { ok: true };
    }

    private handleContextMenuConvert(text: string): ManualConvertResponse {
        if (!this.currentSettings) {
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        const cleanText = text.trim();
        if (!cleanText) {
            return { ok: false, reason: 'NO_SELECTION' };
        }

        if (cleanText.length > 100) {
            return { ok: false, reason: 'SELECTION_TOO_LONG' };
        }

        const popupData = this.buildPopupData(cleanText);
        if (!popupData) {
            hidePopup();
            return { ok: false, reason: 'UNSUPPORTED_SELECTION' };
        }

        const selection = window.getSelection();
        const rect = selection && selection.rangeCount > 0
            ? selection.getRangeAt(0).getBoundingClientRect()
            : new DOMRect(window.innerWidth / 2 - 110, window.innerHeight / 2 - 45, 0, 0);

        const popupHeight = 50 + popupData.rows.length * 40;
        const coords = calculatePopupPosition(rect, { width: 220, height: popupHeight });
        showPopup(coords.x, coords.y, {
            rows: popupData.rows,
            theme: this.currentSettings.theme,
        });

        return { ok: true };
    }

    private buildPopupData(text: string): { rows: PopupRow[] } | null {
        if (!this.currentSettings) {
            return null;
        }

        const parsed = parseDate(text);
        if (!parsed) {
            return null;
        }

        const targetZone = this.currentSettings.targetTimezone === 'auto'
            ? getSystemTimezone()
            : this.currentSettings.targetTimezone;
        const timeFormat = this.currentSettings.format24h ? 'HH:mm' : 'h:mm a';
        const sourceFormat = detectSourceFormat(parsed.text);
        const converted = convertToTimezone(parsed.date, targetZone);
        const rows: PopupRow[] = [{
            time: converted.toFormat(timeFormat),
            zone: `${converted.toFormat('ZZZZ')} (${converted.toFormat('ZZ')})`,
            diff: getDateDiffLabel(parsed.date, converted, parsed.timezoneOffset),
            date: getTargetDateLabel(converted),
            copyText: formatMirrored(converted, sourceFormat),
        }];

        for (const pinnedZone of this.currentSettings.pinnedTimezones) {
            if (pinnedZone === targetZone) {
                continue;
            }

            const pinnedDate = convertToTimezone(parsed.date, pinnedZone);
            rows.push({
                time: pinnedDate.toFormat(timeFormat),
                zone: `${pinnedDate.toFormat('ZZZZ')} (${pinnedDate.toFormat('ZZ')})`,
                diff: getDateDiffLabel(parsed.date, pinnedDate, parsed.timezoneOffset),
                date: getTargetDateLabel(pinnedDate),
                copyText: formatMirrored(pinnedDate, sourceFormat),
            });
        }

        return { rows };
    }

    private isIgnoredDomain(): boolean {
        if (!this.currentSettings) {
            return false;
        }

        return isIgnoredHostname(window.location.hostname, this.currentSettings.ignoredDomains);
    }
}

const controller = window.__ONUL_CONTENT_CONTROLLER__ ?? new OnulContentController();
window.__ONUL_CONTENT_CONTROLLER__ = controller;
void controller.boot();

interface PopupRow {
    time: string;
    zone: string;
    diff: string;
    date: string;
    copyText: string;
}

interface SourceFormat {
    is24h: boolean;
    hasZoneAbbrev: boolean;
}

function detectSourceFormat(text: string): SourceFormat {
    const cleanText = text.trim();
    const hasAmPm = /[ap]\.?m\.?/i.test(cleanText);
    const isMilitary = /^\d{4}$/.test(cleanText) || /^\d{2}:\d{2}(:\d{2})?$/.test(cleanText);
    const is24h = !hasAmPm && (isMilitary || /\b([01]?\d|2[0-3]):\d{2}\b/.test(cleanText));
    const hasZoneAbbrev = /\b[A-Z]{2,5}\s*$/.test(cleanText) ||
        /\b[A-Z]{2,5}\b/.test(cleanText.replace(/[ap]\.?m\.?/gi, '').trim());

    return { is24h, hasZoneAbbrev };
}

function formatMirrored(converted: ReturnType<typeof convertToTimezone>, format: SourceFormat): string {
    const time = format.is24h
        ? converted.toFormat('HH:mm')
        : converted.toFormat('h:mm a');

    if (!format.hasZoneAbbrev) {
        return time;
    }

    return `${time} ${converted.toFormat('ZZZZ')}`;
}

function isInsideEditable(selection: Selection): boolean {
    return isEditableNode(selection.anchorNode) || isEditableNode(selection.focusNode);
}

function isEditableNode(node: Node | null): boolean {
    if (!node) {
        return false;
    }

    const element = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as HTMLElement | null;

    if (!element) {
        return false;
    }

    return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable;
}

export {};
