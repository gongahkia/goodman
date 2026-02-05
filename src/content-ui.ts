
let shadowRoot: ShadowRoot | null = null;
let popupElement: HTMLElement | null = null;
let hostElement: HTMLElement | null = null;

export function initPopup() {
    if (hostElement) return;

    // Create Host
    hostElement = document.createElement('div');
    hostElement.id = 'timezone-extension-host';
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
        }
        .popup {
            position: absolute;
            background: rgba(20, 20, 20, 0.90);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            padding: 12px 16px;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25), 0 1px 2px rgba(0,0,0,0.1);
            color: #ffffff;
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
            color: #ffffff;
            margin-bottom: 2px;
            letter-spacing: -0.02em;
        }
        .meta {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.7);
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .diff {
            font-size: 12px;
            padding: 1px 6px;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.15);
            color: rgba(255, 255, 255, 0.9);
        }
        .time {
            cursor: pointer;
            transition: color 0.1s ease;
        }
        .time:hover {
            color: #ffffff;
            opacity: 0.9;
        }
        .time.copied::after {
            content: ' ✓';
            color: #4ade80;
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

export function showPopup(x: number, y: number, data: { time: string, zone: string, diff?: string }) {
    if (!hostElement) initPopup();

    if (!popupElement || !shadowRoot) return;

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
