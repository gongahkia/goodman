import type { Summary } from '@providers/types';
import { renderOnboarding } from '@popup/onboarding';
import { renderHistoryPanel } from '@popup/history';
import { renderCacheSettings } from '@popup/settings/cache';
import { renderDetectionSettings } from '@popup/settings/detection';
import { renderDomainSettings } from '@popup/settings/domains';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { renderProviderSettings } from '@popup/settings/providers';
import {
  appendChildren,
  createButton,
  createElement,
  createPill,
  createSectionHeading,
  cx,
} from '@popup/ui';
import type { Settings } from '@shared/messages';
import type {
  PageAnalysisLogEntry,
  PageAnalysisRecord,
} from '@shared/page-analysis';
import type { PendingNotification } from '@shared/storage';
import {
  getPageAnalysisByUrl,
  getStorage,
  prunePageAnalysisState,
  setStorage,
} from '@shared/storage';
import { sendToBackground } from '@shared/messaging';
import { getPendingNotifications } from '@versioning/notifications';

interface PopupState {
  tabId: number | null;
  windowId: number | null;
  tabUrl: string;
  domain: string;
  analysis: PageAnalysisRecord | null;
  pendingNotifications: PendingNotification[];
  settings: Settings | null;
  loading: boolean;
  error: string | null;
  analysisStartedAt: number | null;
}

const SETTINGS_TABS = ['Providers', 'Detection', 'Notifications', 'Domains', 'Cache'] as const;

const state: PopupState = {
  tabId: null,
  windowId: null,
  tabUrl: '',
  domain: '',
  analysis: null,
  pendingNotifications: [],
  settings: null,
  loading: false,
  error: null,
  analysisStartedAt: null,
};

let initialized = false;

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  const onboardingResult = await getStorage('onboardingCompleted');
  if (onboardingResult.ok && !onboardingResult.data) {
    renderOnboarding(app, () => void initMain(app));
    return;
  }

  await initMain(app);
}

async function initMain(app: HTMLElement): Promise<void> {
  await refreshActiveTabContext();

  await refreshPopupState();
  render(app);

  try { await chrome.action?.setBadgeText?.({ text: '' }); } catch { /* noop */ }

  if (chrome.storage?.onChanged) {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('pageAnalysis' in changes || 'pendingNotifications' in changes) {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void refreshPopupState().then(() => renderCurrentApp());
        }, 300);
      }
    });
  }

  registerActiveTabSync();
}

