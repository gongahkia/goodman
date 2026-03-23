import type { Summary } from '@providers/types';
import type { PageAnalysisRecord } from '@shared/page-analysis';
import type { Settings } from '@shared/messages';
import {
  getPageAnalysisByUrl,
  getStorage,
  prunePageAnalysisState,
  setStorage,
} from '@shared/storage';
import type { PendingNotification } from '@shared/storage';
import { renderHistoryPanel } from '@popup/history';
import { renderCacheSettings } from '@popup/settings/cache';
import { renderDetectionSettings } from '@popup/settings/detection';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { renderProviderSettings } from '@popup/settings/providers';
import { getPendingNotifications } from '@versioning/notifications';

interface PopupState {
  tabId: number | null;
  tabUrl: string;
  domain: string;
  analysis: PageAnalysisRecord | null;
  pendingNotifications: PendingNotification[];
  loading: boolean;
  error: string | null;
}

const state: PopupState = {
  tabId: null,
  tabUrl: '',
  domain: '',
  analysis: null,
  pendingNotifications: [],
  loading: false,
  error: null,
};

let initialized = false;

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  state.tabId = tab?.id ?? null;
  state.tabUrl = tab?.url ?? '';

  if (tab?.url) {
    try {
      state.domain = new URL(tab.url).hostname;
    } catch {
      state.domain = 'unknown';
    }
  }

  await refreshPopupState();
  render(app);
}

function render(container: HTMLElement): void {
  container.textContent = '';

  container.appendChild(createHeader());
  const notificationBanner = createNotificationBanner();
  if (notificationBanner) {
    container.appendChild(notificationBanner);
  }

  if (state.loading) {
    container.appendChild(createLoadingState('Analyzing this page...'));
    return;
  }

  if (state.error && !state.analysis) {
    container.appendChild(createErrorState(state.error));
    container.appendChild(createFooter());
    return;
  }

  if (!state.analysis) {
    container.appendChild(createIdleState());
    container.appendChild(createFooter());
    return;
  }

  switch (state.analysis.status) {
    case 'ready':
      if (state.analysis.summary) {
        container.appendChild(createSummaryView(state.analysis.summary, state.analysis));
      } else {
        container.appendChild(createErrorState('Summary is unavailable for this analysis.'));
      }
      break;
    case 'analyzing':
      container.appendChild(createLoadingState('Analyzing this page...'));
      break;
    case 'needs_provider':
      container.appendChild(
        createActionState(
          'Advanced provider setup required',
          state.analysis.error ??
            'Switch to a bring-your-own-provider connection in Settings before analyzing this page.',
          'Open Settings',
          showSettings
        )
      );
      break;
    case 'needs_consent':
      container.appendChild(createHostedConsentState());
      break;
    case 'service_unavailable':
      container.appendChild(
        createDualActionState(
          'TC Guard Cloud is unavailable',
          state.analysis.error ??
            'Hosted analysis is temporarily unavailable. Try again shortly or switch to an advanced provider.',
          'Retry',
          handleAnalyze,
          'Open Settings',
          showSettings
        )
      );
      break;
    case 'extraction_failed':
      container.appendChild(
        createActionState(
          'Could not extract T&C text',
          state.analysis.error ??
            'A legal surface was detected, but the text could not be extracted.',
          'Analyze Again',
          handleAnalyze
        )
      );
      break;
    case 'error':
      container.appendChild(
        createErrorState(
          state.analysis.error ?? 'Could not analyze this page.'
        )
      );
      break;
    case 'no_detection':
    case 'idle':
    default:
      container.appendChild(createIdleState());
      break;
  }

  container.appendChild(createFooter());
}

function createHeader(): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--tc-border)';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:18px;font-weight:600';
  title.textContent = 'TC Guard';

  const domain = document.createElement('div');
  domain.style.cssText = 'font-size:13px;color:var(--tc-text-secondary)';
  domain.textContent = state.analysis?.domain ?? state.domain;

  header.appendChild(title);
  header.appendChild(domain);
  return header;
}

