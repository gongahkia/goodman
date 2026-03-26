export function getOverlayStyles(): string {
  return `
    :host {
      all: initial;
    }

    .goodman-overlay {
      --tc-font-family: "DM Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
      --tc-radius-md: 12px;
      --tc-radius-lg: 16px;
      --tc-radius-pill: 999px;
      --tc-duration-fast: 150ms;
      --tc-duration-normal: 220ms;
      --tc-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
      --tc-severity-low: #3f8f63;
      --tc-severity-medium: #b07b12;
      --tc-severity-high: #c4662d;
      --tc-severity-critical: #b54745;

      pointer-events: auto;
      position: absolute;
      top: 0;
      left: 0;
      width: min(420px, calc(100vw - 24px));
      max-height: min(560px, calc(100vh - 24px));
      overflow-y: auto;
      padding: 16px;
      border-radius: var(--tc-radius-lg);
      font-family: var(--tc-font-family);
      font-size: 14px;
      line-height: 1.5;
      z-index: 2147483647;
      animation: tc-slide-in var(--tc-duration-normal) var(--tc-ease-out);
    }

    .tc-theme-light {
      color: #37352f;
      background: #fbfbfa;
      border: 1px solid #e6e3de;
      box-shadow:
        0 18px 36px rgba(15, 15, 15, 0.12),
        0 3px 8px rgba(15, 15, 15, 0.08);
    }

    .tc-theme-dark {
      color: #e9e6e0;
      background: #242321;
      border: 1px solid #3a3834;
      box-shadow:
        0 18px 36px rgba(0, 0, 0, 0.34),
        0 3px 8px rgba(0, 0, 0, 0.2);
    }

    @keyframes tc-slide-in {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.985);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes tc-fade-out {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(6px);
      }
    }

    .goodman-overlay--dismissing {
      animation: tc-fade-out var(--tc-duration-fast) var(--tc-ease-out) forwards;
    }

    .goodman-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .goodman-header-left {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .goodman-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .tc-theme-light .goodman-eyebrow {
      color: #9b978f;
    }

    .tc-theme-dark .goodman-eyebrow {
      color: #a5a097;
    }

    .goodman-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .goodman-title {
      font-size: 22px;
      line-height: 1.05;
      font-weight: 700;
      letter-spacing: -0.03em;
    }

    .goodman-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      border: 1px solid transparent;
      background: transparent;
      color: inherit;
      font-size: 14px;
      cursor: pointer;
      transition:
        background var(--tc-duration-fast),
        border-color var(--tc-duration-fast);
    }

    .tc-theme-light .goodman-close:hover {
      background: #f1efeb;
      border-color: #e6e3de;
    }

    .tc-theme-dark .goodman-close:hover {
      background: #2d2b28;
      border-color: #47433d;
    }

    .goodman-close:focus-visible,
    .goodman-flag-card:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px rgba(47, 52, 55, 0.18);
    }

    .goodman-section {
      margin-top: 14px;
    }

    .goodman-summary-card {
      padding: 14px;
      border-radius: var(--tc-radius-lg);
    }

    .tc-theme-light .goodman-summary-card {
      background: #ffffff;
      border: 1px solid #e6e3de;
    }

    .tc-theme-dark .goodman-summary-card {
      background: #2a2926;
      border: 1px solid #3b3934;
    }

    .goodman-section-title {
      margin-bottom: 10px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .tc-theme-light .goodman-section-title {
      color: #6f6b63;
    }

    .tc-theme-dark .goodman-section-title {
      color: #b8b2a7;
    }

    .goodman-summary-text {
      font-size: 14px;
      line-height: 1.68;
    }

    .goodman-keypoints {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .goodman-keypoint-row {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: var(--tc-radius-md);
    }

    .tc-theme-light .goodman-keypoint-row {
      background: #f3f2ef;
    }

    .tc-theme-dark .goodman-keypoint-row {
      background: #2c2a27;
    }

    .goodman-keypoint-bullet {
      flex-shrink: 0;
      width: 14px;
      text-align: center;
    }

    .tc-theme-light .goodman-keypoint-bullet {
      color: #9b978f;
    }

    .tc-theme-dark .goodman-keypoint-bullet {
      color: #a5a097;
    }

    .goodman-keypoint-copy {
      line-height: 1.58;
    }

    .goodman-flag-card {
      margin-top: 10px;
      padding: 12px;
      border-radius: var(--tc-radius-md);
      cursor: pointer;
      transition:
        background var(--tc-duration-fast),
        border-color var(--tc-duration-fast);
    }

    .tc-theme-light .goodman-flag-card {
      background: #ffffff;
      border: 1px solid #e6e3de;
    }

    .tc-theme-dark .goodman-flag-card {
      background: #2a2926;
      border: 1px solid #3b3934;
    }

    .goodman-flag-low {
      border-left: 3px solid var(--tc-severity-low);
    }

    .goodman-flag-medium {
      border-left: 3px solid var(--tc-severity-medium);
    }

    .goodman-flag-high {
      border-left: 3px solid var(--tc-severity-high);
    }

    .goodman-flag-critical {
      border-left: 3px solid var(--tc-severity-critical);
    }

    .goodman-flag-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .goodman-flag-name {
      font-size: 13px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .goodman-severity-pill {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 9px;
      border-radius: var(--tc-radius-pill);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .goodman-severity-low {
      background: #eef7f1;
      color: var(--tc-severity-low);
    }

    .goodman-severity-medium {
      background: #fff6df;
      color: var(--tc-severity-medium);
    }

    .goodman-severity-high {
      background: #fff0e7;
      color: var(--tc-severity-high);
    }

    .goodman-severity-critical {
      background: #fff0ee;
      color: var(--tc-severity-critical);
    }

    .tc-theme-dark .goodman-severity-low {
      background: rgba(63, 143, 99, 0.18);
    }

    .tc-theme-dark .goodman-severity-medium {
      background: rgba(176, 123, 18, 0.18);
    }

    .tc-theme-dark .goodman-severity-high {
      background: rgba(196, 102, 45, 0.18);
    }

    .tc-theme-dark .goodman-severity-critical {
      background: rgba(181, 71, 69, 0.18);
    }

    .goodman-flag-details {
      max-height: 0;
      overflow: hidden;
      transition: max-height var(--tc-duration-normal) var(--tc-ease-out);
    }

    .goodman-flag-description {
      margin-top: 10px;
      line-height: 1.58;
    }

    .tc-theme-light .goodman-flag-description,
    .tc-theme-light .goodman-flag-quote,
    .tc-theme-light .goodman-footer-note {
      color: #6f6b63;
    }

    .tc-theme-dark .goodman-flag-description,
    .tc-theme-dark .goodman-flag-quote,
    .tc-theme-dark .goodman-footer-note {
      color: #b8b2a7;
    }

    .goodman-flag-quote {
      margin-top: 10px;
      padding-left: 12px;
      border-left: 2px solid #d8d5cf;
      font-size: 12px;
      line-height: 1.6;
    }

    .tc-theme-dark .goodman-flag-quote {
      border-left-color: #4b4740;
    }

    .goodman-footer {
      margin-top: 16px;
      padding-top: 14px;
      border-top: 1px solid #e6e3de;
    }

    .tc-theme-dark .goodman-footer {
      border-top-color: #3b3934;
    }

    .goodman-footer-note {
      font-size: 12px;
      line-height: 1.55;
    }
  `;
}
