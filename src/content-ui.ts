import type { Theme } from './storage';

let shadowRoot: ShadowRoot | null = null;
let popupElement: HTMLElement | null = null;
let hostElement: HTMLElement | null = null;

export interface PopupRow {
    time: string;
    zone: string;
    diff: string;
    date: string;
    copyText: string; // mirrored format for clipboard
}

export function initPopup() {
    if (hostElement) return;
    hostElement = document.createElement('div');
    hostElement.id = 'onul-host';
    hostElement.style.position = 'absolute';
    hostElement.style.top = '0';
    hostElement.style.left = '0';
    hostElement.style.width = '100%';
    hostElement.style.height = '0';
    hostElement.style.overflow = 'visible';
    hostElement.style.zIndex = '2147483647';
    hostElement.style.pointerEvents = 'none';
    shadowRoot = hostElement.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
        :host {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;
            --bg-color: rgba(20, 20, 20, 0.90);
            --border-color: rgba(255, 255, 255, 0.15);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --diff-bg: rgba(255, 255, 255, 0.15);
            --diff-text: rgba(255, 255, 255, 0.9);
            --shadow-color: rgba(0, 0, 0, 0.25);
            --check-color: #4ade80;
            --divider-color: rgba(255, 255, 255, 0.1);
        }
        .popup.light {
            --bg-color: rgba(255, 255, 255, 0.95);
            --border-color: rgba(0, 0, 0, 0.1);
            --text-primary: #111827;
            --text-secondary: #6B7280;
            --diff-bg: rgba(0, 0, 0, 0.06);
            --diff-text: #374151;
            --shadow-color: rgba(0, 0, 0, 0.1);
            --check-color: #16a34a;
            --divider-color: rgba(0, 0, 0, 0.08);
        }
        .popup {
            position: absolute;
            background: var(--bg-color);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 4px 24px var(--shadow-color), 0 1px 2px rgba(0,0,0,0.05);
            color: var(--text-primary);
            opacity: 0;
            transform: translateY(4px) scale(0.98);
            transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.2, 0, 0.13, 1.5);
            pointer-events: auto;
            min-width: 180px;
            max-width: 300px;
            z-index: 1;
        }
        .popup.visible {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
        .row { display: flex; flex-direction: column; }
        .row + .row {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px solid var(--divider-color);
        }
        .time {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 2px;
            letter-spacing: -0.02em;
            cursor: pointer;
            transition: opacity 0.1s ease;
        }
        .row:not(:first-child) .time { font-size: 15px; font-weight: 600; }
        .time:hover { opacity: 0.7; }
        .time.copied::after {
            content: ' \\2713';
            color: var(--check-color);
            font-size: 0.8em;
            margin-left: 4px;
        }
        .meta {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .row:not(:first-child) .meta { font-size: 12px; }
        .date {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 1px;
        }
        .diff {
            font-size: 12px;
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--diff-bg);
            color: var(--diff-text);
        }
    `;
    shadowRoot.appendChild(style);
    popupElement = document.createElement('div');
    popupElement.classList.add('popup');
    shadowRoot.appendChild(popupElement);
    document.body.appendChild(hostElement);
}

export function showPopup(x: number, y: number, data: { rows: PopupRow[], theme?: Theme }) {
    if (!hostElement) initPopup();
    if (!popupElement || !shadowRoot) return;
    popupElement.classList.remove('light', 'dark');
    const resolvedTheme = resolveTheme(data.theme);
    if (resolvedTheme === 'light') popupElement.classList.add('light');
    popupElement.replaceChildren();
    for (const row of data.rows) {
        const rowEl = document.createElement('div');
        rowEl.classList.add('row');
        if (row.date) {
            const dateEl = document.createElement('div');
            dateEl.classList.add('date');
            dateEl.textContent = row.date;
            rowEl.appendChild(dateEl);
        }
        const timeEl = document.createElement('div');
        timeEl.classList.add('time');
        timeEl.title = 'Click to copy';
        timeEl.textContent = row.time;
        timeEl.addEventListener('click', () => {
            handleCopy(row.copyText, timeEl);
        });
        const metaEl = document.createElement('div');
        metaEl.classList.add('meta');
        const zoneEl = document.createElement('span');
        zoneEl.classList.add('zone');
        zoneEl.textContent = row.zone;
        metaEl.appendChild(zoneEl);
        if (row.diff) {
            const diffEl = document.createElement('span');
            diffEl.classList.add('diff');
            diffEl.textContent = row.diff;
            metaEl.appendChild(diffEl);
        }
        rowEl.appendChild(timeEl);
        rowEl.appendChild(metaEl);
        popupElement.appendChild(rowEl);
    }
    popupElement.style.left = `${String(x)}px`;
    popupElement.style.top = `${String(y)}px`;
    popupElement.classList.add('visible');
}

export function hidePopup() {
    if (popupElement && shadowRoot) {
        popupElement.classList.remove('visible');
        shadowRoot.querySelectorAll('.time').forEach((element) => {
            element.classList.remove('copied');
        });
    }
}

function handleCopy(timeText: string, el: HTMLElement) {
    void copyText(timeText)
        .then(() => {
            el.classList.add('copied');
            setTimeout(() => {
                el.classList.remove('copied');
            }, 1500);
        })
        .catch((error: unknown) => {
            console.error('Failed to copy time:', error);
        });
}

export function isPopupEvent(event: Event): boolean {
    if (!hostElement) {
        return false;
    }

    return event.composedPath().includes(hostElement);
}

function resolveTheme(theme: Theme | undefined): 'light' | 'dark' {
    if (theme === 'light') {
        return 'light';
    }

    if (theme === 'dark') {
        return 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

async function copyText(timeText: string): Promise<void> {
    await navigator.clipboard.writeText(timeText);
}