function render(container: HTMLElement): void {
  container.className = 'tc-page';
  container.textContent = '';

  if (!state.loading && state.analysis?.status !== 'analyzing' && loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }

  appendChildren(container, createHeader());

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
    if (isFirstRun()) {
      container.appendChild(createOnboardingCard());
    } else {
      container.appendChild(createIdleState());
    }
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
        createErrorState(state.analysis.error ?? 'Could not analyze this page.')
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
  const header = createElement('section', 'tc-page-header');
  const titleBlock = createElement('div');
  const eyebrow = createElement('p', 'tc-page-eyebrow', 'TC Guard workspace');
  const title = createElement('h1', 'tc-page-title', 'Terms Overview');
  const copy = createElement(
    'p',
    'tc-page-copy',
    'Review the active page, rerun analysis, and inspect tracked legal changes from one quiet workspace.'
  );

  const domainChip = createPill(getCurrentDomain() || 'No active domain', 'muted');
  domainChip.classList.add('tc-domain-chip');

  appendChildren(titleBlock, eyebrow, title, copy);
  appendChildren(header, titleBlock, domainChip);
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

function isFirstRun(): boolean {
  return (
    state.settings?.activeProvider === 'hosted' &&
    !state.settings?.hostedConsentAccepted
  );
}

function createOnboardingCard(): HTMLElement {
  const card = createDualActionState(
    'Welcome to TC Guard',
    'TC Guard detects Terms & Conditions on any page, summarizes them with AI, and tracks changes over time. Get started by enabling the hosted analysis service, or configure your own LLM provider.',
    'Get Started',
    () => { void acceptHostedConsentAndAnalyze(); },
    'Use Your Own Provider',
    showSettings
  );
  return card;
}

function createNotificationBanner(): HTMLElement | null {
  if (state.pendingNotifications.length === 0) {
    return null;
  }

  const currentDomain = getCurrentDomain();
  const currentDomainNotification = state.pendingNotifications.find(
    (notification) => notification.domain === currentDomain
  );

  const banner = createElement('section', 'tc-banner');
  const row = createElement('div', 'tc-banner-row');
  const copy = createElement('div');
  const heading = createElement(
    'p',
    'tc-banner-title',
    currentDomainNotification
      ? `Terms changed on ${currentDomainNotification.domain}`
      : 'Tracked T&C changes detected'
  );
  const body = createElement(
    'p',
    'tc-banner-copy',
    currentDomainNotification
      ? formatCurrentDomainNotification(currentDomainNotification)
      : formatGenericNotificationSummary(state.pendingNotifications)
  );

  const cta = createButton('Open History', 'secondary', () => {
    showHistory(resolveNotificationTargetDomain());
  });

  appendChildren(copy, heading, body);
  appendChildren(row, copy, cta);
  banner.appendChild(row);
  return banner;
}

let loadingInterval: ReturnType<typeof setInterval> | null = null;

function createLoadingState(label: string): HTMLElement {
  const stageLabel = state.analysis?.progressLabel ?? 'Preparing analysis';
  const elapsed = state.analysisStartedAt
    ? Math.floor((Date.now() - state.analysisStartedAt) / 1000)
    : 0;
  const timerLabel = elapsed > 0 ? `${label} (${elapsed}s)` : label;
  const card = createStateCard('Running analysis', timerLabel, 'Working');
  const progressSection = createProgressSection(
    getProgressPercent(state.analysis),
    stageLabel,
    getProgressLogs(state.analysis)
  );
  const actions = card.querySelector('.tc-state-actions');
  if (actions) {
    card.insertBefore(progressSection, actions);
  } else {
    card.appendChild(progressSection);
  }
  const copy = card.querySelector('.tc-state-copy');
  if (copy && state.analysisStartedAt) {
    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const s = Math.floor((Date.now() - (state.analysisStartedAt ?? Date.now())) / 1000);
      copy.textContent = `${label} (${s}s)`;
    }, 1000);
  }
  card.querySelector('.tc-state-actions')?.appendChild(
    createButton('Open Settings', 'ghost', showSettings)
  );
  return card;
}

function createProgressSection(
  progressPercent: number,
  stageLabel: string,
  logs: PageAnalysisLogEntry[]
): HTMLElement {
  const section = createElement('section', 'tc-progress-shell');
  const meta = createElement('div', 'tc-progress-meta');
  const stage = createElement('span', 'tc-progress-stage', stageLabel);
  const percent = createElement('span', 'tc-progress-percent', `${progressPercent}%`);
  const track = createElement('div', 'tc-progress-track');
  const fill = createElement('div', 'tc-progress-fill');
  fill.style.width = `${progressPercent}%`;
  track.appendChild(fill);

  const latestLog = logs[logs.length - 1];
  const caption = createElement(
    'p',
    'tc-progress-caption',
    latestLog?.message ?? 'Starting analysis pipeline.'
  );

  appendChildren(meta, stage, percent);
  appendChildren(section, meta, track, caption);

  if (logs.length > 0) {
    section.appendChild(createLogStream(logs));
  }

  return section;
}

function createLogStream(logs: PageAnalysisLogEntry[]): HTMLElement {
  const stream = createElement('div', 'tc-log-stream');

  for (const log of [...logs].reverse()) {
    const row = createElement('div', cx('tc-log-row', `tc-log-row--${log.level}`));
    const dot = createElement('span', 'tc-log-dot');
    const copy = createElement('p', 'tc-log-copy', log.message);
    const time = createElement('span', 'tc-log-time', formatLogTime(log.timestamp));
    appendChildren(row, dot, copy, time);
    stream.appendChild(row);
  }

  return stream;
}

function createErrorState(error: string): HTMLElement {
  const actionableError = mapErrorToActionable(error);
  const card = createStateCard('Something went wrong', actionableError, 'Error');
  const actions = card.querySelector('.tc-state-actions');
  if (actions) {
    appendChildren(
      actions as HTMLElement,
      createButton('Retry', 'primary', handleAnalyze),
      createButton('Open Settings', 'secondary', showSettings)
    );
  }
  return card;
}

function mapErrorToActionable(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('network') || lower.includes('connect')) {
    return 'Check your internet connection and try again.';
  }
  if (lower.includes('rate limit')) return error; // already has timing info
  if (lower.includes('invalid') && lower.includes('response')) {
    return 'The AI returned an unexpected format. Try a different model in Settings.';
  }
  if (lower.includes('api key') || lower.includes('credentials') || lower.includes('401')) {
    return 'Provider rejected the request. Check your API key in Settings.';
  }
  return error;
}

