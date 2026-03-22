export function getOverlayStyles(): string {
  return `
    :host {
      all: initial;
    }

    .tc-guard-overlay {
      --tc-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --tc-radius-md: 8px;
      --tc-radius-lg: 12px;
      --tc-radius-full: 9999px;
      --tc-severity-low: #22c55e;
      --tc-severity-medium: #eab308;
      --tc-severity-high: #f97316;
      --tc-severity-critical: #ef4444;
      --tc-duration-fast: 150ms;
      --tc-duration-normal: 200ms;
      --tc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);

      position: absolute;
      top: 0;
      left: 0;
      max-width: 380px;
      max-height: 500px;
      overflow-y: auto;
      font-family: var(--tc-font-family);
      font-size: 14px;
      line-height: 1.5;
      border-radius: var(--tc-radius-lg);
      padding: 16px;
      z-index: 2147483647;
      animation: tc-slide-in var(--tc-duration-normal) var(--tc-ease-out);
    }

    .tc-theme-light {
      background: #ffffff;
      color: #1a1a1a;
      border: 1px solid #e5e7eb;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1);
    }

    .tc-theme-dark {
      background: #1e1e2e;
      color: #e0e0e0;
      border: 1px solid #3a3a4a;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.3), 0 4px 6px -4px rgba(0,0,0,0.25);
    }

    @keyframes tc-slide-in {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes tc-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .tc-guard-overlay--dismissing {
      animation: tc-fade-out var(--tc-duration-fast) var(--tc-ease-out) forwards;
    }

    .tc-guard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    .tc-theme-dark .tc-guard-header { border-bottom-color: #3a3a4a; }

    .tc-guard-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .tc-guard-severity-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .tc-guard-severity-low { background: var(--tc-severity-low); }
    .tc-guard-severity-medium { background: var(--tc-severity-medium); }
    .tc-guard-severity-high { background: var(--tc-severity-high); }
    .tc-guard-severity-critical { background: var(--tc-severity-critical); }

    .tc-guard-title {
      font-size: 16px;
      font-weight: 600;
    }

    .tc-guard-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: var(--tc-radius-md);
      color: inherit;
      min-width: 32px;
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tc-guard-close:hover { background: rgba(0,0,0,0.05); }
    .tc-theme-dark .tc-guard-close:hover { background: rgba(255,255,255,0.1); }
    .tc-guard-close:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.5);
    }

    .tc-guard-section {
      margin-bottom: 12px;
    }

    .tc-guard-section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .tc-guard-summary-text {
      line-height: 1.5;
    }

    .tc-guard-keypoints {
      padding-left: 20px;
      margin: 0;
    }
    .tc-guard-keypoints li {
      margin-bottom: 4px;
    }

    .tc-guard-flag-card {
      border-radius: var(--tc-radius-md);
      padding: 12px;
      margin-bottom: 8px;
      cursor: pointer;
    }
    .tc-theme-light .tc-guard-flag-card { background: #f8f9fa; }
    .tc-theme-dark .tc-guard-flag-card { background: #2a2a3c; }

    .tc-guard-flag-low { border-left: 3px solid var(--tc-severity-low); }
    .tc-guard-flag-medium { border-left: 3px solid var(--tc-severity-medium); }
    .tc-guard-flag-high { border-left: 3px solid var(--tc-severity-high); }

    .tc-guard-flag-card:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.5);
    }

    .tc-guard-flag-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .tc-guard-flag-name {
      font-weight: 500;
      font-size: 13px;
      text-transform: capitalize;
    }

    .tc-guard-severity-pill {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: var(--tc-radius-full);
    }

    .tc-guard-flag-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height var(--tc-duration-normal) var(--tc-ease-out);
    }

    .tc-guard-flag-details p {
      margin: 8px 0;
      font-size: 13px;
      line-height: 1.4;
    }
    .tc-theme-light .tc-guard-flag-details p { color: #6b7280; }
    .tc-theme-dark .tc-guard-flag-details p { color: #9ca3af; }

    .tc-guard-flag-quote {
      border-left: 2px solid #9ca3af;
      padding-left: 12px;
      font-style: italic;
      font-size: 12px;
      margin: 8px 0;
    }
    .tc-theme-light .tc-guard-flag-quote { color: #6b7280; }
    .tc-theme-dark .tc-guard-flag-quote { color: #9ca3af; }

    .tc-guard-footer {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
    }
    .tc-theme-dark .tc-guard-footer { border-top-color: #3a3a4a; }

    *:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.5);
    }
  `;
}
