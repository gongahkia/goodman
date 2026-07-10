import browser from './browser';
import { showPopup, hidePopup, isPopupEvent } from './content-ui';
import { findHoverEntities } from './hover-scanner';
import { isRuntimeMessage } from './messages';
import type { ManualConvertResponse, RuntimeMessage } from './messages';
import { parseDate } from './parser';
import { calculatePopupPosition } from './positioning';
import { isIgnoredHostname } from './site-access';
import { getSettings, modeIncludesHighlight, modeIncludesHover } from './storage';
import type { UserSettings } from './storage';
import { convertToTimezone, getDateDiffLabel, getSystemTimezone, getTargetDateLabel } from './timezone';

declare global {
    interface Window {
        __ONUL_CONTENT_CONTROLLER__?: OnulContentController;
    }
}

class OnulContentController {
    private selectionTimeout: number | undefined;
    private hoverScanTimeout: number | undefined;
    private readonly debounceDelayMs = 200;
    private readonly hoverDebounceDelayMs = 300;
    private readonly maxHoverTextNodes = 800;
    private readonly maxHoverAnnotations = 200;
    private currentSettings: UserSettings | null = null;
    private liveSelectionEnabled = false;
    private bootPromise: Promise<void> | null = null;
    private hoverObserver: MutationObserver | null = null;
    private readonly hoverAnnotations = new Set<HTMLElement>();

    private readonly onSelectionChange = () => {
        if (!this.liveSelectionEnabled || !this.isHighlightModeEnabled() || this.isIgnoredDomain()) {
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

    private readonly onScroll = () => {
        hidePopup();
    };

    private readonly onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            hidePopup();
        }
    };

    private readonly onHoverMutation = () => {
        this.scheduleHoverScan();
    };

    private readonly onHoverEntityEnter = (event: Event) => {
        if (event.currentTarget instanceof HTMLElement) {
            this.showHoverEntity(event.currentTarget);
        }
    };

    private readonly onHoverEntityLeave = () => {
        hidePopup();
    };