function createActionState(
  title: string,
  body: string,
  buttonLabel: string,
  onClick: () => void
): HTMLElement {
  const card = createStateCard(title, body, 'Ready');
  const actions = card.querySelector('.tc-state-actions');
  if (actions) {
    actions.appendChild(createButton(buttonLabel, 'primary', onClick));
  }
  return card;
}

function createDualActionState(
  title: string,
  body: string,
  primaryLabel: string,
  primaryAction: () => void,
  secondaryLabel: string,
  secondaryAction: () => void
): HTMLElement {
  const card = createStateCard(title, body, 'Attention');
  const actions = card.querySelector('.tc-state-actions');
  if (actions) {
    appendChildren(
      actions as HTMLElement,
      createButton(primaryLabel, 'primary', primaryAction),
      createButton(secondaryLabel, 'secondary', secondaryAction)
    );
  }
  return card;
}

function createHostedConsentState(): HTMLElement {
  return createDualActionState(
    'Enable TC Guard Cloud',
    state.analysis?.error ??
      'TC Guard Cloud sends the extracted T&C text to an LLM for summarization. The text is not stored or shared beyond the analysis request. You can switch to a self-hosted provider at any time in Settings.',
    'Accept and Analyze',
    () => {
      void acceptHostedConsentAndAnalyze();
    },
    'Open Settings',
    showSettings
  );
}

function createStateCard(
  title: string,
  body: string,
  kicker: string
): HTMLElement {
  const card = createElement('section', 'tc-state-card');
  const kickerNode = createElement('p', 'tc-state-kicker', kicker);
  const heading = createElement('h2', 'tc-state-title', title);
  const copy = createElement('p', 'tc-state-copy', body);
  const actions = createElement('div', 'tc-state-actions');
  appendChildren(card, kickerNode, heading, copy, actions);
  return card;
}

function createSummaryView(
  summary: Summary,
  analysis: PageAnalysisRecord
): HTMLElement {
  const card = createElement('section', 'tc-card');
  const topline = createElement('div', 'tc-summary-topline');
  const severityPill = createSeverityPill(summary.severity);
  const analyzedPill = createPill(
    `Updated ${formatTimestamp(analysis.updatedAt)}`,
    'muted'
  );
  appendChildren(topline, severityPill, analyzedPill);

  const heading = createSectionHeading(
    'Latest summary',
    'A concise reading of the current agreement on this page.'
  );

  const metaRow = createMetadataRow(analysis);
  const summaryCopy = createElement('p', 'tc-summary-copy', summary.summary);

  appendChildren(card, topline, heading, metaRow, summaryCopy);

  if (summary.keyPoints.length > 0) {
    card.appendChild(createDivider());
    card.appendChild(
      createKeyPointsSection(summary.keyPoints, `Key Points (${summary.keyPoints.length})`)
    );
  }

  if (summary.redFlags.length > 0) {
    card.appendChild(createDivider());
    card.appendChild(createRedFlagsSection(summary.redFlags));
  }

  return card;
}

function createKeyPointsSection(points: string[], title: string): HTMLElement {
  const section = createElement('section');
  section.appendChild(
    createSectionHeading(title, 'Structured takeaways from the detected legal language.')
  );

  const list = createElement('div', 'tc-list');
  for (const point of points) {
    const row = createElement('div', 'tc-list-item');
    const bullet = createElement('span', 'tc-list-bullet', '+');
    const copy = createElement('p', 'tc-list-copy', point);
    appendChildren(row, bullet, copy);
    list.appendChild(row);
  }

  section.appendChild(list);
  return section;
}

function createRedFlagsSection(
  flags: Array<{ category: string; description: string; severity: string; quote: string }>
): HTMLElement {
  const section = createElement('section');
  section.appendChild(
    createSectionHeading(
      `Red Flags (${flags.length})`,
      'Expandable clauses that look riskier than the rest of the agreement.'
    )
  );

  const stack = createElement('div', 'tc-flag-stack');
  for (const flag of flags) {
    stack.appendChild(createRedFlagCard(flag));
  }
  section.appendChild(stack);
  return section;
}

