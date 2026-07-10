import type { DarkPatternSignalId, DarkPatternSeverity } from '@shared/dark-patterns';

export interface DarkPatternConsentFixture {
  id: string;
  sourceName: string;
  sourceUrl: string;
  html: string;
  expectedFindings: Array<{
    id: DarkPatternSignalId;
    severity: DarkPatternSeverity;
  }>;
  shouldRenderBadge: boolean;
}

const LONG_COOKIE_COPY = `
  We use cookies and similar tracking technologies for analytics, advertising,
  personalization, fraud prevention, product measurement, and partner reporting.
  Optional cookies help us understand visits across pages and improve service operations
  under this privacy policy and consent notice.
`;

export const DARK_PATTERN_CONSENT_FIXTURES: DarkPatternConsentFixture[] = [
  {
    id: 'accept-all-manage-only',
    sourceName: 'Representative public cookie-banner pattern from consent-banner dark-pattern studies',
    sourceUrl: 'https://arxiv.org/abs/2006.13985',
    shouldRenderBadge: true,
    expectedFindings: [
      { id: 'accept_all_without_equal_reject', severity: 'medium' },
    ],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>${LONG_COOKIE_COPY}</p>
        <button class="primary">Accept All Cookies</button>
        <button>Manage Preferences</button>
      </div>
    `,
  },
  {
    id: 'accept-all-equal-reject',
    sourceName: 'EDPB cookie notice with symmetric accept/reject controls',
    sourceUrl: 'https://www.edpb.europa.eu/documents/guideline/guidelines-032022-on-deceptive-design-patterns-in-social-media-platform_en',
    shouldRenderBadge: false,
    expectedFindings: [],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>${LONG_COOKIE_COPY}</p>
        <button>Accept All Cookies</button>
        <button>Reject All Cookies</button>
      </div>
    `,
  },
  {
    id: 'prechecked-partner-analytics',
    sourceName: 'FTC staff report example category: pre-checked boxes for data or purchases',
    sourceUrl: 'https://www.ftc.gov/reports/bringing-dark-patterns-light',
    shouldRenderBadge: true,
    expectedFindings: [
      { id: 'prechecked_data_opt_in', severity: 'high' },
    ],
    html: `
      <form class="privacy-options">
        <input type="checkbox" id="partner-analytics" checked>
        <label for="partner-analytics">
          Share analytics and advertising data with third-party partners for measurement and targeted ads.
        </label>
      </form>
    `,
  },
  {
    id: 'unchecked-partner-analytics',
    sourceName: 'Negative control for optional analytics choices',
    sourceUrl: 'https://www.ftc.gov/reports/bringing-dark-patterns-light',
    shouldRenderBadge: false,
    expectedFindings: [],
    html: `
      <form class="privacy-options">
        <input type="checkbox" id="partner-analytics">
        <label for="partner-analytics">
          Share analytics and advertising data with third-party partners for measurement and targeted ads.
        </label>
      </form>
    `,
  },
  {
    id: 'hidden-reject',
    sourceName: 'EDPB obstructing/hidden-in-plain-sight pattern category',
    sourceUrl: 'https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf',
    shouldRenderBadge: true,
    expectedFindings: [
      { id: 'hidden_reject_path', severity: 'high' },
    ],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>${LONG_COOKIE_COPY}</p>
        <button>Accept All Cookies</button>
        <button style="display: none">Reject All Cookies</button>
      </div>
    `,
  },
  {
    id: 'visible-reject',
    sourceName: 'Negative control for visible reject path',
    sourceUrl: 'https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf',
    shouldRenderBadge: false,
    expectedFindings: [],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>${LONG_COOKIE_COPY}</p>
        <button>Accept All Cookies</button>
        <button>Reject All Cookies</button>
        <button>Manage Preferences</button>
      </div>
    `,
  },
  {
    id: 'agree-to-continue',
    sourceName: 'EDPB misleading-action and emotional-steering pattern category',
    sourceUrl: 'https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf',
    shouldRenderBadge: true,
    expectedFindings: [
      { id: 'coercive_continue_copy', severity: 'medium' },
    ],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>
          You must agree to continue using this service and allow optional cookie processing.
          ${LONG_COOKIE_COPY}
        </p>
        <button>I Agree</button>
      </div>
    `,
  },
  {
    id: 'agree-with-decline',
    sourceName: 'Negative control for coercive copy with visible decline',
    sourceUrl: 'https://www.edpb.europa.eu/system/files/documents/2023-02/edpb_03-2022_guidelines_on_deceptive_design_patterns_in_social_media_platform_interfaces_v2_en_0.pdf',
    shouldRenderBadge: false,
    expectedFindings: [],
    html: `
      <div class="cookie-consent" role="dialog" aria-label="Cookie choices">
        <p>
          You may agree to continue with optional cookies or decline optional processing.
          ${LONG_COOKIE_COPY}
        </p>
        <button>I Agree</button>
        <button>Decline Optional Cookies</button>
      </div>
    `,
  },
];

export function getDarkPatternFixture(id: string): DarkPatternConsentFixture {
  const fixture = DARK_PATTERN_CONSENT_FIXTURES.find((item) => item.id === id);
  if (!fixture) throw new Error(`Unknown dark-pattern fixture: ${id}`);
  return fixture;
}