function createIdleState(): HTMLElement {
  return createActionState(
    'No T&C detected on this page',
    'Run a manual analysis if the legal text is hidden behind an interaction or loads late.',
    'Analyze This Page',
    handleAnalyze
  );
}

function createNotificationBanner(): HTMLElement | null {
  if (state.pendingNotifications.length === 0) {
    return null;
  }

  const currentDomain = getCurrentDomain();
  const currentDomainNotification = state.pendingNotifications.find(
    (notification) => notification.domain === currentDomain
  );

  const banner = document.createElement('div');
  banner.style.cssText =
    'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px;padding:12px;border-radius:var(--tc-radius-md);background:#eff6ff;border:1px solid #bfdbfe';

  const copy = document.createElement('div');

  const heading = document.createElement('p');
  heading.style.cssText = 'font-weight:600;margin-bottom:4px;color:#1d4ed8';
  heading.textContent = currentDomainNotification
    ? `Terms changed on ${currentDomainNotification.domain}`
    : 'Tracked T&C changes detected';

  const body = document.createElement('p');
  body.style.cssText = 'font-size:13px;line-height:1.5;color:#1e3a8a';
  body.textContent = currentDomainNotification
    ? formatCurrentDomainNotification(currentDomainNotification)
    : formatGenericNotificationSummary(state.pendingNotifications);

  copy.appendChild(heading);
  copy.appendChild(body);

  const cta = createButton('Open History', () => {
    showHistory(resolveNotificationTargetDomain());
  });
  cta.style.padding = '6px 12px';
  cta.style.flexShrink = '0';

  banner.appendChild(copy);
  banner.appendChild(cta);
  return banner;
}

function createLoadingState(label: string): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText =
    'text-align:center;padding:32px 16px;color:var(--tc-text-secondary)';
  div.textContent = label;
  return div;
}

function createErrorState(error: string): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText =
    'padding:12px;background:#fee2e2;border-radius:var(--tc-radius-md);color:#991b1b;margin-bottom:12px';
  div.textContent = error;
  div.appendChild(createButton('Retry', handleAnalyze));
  return div;
}

function createActionState(
  title: string,
  body: string,
  buttonLabel: string,
  onClick: () => void
): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;padding:32px 16px';

  const heading = document.createElement('p');
  heading.style.cssText = 'font-weight:600;margin-bottom:8px';
  heading.textContent = title;

  const copy = document.createElement('p');
  copy.style.cssText =
    'color:var(--tc-text-secondary);margin-bottom:16px;line-height:1.5';
  copy.textContent = body;

  div.appendChild(heading);
  div.appendChild(copy);
  div.appendChild(createButton(buttonLabel, onClick));
  return div;
}

function createDualActionState(
  title: string,
  body: string,
  primaryLabel: string,
  primaryAction: () => void,
  secondaryLabel: string,
  secondaryAction: () => void
): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;padding:32px 16px';

  const heading = document.createElement('p');
  heading.style.cssText = 'font-weight:600;margin-bottom:8px';
  heading.textContent = title;

  const copy = document.createElement('p');
  copy.style.cssText =
    'color:var(--tc-text-secondary);margin-bottom:16px;line-height:1.5';
  copy.textContent = body;

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap';
  actions.appendChild(createButton(primaryLabel, primaryAction));
  actions.appendChild(createFooterButton(secondaryLabel, secondaryAction));

  div.appendChild(heading);
  div.appendChild(copy);
  div.appendChild(actions);
  return div;
}

function createHostedConsentState(): HTMLElement {
  return createDualActionState(
    'Enable TC Guard Cloud',
    state.analysis?.error ??
      'To summarize this agreement, TC Guard needs your permission to send the extracted terms to TC Guard Cloud for analysis.',
    'Accept and Analyze',
    () => {
      void acceptHostedConsentAndAnalyze();
    },
    'Open Settings',
    showSettings
  );
}