    private readonly onStorageChanged = (changes: Record<string, browser.Storage.StorageChange>) => {
        if (
            'targetTimezone' in changes ||
            'format24h' in changes ||
            'ignoredDomains' in changes ||
            'theme' in changes ||
            'pinnedTimezones' in changes ||
            'interactionMode' in changes
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

        this.syncHoverScanning();
    }

    private setLiveSelectionEnabled(enabled: boolean): void {
        if (enabled === this.liveSelectionEnabled) {
            return;
        }

        this.liveSelectionEnabled = enabled;

        if (enabled) {
            document.addEventListener('selectionchange', this.onSelectionChange);
            document.addEventListener('mousedown', this.onMouseDown);
            document.addEventListener('scroll', this.onScroll, true);
            document.addEventListener('keydown', this.onKeyDown);
            this.syncHoverScanning();
            return;
        }

        if (this.selectionTimeout !== undefined) {
            clearTimeout(this.selectionTimeout);
            this.selectionTimeout = undefined;
        }

        document.removeEventListener('selectionchange', this.onSelectionChange);
        document.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('scroll', this.onScroll, true);
        document.removeEventListener('keydown', this.onKeyDown);
        this.stopHoverScanning();
        hidePopup();
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

    private syncHoverScanning(): void {
        if (!this.shouldRunHoverScanner()) {
            this.stopHoverScanning();
            return;
        }

        if (!this.hoverObserver) {
            this.hoverObserver = new MutationObserver(this.onHoverMutation);
            this.hoverObserver.observe(document.body, {
                childList: true,
                characterData: true,
                subtree: true,
            });
        }

        this.scheduleHoverScan(0);
    }

    private scheduleHoverScan(delay = this.hoverDebounceDelayMs): void {
        if (!this.shouldRunHoverScanner()) {
            return;
        }

        if (this.hoverScanTimeout !== undefined) {
            clearTimeout(this.hoverScanTimeout);
        }

        this.hoverScanTimeout = window.setTimeout(() => {
            this.hoverScanTimeout = undefined;
            this.scanHoverEntities();
        }, delay);
    }

    private scanHoverEntities(): void {
        if (!this.shouldRunHoverScanner()) {
            this.stopHoverScanning();
            return;
        }

        const observer = this.hoverObserver;
        let visitedTextNodes = 0;
        observer?.disconnect();

        try {
            this.clearHoverAnnotations();

            const nodes: Text[] = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
                    visitedTextNodes += 1;

                    if (visitedTextNodes > this.maxHoverTextNodes) {
                        return NodeFilter.FILTER_REJECT;
                    }

                    return this.acceptHoverTextNode(node);
                },
            });

            while (nodes.length < this.maxHoverTextNodes) {
                const node = walker.nextNode();

                if (!node) {
                    break;
                }

                nodes.push(node as Text);
            }

            let annotatedCount = 0;

            for (const node of nodes) {
                if (annotatedCount >= this.maxHoverAnnotations) {
                    break;
                }

                annotatedCount += this.annotateHoverTextNode(
                    node,
                    this.maxHoverAnnotations - annotatedCount
                );
            }
        } finally {
            observer?.observe(document.body, {
                childList: true,
                characterData: true,
                subtree: true,
            });
        }
    }

    private acceptHoverTextNode(node: Node): number {
        const text = node.textContent ?? '';
        const parent = node.parentNode instanceof HTMLElement ? node.parentNode : null;

        if (!text.trim() || !hasHoverCue(text) || !parent) {
            return NodeFilter.FILTER_REJECT;
        }

        if (shouldSkipHoverElement(parent) || !isVisibleElement(parent)) {
            return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
    }

    private annotateHoverTextNode(node: Text, remainingAnnotations: number): number {
        const text = node.data;
        const entities = findHoverEntities(text);

        if (entities.length === 0 || !node.parentNode) {
            return 0;
        }

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        let annotatedCount = 0;

        for (const entity of entities) {
            if (annotatedCount >= remainingAnnotations) {
                break;
            }

            if (entity.start < cursor || entity.end <= entity.start) {
                continue;
            }

            if (entity.start > cursor) {
                fragment.append(document.createTextNode(text.slice(cursor, entity.start)));
            }

            fragment.append(this.createHoverAnnotation(entity.text));
            cursor = entity.end;
            annotatedCount += 1;
        }

        if (annotatedCount === 0) {
            return 0;
        }

        if (cursor < text.length) {
            fragment.append(document.createTextNode(text.slice(cursor)));
        }

        node.parentNode.replaceChild(fragment, node);
        return annotatedCount;
    }

    private createHoverAnnotation(text: string): HTMLElement {
        const span = document.createElement('span');
        span.className = 'onul-hover-entity';
        span.dataset.onulText = text;
        span.tabIndex = 0;
        span.textContent = text;
        span.style.cursor = 'help';
        span.style.textDecorationLine = 'underline';
        span.style.textDecorationStyle = 'dotted';
        span.style.textDecorationThickness = '1px';
        span.style.textUnderlineOffset = '0.16em';
        span.addEventListener('mouseenter', this.onHoverEntityEnter);
        span.addEventListener('focus', this.onHoverEntityEnter);
        span.addEventListener('mouseleave', this.onHoverEntityLeave);
        span.addEventListener('blur', this.onHoverEntityLeave);
        this.hoverAnnotations.add(span);
        return span;
    }

    private showHoverEntity(element: HTMLElement): void {
        if (!this.shouldRunHoverScanner()) {
            return;
        }

        const text = element.dataset.onulText ?? element.textContent.trim();
        const popupData = this.buildPopupData(text);

        if (!popupData) {
            hidePopup();
            return;
        }

        const popupHeight = 50 + popupData.rows.length * 40;
        const coords = calculatePopupPosition(element.getBoundingClientRect(), { width: 220, height: popupHeight });
        showPopup(coords.x, coords.y, {
            rows: popupData.rows,
            theme: this.currentSettings?.theme,
        });
    }

    private stopHoverScanning(): void {
        if (this.hoverScanTimeout !== undefined) {
            clearTimeout(this.hoverScanTimeout);
            this.hoverScanTimeout = undefined;
        }

        this.hoverObserver?.disconnect();
        this.hoverObserver = null;
        this.clearHoverAnnotations();
    }

    private clearHoverAnnotations(): void {
        for (const element of this.hoverAnnotations) {
            element.removeEventListener('mouseenter', this.onHoverEntityEnter);
            element.removeEventListener('focus', this.onHoverEntityEnter);
            element.removeEventListener('mouseleave', this.onHoverEntityLeave);
            element.removeEventListener('blur', this.onHoverEntityLeave);
            unwrapElement(element);
        }

        this.hoverAnnotations.clear();
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

    private isHighlightModeEnabled(): boolean {
        return this.currentSettings ? modeIncludesHighlight(this.currentSettings.interactionMode) : true;
    }

    private isHoverModeEnabled(): boolean {
        return this.currentSettings ? modeIncludesHover(this.currentSettings.interactionMode) : false;
    }

    private shouldRunHoverScanner(): boolean {
        return this.liveSelectionEnabled && this.isHoverModeEnabled() && !this.isIgnoredDomain();
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

function hasHoverCue(text: string): boolean {
    return /\b(?:tomorrow|today|yesterday)\b|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}|\b\d{10}\b|\b\d{13}\b|\b(?:[01]?\d|2[0-3]):[0-5]\d|\b(?:1[0-2]|0?[1-9])(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)/i.test(text);
}

function shouldSkipHoverElement(element: HTMLElement): boolean {
    return element.isContentEditable || Boolean(element.closest(
        '#onul-host, .onul-hover-entity, a, button, input, textarea, select, option, script, style, noscript, code, pre, kbd, samp, [contenteditable="true"], [contenteditable="plaintext-only"]'
    ));
}

function isVisibleElement(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);

    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0' &&
        element.getClientRects().length > 0;
}

function unwrapElement(element: HTMLElement): void {
    const parent = element.parentNode;

    if (!parent) {
        return;
    }

    while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
    }

    parent.removeChild(element);
    parent.normalize();
}

export {};