function createMetadataRow(analysis: PageAnalysisRecord): HTMLElement {
  const row = createElement('div', 'tc-meta-row');
  const chips = [
    `Source: ${formatToken(analysis.sourceType)}`,
    `Detection: ${formatToken(analysis.detectionType)}`,
    `Confidence: ${formatConfidence(analysis.confidence)}`,
  ];

  for (const chipText of chips) {
    row.appendChild(createPill(chipText, 'default'));
  }

  return row;
}

function createSeverityPill(severity: string): HTMLElement {
  return createPill(
    severity.toUpperCase(),
    isSeverity(severity) ? severity : 'default'
  );
}

function createRedFlagCard(flag: {
  category: string;
  description: string;
  severity: string;
  quote: string;
}): HTMLElement {
  const card = createElement(
    'div',
    cx(
      'tc-flag-card',
      isExpandableSeverity(flag.severity) && `tc-flag-card--${flag.severity}`
    )
  );

  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-expanded', 'false');

  const header = createElement('div', 'tc-flag-header');
  const title = createElement(
    'span',
    'tc-flag-title',
    flag.category.replace(/_/g, ' ')
  );
  const severityPill = createSeverityPill(flag.severity);
  const details = createElement('div', 'tc-flag-details');
  const desc = createElement('p', 'tc-flag-description', flag.description);

  appendChildren(header, title, severityPill);
  details.appendChild(desc);

  if (flag.quote) {
    details.appendChild(createElement('blockquote', 'tc-flag-quote', flag.quote));
  }

  appendChildren(card, header, details);

  const toggle = (): void => {
    const expanded = card.getAttribute('aria-expanded') === 'true';
    card.setAttribute('aria-expanded', String(!expanded));
    details.style.maxHeight = expanded ? '0' : '320px';
  };

  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  });

  return card;
}

function createFooter(): HTMLElement {
  const footer = createElement('div', 'tc-footer-nav');
  appendChildren(
    footer,
    createButton('Keep Open', 'pill', () => {
      void handleKeepOpen();
    }),
    createButton('Settings', 'pill', showSettings),
    createButton('History', 'pill', () => {
      showHistory();
    })
  );
  return footer;
}

async function handleAnalyze(settingsOverride?: Partial<Settings>): Promise<void> {
  state.loading = true;
  state.error = null;
  state.analysisStartedAt = Date.now();
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
    state.analysisStartedAt = null;
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
    renderCurrentApp();
  }
}

async function handleKeepOpen(): Promise<void> {
  try {
    const response = await sendToBackground({
      type: 'OPEN_WORKSPACE_SURFACE',
      payload: {
        tabId: state.tabId ?? undefined,
        windowId: state.windowId ?? undefined,
      },
    });

    if (response && typeof response === 'object' && 'ok' in response && response.ok === false) {
      state.error = 'Could not open a persistent TC Guard workspace.';
      renderCurrentApp();
    }
  } catch {
    state.error = 'Could not open a persistent TC Guard workspace.';
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

  app.className = 'tc-page';
  app.textContent = '';

  const panel = createElement('section', 'tc-settings-panel');
  const body = createElement('div', 'tc-settings-body');
  const contentDiv = createElement('div');
  const tabBar = createElement('div', 'tc-tabs');

  appendChildren(
    body,
    createViewHeader('Settings', 'Tune providers, detection rules, notifications, and cache behavior.'),
    tabBar,
    contentDiv
  );
  panel.appendChild(body);
  app.appendChild(panel);

  const buttons: HTMLButtonElement[] = [];

  for (const tab of SETTINGS_TABS) {
    const button = createElement('button', 'tc-tab', tab) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', async () => {
      setActiveTab(buttons, button);

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
        case 'Domains':
          await renderDomainSettings(contentDiv);
          break;
        case 'Cache':
          await renderCacheSettings(contentDiv);
          break;
      }
    });
    buttons.push(button);
    tabBar.appendChild(button);
  }

  const firstTab = buttons[0];
  if (firstTab) {
    setActiveTab(buttons, firstTab);
  }
  void renderProviderSettings(contentDiv);
}

function showHistory(initialDomain?: string): void {
  const app = document.getElementById('app');
  if (!app) return;

  app.className = 'tc-page';
  app.textContent = '';

  const panel = createElement('section', 'tc-history-panel');
  const body = createElement('div', 'tc-history-body');
  const contentDiv = createElement('div');
  appendChildren(
    body,
    createViewHeader(
      'History',
      'Inspect saved versions and compare how a domain’s terms evolve over time.'
    ),
    contentDiv
  );
  panel.appendChild(body);
  app.appendChild(panel);
  void renderHistoryPanel(contentDiv, initialDomain ?? getCurrentDomain());
}