function createSummaryView(
  summary: Summary,
  analysis: PageAnalysisRecord
): HTMLElement {
  const div = document.createElement('div');
  div.appendChild(createSeverityBadge(summary.severity));
  div.appendChild(createMetadataRow(analysis));

  const summaryP = document.createElement('p');
  summaryP.style.cssText = 'margin:12px 0;line-height:1.5';
  summaryP.textContent = summary.summary;
  div.appendChild(summaryP);

  if (summary.keyPoints.length > 0) {
    const kpHeader = document.createElement('h3');
    kpHeader.style.cssText = 'font-size:14px;font-weight:600;margin:12px 0 8px';
    kpHeader.textContent = `Key Points (${summary.keyPoints.length})`;
    div.appendChild(kpHeader);

    const ul = document.createElement('ul');
    ul.style.cssText = 'padding-left:20px;margin-bottom:12px';
    for (const point of summary.keyPoints) {
      const li = document.createElement('li');
      li.style.cssText = 'margin-bottom:4px;line-height:1.4';
      li.textContent = point;
      ul.appendChild(li);
    }
    div.appendChild(ul);
  }

  if (summary.redFlags.length > 0) {
    const rfHeader = document.createElement('h3');
    rfHeader.style.cssText = 'font-size:14px;font-weight:600;margin:12px 0 8px';
    rfHeader.textContent = `Red Flags (${summary.redFlags.length})`;
    div.appendChild(rfHeader);
    for (const flag of summary.redFlags) {
      div.appendChild(createRedFlagCard(flag));
    }
  }

  return div;
}

function createMetadataRow(analysis: PageAnalysisRecord): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;margin-bottom:4px';

  const chips = [
    `Source: ${formatToken(analysis.sourceType)}`,
    `Detection: ${formatToken(analysis.detectionType)}`,
    `Confidence: ${formatConfidence(analysis.confidence)}`,
  ];

  for (const chipText of chips) {
    const chip = document.createElement('span');
    chip.style.cssText =
      'font-size:11px;color:var(--tc-text-secondary);background:var(--tc-surface);border-radius:9999px;padding:4px 8px';
    chip.textContent = chipText;
    row.appendChild(chip);
  }

  return row;
}

