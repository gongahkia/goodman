/* eslint-disable */
let shadowRoot: ShadowRoot | null = null;
let popupElement: HTMLElement | null = null;
let hostElement: HTMLElement | null = null;

export function initPopup() {
    if (hostElement) return;

    // Create Host
    hostElement = document.createElement('div');
    hostElement.id = 'onul-host';
    hostElement.style.position = 'absolute';
    hostElement.style.top = '0';
    hostElement.style.left = '0';
    hostElement.style.width = '100%';
    hostElement.style.height = '0'; // Don't block clicks
    hostElement.style.overflow = 'visible';
    hostElement.style.zIndex = '2147483647'; // Max integer
    hostElement.style.pointerEvents = 'none'; // Passthrough clicks

    // Attach Shadow DOM
    shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        :host {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            line-height: 1.5;

            /* Default Dark Theme Variables */
            --bg-color: rgba(20, 20, 20, 0.90);
            --border-color: rgba(255, 255, 255, 0.15);
            --text-primary: #ffffff;
            --text-secondary: rgba(255, 255, 255, 0.7);
            --diff-bg: rgba(255, 255, 255, 0.15);
            --diff-text: rgba(255, 255, 255, 0.9);
            --shadow-color: rgba(0, 0, 0, 0.25);
            --check-color: #4ade80;
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
        .time {
            font-size: 18px;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 2px;
            letter-spacing: -0.02em;
        }
        .meta {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .diff {
            font-size: 12px;
            padding: 1px 6px;
            border-radius: 4px;
            background: var(--diff-bg);
            color: var(--diff-text);
        }
        .time {
            cursor: pointer;
            transition: opacity 0.1s ease;
        }
        .time:hover {
            opacity: 0.7;
        }
        .time.copied::after {
            content: ' ✓';
            color: var(--check-color);
            font-size: 0.8em;
            margin-left: 4px;
        }
    `;
    shadowRoot.appendChild(style);

    // Popup Structure
    popupElement = document.createElement('div');
    popupElement.classList.add('popup');
    popupElement.innerHTML = `
        <div class="time" title="Click to copy">--:--</div>
        <div class="meta">
            <span class="zone">---</span>
            <span class="diff" style="display:none"></span>
        </div>
    `;

    // Add Copy Listener
    const timeEl = popupElement.querySelector('.time');
    if (timeEl) {
        timeEl.addEventListener('click', () => {
            const text = timeEl.textContent || '';
            // Remove checkmark if somehow included (css handles content, but just in case)
            handleCopy(text);
        });
    }

    shadowRoot.appendChild(popupElement);
    document.body.appendChild(hostElement);
}

export function showPopup(x: number, y: number, data: { time: string, zone: string, diff?: string, theme?: string }) {
    if (!hostElement) initPopup();

    if (!popupElement || !shadowRoot) return;

    // Apply Theme
    popupElement.classList.remove('light', 'dark');
    if (data.theme === 'light') {
        popupElement.classList.add('light');
    }
    // Default is dark (no class or explicit dark if we wanted, but styles are default dark)
    // If we wanted explicit dark class we could add it, but currently default variables are dark.
    // However, if we added a check for system preference in JS, we could pass 'light' or 'dark'.
    // Let's rely on data.theme passing 'light' or 'dark'. 
    // If 'auto', the caller should resolve it to 'light' or 'dark' before calling showPopup, 
    // OR we can use matchMedia here. Ideally caller resolves it.

    if (data.theme === 'light') {
        popupElement.classList.add('light');
    }

    const timeEl = shadowRoot.querySelector('.time');
    const zoneEl = shadowRoot.querySelector('.zone');
    const diffEl = shadowRoot.querySelector('.diff') as HTMLElement;

    if (timeEl) timeEl.textContent = data.time;
    if (zoneEl) zoneEl.textContent = data.zone;

    if (diffEl) {
        if (data.diff) {
            diffEl.textContent = data.diff;
            diffEl.style.display = 'inline-block';
        } else {
            diffEl.style.display = 'none';
        }
    }

    // Position
    popupElement.style.left = `${x}px`;
    popupElement.style.top = `${y}px`;

    // Show
    popupElement.classList.add('visible');
}

export function hidePopup() {
    if (popupElement) {
        popupElement.classList.remove('visible');

        // Reset copy feedback
        const timeEl = shadowRoot?.querySelector('.time');
        if (timeEl) timeEl.classList.remove('copied');
    }
}

function handleCopy(timeText: string) {
    navigator.clipboard.writeText(timeText).then(() => {
        // Visual Feedback
        const timeEl = shadowRoot?.querySelector('.time');
        if (timeEl) {
            timeEl.classList.add('copied');

            // Revert after 1.5s
            setTimeout(() => {
                timeEl?.classList.remove('copied');
            }, 1500);
        }
    }).catch(err => {
        console.error('Failed to copy time:', err);
    });
}