function createViewHeader(title: string, subtitle: string): HTMLElement {
  const wrapper = createElement('div');
  const header = createElement('div', 'tc-view-header');
  appendChildren(header, createButton('Back', 'ghost', handleBack), createElement('h2', 'tc-view-title', title));
  appendChildren(wrapper, header, createElement('p', 'tc-page-copy', subtitle));
  return wrapper;
}

function handleBack(): void {
  void refreshPopupState().then(() => {
    renderCurrentApp();
  });
}

function setActiveTab(
  buttons: HTMLButtonElement[],
  activeButton: HTMLButtonElement
): void {
  for (const button of buttons) {
    button.classList.toggle('is-active', button === activeButton);
  }
}

function createDivider(): HTMLElement {
  return createElement('div', 'tc-section-divider');
}

async function refreshPopupState(): Promise<void> {
  await prunePageAnalysisState();
  const settingsResult = await getStorage('settings');
  if (settingsResult.ok) state.settings = settingsResult.data;
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
      if (state.analysis.status === 'analyzing') {
        state.analysisStartedAt =
          state.analysisStartedAt ??
          state.analysis.progressLogs?.[0]?.timestamp ??
          state.analysis.updatedAt;
      } else if (!state.loading) {
        state.analysisStartedAt = null;
      }
      state.error = null;
      if (state.analysis.domain) {
        state.domain = state.analysis.domain;
      }
      return;
    }
  }

  state.analysis = null;
  if (!state.loading) {
    state.analysisStartedAt = null;
  }
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

async function refreshActiveTabContext(): Promise<void> {
  const tab = await getCurrentTargetTab();
  const previousTabId = state.tabId;
  const previousUrl = state.tabUrl;

  state.tabId = tab?.id ?? null;
  state.windowId = typeof tab?.windowId === 'number' ? tab.windowId : null;
  state.tabUrl = tab?.url ?? '';

  if (tab?.url) {
    try {
      state.domain = new URL(tab.url).hostname;
    } catch {
      state.domain = 'unknown';
    }
  } else {
    state.domain = 'unknown';
  }

  if (previousTabId !== state.tabId || previousUrl !== state.tabUrl) {
    state.loading = false;
    state.analysisStartedAt = null;
  }
}

function registerActiveTabSync(): void {
  chrome.tabs.onActivated?.addListener(() => {
    void refreshForCurrentTab();
  });

  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    const navigated = typeof changeInfo.url === 'string' || changeInfo.status === 'complete';
    if (!navigated) return;
    if (state.tabId !== null && tabId !== state.tabId) return;
    void refreshForCurrentTab();
  });

  chrome.windows?.onFocusChanged?.addListener(() => {
    void refreshForCurrentTab();
  });
}

async function refreshForCurrentTab(): Promise<void> {
  await refreshActiveTabContext();
  await refreshPopupState();
  renderCurrentApp();
}

async function getCurrentTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const preferred = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const preferredBrowserTab = preferred.find(isUserBrowsableTab);
  if (preferredBrowserTab) {
    return preferredBrowserTab;
  }

  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs.find(isUserBrowsableTab) ?? activeTabs[0];
}

function isUserBrowsableTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? '';
  const extensionRoot = chrome.runtime.getURL('');

  return (
    url.length > 0 &&
    !url.startsWith(extensionRoot) &&
    !url.startsWith('chrome://') &&
    !url.startsWith('edge://') &&
    !url.startsWith('about:')
  );
}

function formatConfidence(value: number | null): string {
  if (value === null) return 'n/a';
  return `${Math.round(value * 100)}%`;
}

function formatToken(value: string | null): string {
  if (!value) return 'n/a';
  return value.replace(/_/g, ' ');
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getProgressPercent(analysis: PageAnalysisRecord | null): number {
  const value = analysis?.progressPercent;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  return analysis?.status === 'analyzing' ? 15 : 0;
}

function getProgressLogs(
  analysis: PageAnalysisRecord | null
): PageAnalysisLogEntry[] {
  return analysis?.progressLogs ?? [];
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

function isSeverity(value: string): value is 'low' | 'medium' | 'high' | 'critical' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isExpandableSeverity(value: string): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
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