function createSeverityBadge(severity: string): HTMLElement {
  const colors: Record<string, string> = {
    low: 'var(--tc-severity-low)',
    medium: 'var(--tc-severity-medium)',
    high: 'var(--tc-severity-high)',
    critical: 'var(--tc-severity-critical)',
  };

  const div = document.createElement('div');
  div.style.cssText = 'display:flex;align-items:center;gap:8px';

  const dot = document.createElement('span');
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${colors[severity] ?? colors['medium']}`;

  const label = document.createElement('span');
  label.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase';
  label.textContent = severity;

  div.appendChild(dot);
  div.appendChild(label);
  return div;
}

function createRedFlagCard(flag: {
  category: string;
  description: string;
  severity: string;
  quote: string;
}): HTMLElement {
  const card = document.createElement('div');
  const severityColors: Record<string, string> = {
    low: 'var(--tc-severity-low)',
    medium: 'var(--tc-severity-medium)',
    high: 'var(--tc-severity-high)',
  };

  card.style.cssText = `border-left:3px solid ${severityColors[flag.severity] ?? severityColors['medium']};background:var(--tc-surface);border-radius:var(--tc-radius-md);padding:12px;margin-bottom:8px;cursor:pointer`;

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center';

  const catName = document.createElement('span');
  catName.style.cssText = 'font-weight:500;font-size:13px';
  catName.textContent = flag.category.replace(/_/g, ' ');

  const sevPill = document.createElement('span');
  sevPill.style.cssText = 'font-size:11px;font-weight:600;text-transform:uppercase';
  sevPill.textContent = flag.severity;

  header.appendChild(catName);
  header.appendChild(sevPill);
  card.appendChild(header);

  const details = document.createElement('div');
  details.style.cssText =
    'max-height:0;overflow:hidden;transition:max-height 200ms cubic-bezier(0.16,1,0.3,1)';

  const desc = document.createElement('p');
  desc.style.cssText =
    'margin:8px 0;font-size:13px;color:var(--tc-text-secondary);line-height:1.4';
  desc.textContent = flag.description;
  details.appendChild(desc);

  if (flag.quote) {
    const quote = document.createElement('blockquote');
    quote.style.cssText =
      'border-left:2px solid var(--tc-text-tertiary);padding-left:12px;color:var(--tc-text-secondary);font-style:italic;font-size:12px;margin:8px 0';
    quote.textContent = flag.quote;
    details.appendChild(quote);
  }

  card.appendChild(details);
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-expanded', 'false');
  card.addEventListener('click', () => {
    const expanded = card.getAttribute('aria-expanded') === 'true';
    card.setAttribute('aria-expanded', String(!expanded));
    details.style.maxHeight = expanded ? '0' : '300px';
  });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });

  return card;
}

function createButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.style.cssText =
    'background:var(--tc-accent);color:var(--tc-accent-text);border:none;border-radius:var(--tc-radius-md);padding:8px 16px;cursor:pointer;font-size:14px;font-weight:500;transition:background 150ms';
  btn.textContent = text;
  btn.addEventListener('click', () => onClick());
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--tc-accent-hover)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'var(--tc-accent)';
  });
  return btn;
}

function createFooter(): HTMLElement {
  const footer = document.createElement('div');
  footer.style.cssText =
    'display:flex;gap:8px;justify-content:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--tc-border)';

  footer.appendChild(createFooterButton('Settings', showSettings));
  footer.appendChild(createFooterButton('History', () => {
    showHistory();
  }));
  return footer;
}

function createFooterButton(
  text: string,
  onClick: () => void
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.style.cssText =
    'background:transparent;color:var(--tc-accent);border:1px solid var(--tc-border);border-radius:var(--tc-radius-md);padding:6px 16px;cursor:pointer;font-size:13px;transition:background 150ms';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--tc-hover-bg)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent';
  });
  return btn;
}

async function handleAnalyze(settingsOverride?: Partial<Settings>): Promise<void> {
  state.loading = true;
  state.error = null;
  renderCurrentApp();

  try {
    if (state.tabId === null) {
      throw new Error('No active tab');
    }

    const payload = settingsOverride
      ? { tabId: state.tabId, settingsOverride }
      : { tabId: state.tabId };

    const response = (await chrome.tabs.sendMessage(state.tabId, {
      type: 'DETECT_TC',
      payload,
    })) as { ok?: boolean; error?: string } | undefined;

    await refreshPopupState();
    if (response && response.ok === false && !state.analysis) {
      state.error = response.error ?? 'Could not analyze this page.';
    }
  } catch {
    state.error = 'Could not analyze this page.';
  } finally {
    state.loading = false;
    renderCurrentApp();
  }
}

async function acceptHostedConsentAndAnalyze(): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) {
    state.error = 'Could not update TC Guard Cloud settings.';
    renderCurrentApp();
    return;
  }

  const saveResult = await setStorage('settings', {
    ...settingsResult.data,
    hostedConsentAccepted: true,
  });
  if (!saveResult.ok) {
    state.error = 'Could not save TC Guard Cloud consent.';
    renderCurrentApp();
    return;
  }

  state.analysis = state.analysis
    ? {
        ...state.analysis,
        status: 'analyzing',
        error: null,
      }
    : state.analysis;

  await handleAnalyze({ hostedConsentAccepted: true });
}

function showSettings(): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.textContent = '';
  app.appendChild(createBackButton());

  const heading = document.createElement('h2');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Settings';
  app.appendChild(heading);

  const tabs = ['Providers', 'Detection', 'Notifications', 'Cache'] as const;
  const tabBar = document.createElement('div');
  tabBar.style.cssText =
    'display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--tc-border)';

  const contentDiv = document.createElement('div');

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.style.cssText =
      'background:none;border:none;border-bottom:2px solid transparent;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;color:var(--tc-text-secondary)';
    btn.textContent = tab;
    btn.addEventListener('click', async () => {
      for (const child of tabBar.children) {
        (child as HTMLElement).style.borderBottomColor = 'transparent';
        (child as HTMLElement).style.color = 'var(--tc-text-secondary)';
      }
      btn.style.borderBottomColor = 'var(--tc-accent)';
      btn.style.color = 'var(--tc-text)';

      switch (tab) {
        case 'Providers':
          await renderProviderSettings(contentDiv);
          break;
        case 'Detection':
          await renderDetectionSettings(contentDiv);
          break;
        case 'Notifications':
          await renderNotificationSettings(contentDiv);
          break;
        case 'Cache':
          await renderCacheSettings(contentDiv);
          break;
      }
    });
    tabBar.appendChild(btn);
  }

  app.appendChild(tabBar);
  app.appendChild(contentDiv);

  const firstTab = tabBar.children[0] as HTMLElement;
  firstTab.style.borderBottomColor = 'var(--tc-accent)';
  firstTab.style.color = 'var(--tc-text)';
  void renderProviderSettings(contentDiv);
}

function showHistory(initialDomain?: string): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.textContent = '';
  app.appendChild(createBackButton());

  const contentDiv = document.createElement('div');
  app.appendChild(contentDiv);
  void renderHistoryPanel(contentDiv, initialDomain ?? getCurrentDomain());
}

function createBackButton(): HTMLButtonElement {
  const back = document.createElement('button');
  back.style.cssText =
    'background:none;border:none;color:var(--tc-accent);cursor:pointer;font-size:14px;margin-bottom:12px';
  back.textContent = '← Back';
  back.addEventListener('click', () => {
    void refreshPopupState().then(() => {
      renderCurrentApp();
    });
  });
  return back;
}

async function refreshPopupState(): Promise<void> {
  await prunePageAnalysisState();
  await refreshPageAnalysis();
  await refreshNotifications();
}

async function refreshPageAnalysis(): Promise<void> {
  if (!state.tabUrl && state.tabId === null) {
    state.analysis = null;
    return;
  }

  if (state.tabUrl) {
    const analysisByUrl = await getPageAnalysisByUrl(state.tabUrl);
    if (analysisByUrl) {
      state.analysis = {
        ...analysisByUrl,
        tabId: state.tabId ?? analysisByUrl.tabId,
      };
      state.error = null;
      if (state.analysis.domain) {
        state.domain = state.analysis.domain;
      }
      return;
    }
  }

  state.analysis = null;
  state.error = null;
}

async function refreshNotifications(): Promise<void> {
  state.pendingNotifications = await getPendingNotifications();
}

function renderCurrentApp(): void {
  const app = document.getElementById('app');
  if (app) {
    render(app);
  }
}

function formatConfidence(value: number | null): string {
  if (value === null) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function formatToken(value: string | null): string {
  if (!value) return 'n/a';
  return value.replace(/_/g, ' ');
}

function getCurrentDomain(): string {
  return state.analysis?.domain ?? state.domain;
}

function resolveNotificationTargetDomain(): string {
  const currentDomain = getCurrentDomain();
  const currentDomainNotification = state.pendingNotifications.find(
    (notification) => notification.domain === currentDomain
  );

  return (
    currentDomainNotification?.domain ??
    state.pendingNotifications[0]?.domain ??
    currentDomain
  );
}

function formatCurrentDomainNotification(
  notification: PendingNotification
): string {
  if (notification.addedRedFlags > 0) {
    const noun = notification.addedRedFlags === 1 ? 'red flag' : 'red flags';
    const verb = notification.addedRedFlags === 1 ? 'was' : 'were';
    return `${notification.addedRedFlags} new ${noun} ${verb} added since the last saved version.`;
  }

  return 'A tracked T&C change was detected for this domain.';
}

function formatGenericNotificationSummary(
  notifications: PendingNotification[]
): string {
  const count = notifications.length;
  return count === 1
    ? '1 tracked domain has a new terms change ready for review.'
    : `${count} tracked domains have new terms changes ready for review.`;
}

function bootstrap(): void {
  if (initialized) return;
  initialized = true;
  void init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
}

if (document.getElementById('app')) {
  queueMicrotask(bootstrap);
}
