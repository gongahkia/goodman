import type { Summary } from '@providers/types';
import { renderOnboarding } from '@popup/onboarding';
import { renderHistoryPanel } from '@popup/history';
import { renderCacheSettings } from '@popup/settings/cache';
import { renderDetectionSettings } from '@popup/settings/detection';
import { renderDomainSettings } from '@popup/settings/domains';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { renderProviderSettings } from '@popup/settings/providers';
import { renderCorpusSettings } from '@popup/settings/corpus';
import {
  announceStatus,
  appendChildren,
  createButton,
  createElement,
  createIcon,
  createPill,
  createSectionHeading,
  cx,
} from '@popup/ui';
import {
  iconShield,
  iconShieldCheck,
  iconAlertTriangle,
  iconSettings,
  iconRefresh,
  iconClock,
  iconZap,
  iconTerminal,
} from '@popup/icons';
import type { Settings } from '@shared/messages';
import type { WorkspaceRoute } from '@shared/messages';
import type {
  PageAnalysisLogEntry,
  PageAnalysisRecord,
} from '@shared/page-analysis';
import { RED_FLAG_DESCRIPTIONS } from '@providers/prompts';
import type { RedFlagCategory } from '@providers/types';
import type { PendingNotification } from '@shared/storage';
import {
  getPageAnalysisByUrl,
  getStorage,
  prunePageAnalysisState,
} from '@shared/storage';
import { sendToBackground } from '@shared/messaging';
import { getPendingNotifications } from '@versioning/notifications';
import {
  DEFAULT_CLAUSE_TAXONOMY_WEIGHTS,
  groupRedFlagsByClauseTaxonomy,
  type ClauseFlag,
} from '@shared/clause-taxonomy';
import { getAllTrackedDomains } from '@versioning/schema';

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

const WORKSPACE_ROUTES = ['current', 'history', 'providers', 'detection', 'monitoring', 'data', 'diagnostics'] as const satisfies readonly WorkspaceRoute[];

function getSurfaceMode(): 'popup' | 'workspace' {
  const params = new URLSearchParams(window.location.search);
  if (params.get('workspace') === '1') {
    return 'workspace';
  }

  return window.location.hash.startsWith('#panel') ? 'workspace' : 'popup';
}
const surfaceMode = getSurfaceMode();

function getInitialWorkspaceRoute(): WorkspaceRoute {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const route = query.get('route') ?? hash.get('route');
  return isWorkspaceRoute(route) ? route : 'current';
}

function getInitialWorkspaceDomain(): string | undefined {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return query.get('domain') ?? hash.get('domain') ?? undefined;
}

function isWorkspaceRoute(value: string | null): value is WorkspaceRoute {
  return typeof value === 'string' && WORKSPACE_ROUTES.some(route => route === value);
}

let workspaceRoute: WorkspaceRoute = getInitialWorkspaceRoute();
let workspaceDomain = getInitialWorkspaceDomain();

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
  try { await chrome.action?.setBadgeText?.({ text: '' }); } catch (e) { console.warn('[Goodman] failed to clear badge text:', e); }
  if (chrome.storage?.onChanged) {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('pageAnalysis' in changes || 'pendingNotifications' in changes) {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void refreshPopupState().then(() => renderCurrentApp()).catch(e => console.warn('[Goodman] popup state refresh failed:', e));
        }, 300);
      }
    });
  }
  registerActiveTabSync();
}

// ---------- render ----------

let loadingInterval: ReturnType<typeof setInterval> | null = null;
let redFlagCardId = 0;

function render(container: HTMLElement): void {
  container.className = 'tc-page';
  container.textContent = '';
  if (state.analysis?.status === 'ready' && state.analysis.summary) {
    announceStatus(`Analysis complete: ${state.analysis.summary.severity} risk with ${state.analysis.summary.redFlags.length} red flags.`);
  }
  if (!state.loading && state.analysis?.status !== 'analyzing' && loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
  if (surfaceMode === 'workspace') {
    renderWorkspace(container);
  } else {
    renderPopup(container);
  }
  container.appendChild(createAttribution());
}

// ========== POPUP MODE ==========

function renderPopup(container: HTMLElement): void {
  container.appendChild(createCompactHeader());
  const banner = createNotificationBanner();
  if (banner) container.appendChild(banner);

  if (state.loading) {
    container.appendChild(createAnalyzingCard('Analyzing this page...'));
    return;
  }
  if (state.error && !state.analysis) {
    container.appendChild(createCompactErrorState(state.error));
    container.appendChild(createActionBar());
    return;
  }
  if (!state.analysis) {
    if (isFirstRun()) {
      container.appendChild(createCompactWelcome());
    } else {
      container.appendChild(createCompactIdleState());
    }
    container.appendChild(createActionBar());
    return;
  }
  switch (state.analysis.status) {
    case 'ready':
      if (state.analysis.summary) {
        container.appendChild(createScoreCard(state.analysis.summary, state.analysis));
        container.appendChild(createActionBar());
      } else {
        container.appendChild(createCompactErrorState('Summary unavailable.'));
        container.appendChild(createActionBar());
      }
      break;
    case 'analyzing':
      container.appendChild(createAnalyzingCard('Analyzing this page...'));
      break;
    case 'needs_provider':
      container.appendChild(createCompactActionState(
        iconSettings(28),
        'Provider setup required',
        state.analysis.error ?? 'Configure a provider in Settings.',
        'Open Settings', showSettings
      ));
      break;
    case 'needs_consent':
      container.appendChild(createCompactActionState(
        iconSettings(28),
        'Provider setup required',
        state.analysis.error ?? 'Configure a provider in Settings.',
        'Open Settings', showSettings
      ));
      break;
    case 'service_unavailable':
      container.appendChild(createCompactActionState(
        iconAlertTriangle(28),
        'Provider unavailable',
        state.analysis.error ?? 'Try again shortly or switch providers.',
        'Retry', handleAnalyze, 'Settings', showSettings
      ));
      break;
    case 'extraction_failed':
      container.appendChild(createCompactActionState(
        iconAlertTriangle(28),
        'Could not extract text',
        state.analysis.error ?? 'Legal surface detected but text extraction failed.',
        'Retry', handleAnalyze
      ));
      break;
    case 'cancelled':
      container.appendChild(createCompactActionState(
        iconShield(28), 'Analysis cancelled',
        'The analysis was stopped before it could finish.',
        'Analyze Again', handleAnalyze
      ));
      container.appendChild(createActionBar());
      break;
    case 'error':
      container.appendChild(createCompactErrorState(state.analysis.error ?? 'Could not analyze.'));
      container.appendChild(createActionBar());
      break;
    default:
      container.appendChild(createCompactIdleState());
      container.appendChild(createActionBar());
      break;
  }
}

function createCompactHeader(): HTMLElement {
  const header = createElement('div', 'tc-compact-header');
  const brand = createElement('div', 'tc-header-brand');
  const logo = createElement('img', 'tc-header-logo') as HTMLImageElement;
  logo.src = chrome.runtime.getURL('icons/goodman-48.png');
  logo.alt = 'Goodman';
  const name = createElement('span', 'tc-header-name', 'Goodman');
  appendChildren(brand, logo, name);
  const domainText = getCurrentDomain();
  const isRealDomain = domainText && !domainText.startsWith('chrome') && domainText.includes('.');
  if (isRealDomain) {
    const domain = createPill(domainText, 'muted');
    domain.classList.add('tc-domain-chip');
    appendChildren(header, brand, domain);
  } else {
    header.appendChild(brand);
  }
  return header;
}

function createScoreCard(summary: Summary, analysis: PageAnalysisRecord): HTMLElement {
  const wrapper = createElement('div');
  // score hero
  const hero = createElement('div', 'tc-score-hero');
  const riskScore = Math.min(100, summary.redFlags.reduce((s, f) => s + ({ high: 30, medium: 15, low: 5 }[f.severity] ?? 0), 0));
  const riskBucket = riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'high' : riskScore >= 15 ? 'medium' : 'low';
  const scoreEl = createElement('div', cx('tc-risk-score', `tc-risk-score--${riskBucket}`), `${riskScore}`);
  hero.appendChild(scoreEl);
  const icon = createElement('div', cx('tc-score-icon', `tc-score-icon--${summary.severity}`));
  icon.innerHTML = iconShieldCheck(26);
  const label = createElement('div', cx('tc-score-label', `tc-score-label--${summary.severity}`), `${summary.severity} risk`);
  const stats = createElement('div', 'tc-stats-row');
  const flagCount = createElement('span', undefined, `${summary.redFlags.length} red flag${summary.redFlags.length !== 1 ? 's' : ''}`);
  const dot = createElement('span', 'tc-stats-dot');
  const pointCount = createElement('span', undefined, `${summary.keyPoints.length} key point${summary.keyPoints.length !== 1 ? 's' : ''}`);
  appendChildren(stats, flagCount, dot, pointCount);
  appendChildren(hero, icon, label, stats);
  wrapper.appendChild(hero);
  // summary excerpt
  const excerpt = createElement('p', 'tc-summary-excerpt', summary.summary);
  wrapper.appendChild(excerpt);
  // red flags preview — show all high-severity flags first, then fill to 5
  if (summary.redFlags.length > 0) {
    const flagSection = createElement('div', 'tc-flag-preview');
    const highFlags = summary.redFlags.filter((f) => f.severity === 'high');
    const otherFlags = summary.redFlags.filter((f) => f.severity !== 'high');
    const maxPreview = 5;
    const flagsToShow = [...highFlags, ...otherFlags].slice(0, Math.max(maxPreview, highFlags.length));
    for (const flag of flagsToShow) {
      const taxonomy = groupRedFlagsByClauseTaxonomy([flag], state.settings?.clauseTaxonomyWeights)[0];
      const row = createElement('div', cx('tc-flag-preview-row', `tc-flag-preview-row--${flag.severity}`));
      if (taxonomy) row.title = taxonomy.category.description;
      const fname = createElement('span', 'tc-flag-preview-name', taxonomy?.category.label ?? flag.category.replace(/_/g, ' '));
      const fsev = createElement('span', cx('tc-flag-preview-severity', `tc-flag-preview-severity--${flag.severity}`), flag.severity);
      appendChildren(row, fname, fsev);
      flagSection.appendChild(row);
    }
    const hidden = summary.redFlags.length - flagsToShow.length;
    if (hidden > 0) {
      flagSection.appendChild(createElement('span', 'tc-flag-preview-more', `+${hidden} more`));
    }
    flagSection.appendChild(createElement('p', 'tc-flag-disclaimer', 'Risk labels are flags, not legal advice.'));
    wrapper.appendChild(flagSection);
  }
  // metadata
  const meta = createElement('div', 'tc-meta-row');
  meta.appendChild(createPill(`${formatToken(analysis.sourceType)}`, 'default'));
  const confPill = createPill(`${formatConfidence(analysis.confidence)} detection confidence`, 'default');
  confPill.title = 'How certain Goodman is that this page contains T&C text';
  meta.appendChild(confPill);
  meta.appendChild(createPill(`Updated ${formatTimestamp(analysis.updatedAt)}`, 'muted'));
  wrapper.appendChild(meta);
  return wrapper;
}

function createCompactIdleState(): HTMLElement {
  const card = createElement('div', 'tc-state-card');
  const icon = createIcon(iconShield(32), 'tc-state-icon');
  const title = createElement('div', 'tc-state-title', 'No T&C detected');
  const copy = createElement('p', 'tc-state-copy', 'Run a manual analysis if legal text loads late or requires interaction.');
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Analyze This Page', 'primary', handleAnalyze));
  appendChildren(card, icon, title, copy, actions);
  return card;
}

function createCompactWelcome(): HTMLElement {
  const card = createElement('div', 'tc-state-card');
  const icon = createIcon(iconShield(32), 'tc-state-icon');
  const title = createElement('div', 'tc-state-title', 'Welcome to Goodman');
  const copy = createElement('p', 'tc-state-copy', 'Configure your provider to detect, summarize, and track T&C changes.');
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Open Providers', 'primary', showSettings));
  actions.appendChild(createButton('Analyze This Page', 'secondary', handleAnalyze));
  appendChildren(card, icon, title, copy, actions);
  return card;
}

function createCompactErrorState(error: string): HTMLElement {
  const card = createElement('div', 'tc-state-card');
  const icon = createIcon(iconAlertTriangle(32), 'tc-state-icon');
  const title = createElement('div', 'tc-state-title', 'Something went wrong');
  const copy = createElement('p', 'tc-state-copy', mapErrorToActionable(error));
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Retry', 'primary', handleAnalyze));
  actions.appendChild(createButton('Providers', 'secondary', showSettings));
  appendChildren(card, icon, title, copy, actions);
  return card;
}

function createCompactActionState(
  iconSvg: string, titleText: string, bodyText: string,
  primaryLabel: string, primaryAction: () => void,
  secondaryLabel?: string, secondaryAction?: () => void
): HTMLElement {
  const card = createElement('div', 'tc-state-card');
  const icon = createIcon(iconSvg, 'tc-state-icon');
  const title = createElement('div', 'tc-state-title', titleText);
  const copy = createElement('p', 'tc-state-copy', bodyText);
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton(primaryLabel, 'primary', primaryAction));
  if (secondaryLabel && secondaryAction) {
    actions.appendChild(createButton(secondaryLabel, 'secondary', secondaryAction));
  }
  appendChildren(card, icon, title, copy, actions);
  return card;
}

function createAnalyzingCard(label: string): HTMLElement {
  const card = createElement('div', 'tc-analyzing-card');
  const icon = createIcon(iconZap(36), 'tc-analyzing-icon');
  const stageLabel = state.analysis?.progressLabel ?? 'Preparing analysis';
  const elapsed = state.analysisStartedAt ? Math.floor((Date.now() - state.analysisStartedAt) / 1000) : 0;
  const title = createElement('div', 'tc-state-title', elapsed > 0 ? `${label} (${elapsed}s)` : label);
  const progressWrap = createElement('div', 'tc-progress-compact');
  const track = createElement('div', 'tc-progress-track');
  const fill = createElement('div', 'tc-progress-fill');
  const pct = getProgressPercent(state.analysis);
  configureProgressTrack(track, pct, 'Analysis progress');
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  const pctLabel = createElement('span', 'tc-progress-percent', `${pct}%`);
  const stageLine = createElement('div', 'tc-progress-label', stageLabel);
  appendChildren(progressWrap, track, pctLabel, stageLine);
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Cancel Analysis', 'ghost', () => { void handleCancelAnalysis().catch(e => console.warn('[Goodman] cancel analysis failed:', e)); }));
  appendChildren(card, icon, title, progressWrap);
  const logs = getProgressLogs(state.analysis);
  if (logs.length > 0) card.appendChild(createLogStream(logs));
  card.appendChild(actions);
  if (state.analysisStartedAt) {
    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const s = Math.floor((Date.now() - (state.analysisStartedAt ?? Date.now())) / 1000);
      title.textContent = `${label} (${s}s)`;
    }, 1000);
  }
  return card;
}

function createActionBar(): HTMLElement {
  const bar = createElement('div', 'tc-action-bar');
  const detailBtn = createButton('Open Workspace', 'primary', () => { void handleKeepOpen('current').catch(e => console.warn('[Goodman] keep open failed:', e)); });
  const refreshBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  refreshBtn.type = 'button';
  refreshBtn.setAttribute('aria-label', 'Re-analyze page');
  refreshBtn.appendChild(createIcon(iconRefresh(16)));
  refreshBtn.addEventListener('click', () => handleAnalyze());
  const settingsBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  settingsBtn.type = 'button';
  settingsBtn.setAttribute('aria-label', 'Open provider settings');
  settingsBtn.appendChild(createIcon(iconSettings(16)));
  settingsBtn.addEventListener('click', showSettings);
  const historyBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  historyBtn.type = 'button';
  historyBtn.setAttribute('aria-label', 'Open history workspace');
  historyBtn.appendChild(createIcon(iconClock(16)));
  historyBtn.addEventListener('click', () => showHistory());
  const logsBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  logsBtn.type = 'button';
  logsBtn.setAttribute('aria-label', 'Open diagnostics workspace');
  logsBtn.appendChild(createIcon(iconTerminal(16)));
  logsBtn.addEventListener('click', showLogs);
  appendChildren(bar, detailBtn, refreshBtn, settingsBtn, historyBtn, logsBtn);
  return bar;
}

function createNotificationBanner(): HTMLElement | null {
  if (state.pendingNotifications.length === 0) return null;
  const currentDomain = getCurrentDomain();
  const current = state.pendingNotifications.find(n => n.domain === currentDomain);
  const banner = createElement('div', 'tc-banner');
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  const text = createElement('span', 'tc-banner-text',
    current
      ? `Terms changed on ${current.domain}`
      : `${state.pendingNotifications.length} domain${state.pendingNotifications.length > 1 ? 's' : ''} with T&C changes`
  );
  const btn = createButton('History', 'ghost', () => showHistory(resolveNotificationTargetDomain()));
  appendChildren(banner, text, btn);
  return banner;
}

// ========== PERSISTENT WORKSPACE ==========

const WORKSPACE_NAVIGATION: Array<{ route: WorkspaceRoute; label: string; icon: (size?: number) => string }> = [
  { route: 'current', label: 'Current page', icon: iconShield },
  { route: 'history', label: 'History', icon: iconClock },
  { route: 'providers', label: 'Providers', icon: iconSettings },
  { route: 'detection', label: 'Detection', icon: iconShieldCheck },
  { route: 'monitoring', label: 'Monitoring', icon: iconRefresh },
  { route: 'data', label: 'Data & privacy', icon: iconZap },
  { route: 'diagnostics', label: 'Diagnostics', icon: iconTerminal },
];

const WORKSPACE_COPY: Record<WorkspaceRoute, { title: string; subtitle: string }> = {
  current: { title: 'Current page', subtitle: 'Analyze the legal terms on the page you are viewing.' },
  history: { title: 'History', subtitle: 'Inspect saved versions and compare terms over time.' },
  providers: { title: 'Providers', subtitle: 'Choose where Goodman sends legal text for analysis.' },
  detection: { title: 'Detection', subtitle: 'Control how Goodman identifies terms and weights risk.' },
  monitoring: { title: 'Monitoring', subtitle: 'Manage alerts, tracked domains, and domain-specific preferences.' },
  data: { title: 'Data & privacy', subtitle: 'Review local data and corpus contribution preferences.' },
  diagnostics: { title: 'Diagnostics', subtitle: 'Review recent analysis pipeline activity.' },
};

function renderWorkspace(container: HTMLElement): void {
  container.className = 'tc-workspace';
  container.textContent = '';
  const shell = createElement('div', 'tc-workspace-shell');
  const sidebar = createWorkspaceSidebar();
  const main = createElement('main', 'tc-workspace-main');
  const header = createWorkspaceHeader();
  const content = createElement('div', 'tc-workspace-content');
  content.id = 'tc-workspace-content';
  appendChildren(main, header, content);
  appendChildren(shell, sidebar, main);
  container.appendChild(shell);
  void renderWorkspaceRoute(content).catch(e => {
    console.warn('[Goodman] workspace route render failed:', e);
    content.textContent = '';
    content.appendChild(createPanelErrorState('Could not load this workspace view.'));
  });
}

function createWorkspaceSidebar(): HTMLElement {
  const sidebar = createElement('aside', 'tc-workspace-sidebar');
  const brand = createElement('div', 'tc-workspace-brand');
  const logo = createElement('img', 'tc-workspace-logo') as HTMLImageElement;
  logo.src = chrome.runtime.getURL('icons/goodman-48.png');
  logo.alt = '';
  appendChildren(brand, logo, createElement('span', 'tc-workspace-name', 'Goodman'));

  const nav = createElement('nav', 'tc-workspace-nav');
  nav.setAttribute('aria-label', 'Goodman workspace');
  for (const item of WORKSPACE_NAVIGATION) {
    if (item.route === 'providers') {
      nav.appendChild(createElement('p', 'tc-workspace-nav-label', 'Configure'));
    }
    if (item.route === 'diagnostics') {
      nav.appendChild(createElement('p', 'tc-workspace-nav-label', 'Support'));
    }
    nav.appendChild(createWorkspaceNavButton(item));
  }

  const domains = createElement('section', 'tc-workspace-domains');
  domains.appendChild(createElement('p', 'tc-workspace-nav-label', 'Recent domains'));
  const domainList = createElement('div', 'tc-workspace-domain-list');
  domainList.setAttribute('aria-label', 'Recent tracked domains');
  domainList.appendChild(createElement('p', 'tc-workspace-domain-empty', 'Loading domains…'));
  domains.appendChild(domainList);
  void renderWorkspaceDomains(domainList);

  appendChildren(sidebar, brand, nav, domains, createAttribution());
  return sidebar;
}

function createWorkspaceNavButton(item: { route: WorkspaceRoute; label: string; icon: (size?: number) => string }): HTMLButtonElement {
  const button = createElement('button', 'tc-workspace-nav-button') as HTMLButtonElement;
  button.type = 'button';
  button.classList.toggle('is-active', workspaceRoute === item.route);
  if (workspaceRoute === item.route) button.setAttribute('aria-current', 'page');
  button.appendChild(createIcon(item.icon(16), 'tc-workspace-nav-icon'));
  button.appendChild(createElement('span', undefined, item.label));
  button.addEventListener('click', () => navigateWorkspace(item.route));
  return button;
}

async function renderWorkspaceDomains(container: HTMLElement): Promise<void> {
  const domains = await getAllTrackedDomains();
  container.textContent = '';
  if (domains.length === 0) {
    container.appendChild(createElement('p', 'tc-workspace-domain-empty', 'No tracked domains yet.'));
    return;
  }
  for (const domain of domains.slice(0, 8)) {
    const button = createElement('button', 'tc-workspace-domain-button', domain) as HTMLButtonElement;
    button.type = 'button';
    button.title = domain;
    button.classList.toggle('is-active', workspaceRoute === 'history' && workspaceDomain === domain);
    button.addEventListener('click', () => navigateWorkspace('history', domain));
    container.appendChild(button);
  }
}

function createWorkspaceHeader(): HTMLElement {
  const copy = WORKSPACE_COPY[workspaceRoute];
  const header = createElement('header', 'tc-workspace-header');
  const titleGroup = createElement('div');
  appendChildren(
    titleGroup,
    createElement('h1', 'tc-workspace-title', copy.title),
    createElement('p', 'tc-workspace-subtitle', copy.subtitle)
  );
  const actions = createElement('div', 'tc-workspace-header-actions');
  if (workspaceRoute === 'current') {
    actions.appendChild(createButton(state.analysis ? 'Re-analyze' : 'Analyze page', 'primary', handleAnalyze));
  }
  appendChildren(header, titleGroup, actions);
  return header;
}

async function renderWorkspaceRoute(container: HTMLElement): Promise<void> {
  container.textContent = '';
  if (workspaceRoute === 'current') {
    const banner = createNotificationBanner();
    if (banner) container.appendChild(banner);
    renderCurrentPageWorkspace(container);
    return;
  }

  switch (workspaceRoute) {
    case 'history':
      await renderHistoryPanel(container, workspaceDomain ?? getCurrentDomain());
      break;
    case 'providers':
      await renderProviderSettings(container);
      break;
    case 'detection':
      await renderDetectionSettings(container);
      break;
    case 'monitoring':
      await renderMonitoringWorkspace(container);
      break;
    case 'data':
      await renderDataWorkspace(container);
      break;
    case 'diagnostics':
      await renderDiagnosticsWorkspace(container);
      break;
  }
}

async function renderMonitoringWorkspace(container: HTMLElement): Promise<void> {
  const notifications = createElement('section', 'tc-workspace-section');
  const domains = createElement('section', 'tc-workspace-section');
  await renderNotificationSettings(notifications);
  await renderDomainSettings(domains);
  appendChildren(container, notifications, domains);
}

async function renderDataWorkspace(container: HTMLElement): Promise<void> {
  const cache = createElement('section', 'tc-workspace-section');
  const corpus = createElement('section', 'tc-workspace-section');
  await renderCacheSettings(cache);
  await renderCorpusSettings(corpus);
  appendChildren(container, cache, corpus);
}

function navigateWorkspace(route: WorkspaceRoute, domain?: string): void {
  workspaceRoute = route;
  workspaceDomain = domain;
  renderCurrentApp();
}

// ========== WORKSPACE CURRENT-PAGE VIEW ==========

function renderCurrentPageWorkspace(container: HTMLElement): void {

  if (state.loading) {
    container.appendChild(createPanelLoadingState('Analyzing this page...'));
    return;
  }
  if (state.error && !state.analysis) {
    container.appendChild(createPanelErrorState(state.error));
    return;
  }
  if (!state.analysis) {
    if (isFirstRun()) {
      container.appendChild(createCompactWelcome());
    } else {
      container.appendChild(createCompactIdleState());
    }
    return;
  }
  switch (state.analysis.status) {
    case 'ready':
      if (state.analysis.summary) {
        container.appendChild(createPanelSummaryView(state.analysis.summary, state.analysis));
      } else {
        container.appendChild(createPanelErrorState('Summary unavailable.'));
      }
      break;
    case 'analyzing':
      container.appendChild(createPanelLoadingState('Analyzing this page...'));
      break;
    case 'needs_provider':
      container.appendChild(createCompactActionState(iconSettings(28), 'Provider setup required',
        state.analysis.error ?? 'Configure a provider in Settings.', 'Open Settings', showSettings));
      break;
    case 'needs_consent':
      container.appendChild(createCompactActionState(iconSettings(28), 'Provider setup required',
        state.analysis.error ?? 'Configure a provider in Settings.', 'Open Settings', showSettings));
      break;
    case 'service_unavailable':
      container.appendChild(createCompactActionState(iconAlertTriangle(28), 'Provider unavailable',
        state.analysis.error ?? 'Try again shortly.', 'Retry', handleAnalyze, 'Settings', showSettings));
      break;
    case 'extraction_failed':
      container.appendChild(createCompactActionState(iconAlertTriangle(28), 'Could not extract text',
        state.analysis.error ?? 'Text extraction failed.', 'Retry', handleAnalyze));
      break;
    case 'cancelled':
      container.appendChild(createCompactActionState(iconShield(28), 'Analysis cancelled',
        'The analysis was stopped before it could finish.', 'Analyze Again', handleAnalyze));
      break;
    case 'error':
      container.appendChild(createPanelErrorState(state.analysis.error ?? 'Could not analyze.'));
      break;
    default:
      container.appendChild(createCompactIdleState());
      break;
  }
}

function createPanelSummaryView(summary: Summary, analysis: PageAnalysisRecord): HTMLElement {
  const card = createElement('section', 'tc-card');
  const topline = createElement('div', 'tc-summary-topline');
  topline.appendChild(createSeverityPill(summary.severity));
  topline.appendChild(createPill(`Updated ${formatTimestamp(analysis.updatedAt)}`, 'muted'));
  const heading = createSectionHeading('Summary', 'AI-generated summary of detected terms.');
  const metaRow = createMetadataRow(analysis);
  const summaryCopy = createElement('p', 'tc-summary-copy', summary.summary);
  appendChildren(card, topline, heading, metaRow, summaryCopy);
  if (summary.keyPoints.length > 0) {
    card.appendChild(createDivider());
    card.appendChild(createKeyPointsSection(summary.keyPoints, `Key Points (${summary.keyPoints.length})`));
  }
  if (summary.redFlags.length > 0) {
    card.appendChild(createDivider());
    card.appendChild(createRedFlagsSection(summary.redFlags, state.settings?.clauseTaxonomyWeights));
  }
  return card;
}

function createPanelLoadingState(label: string): HTMLElement {
  const stageLabel = state.analysis?.progressLabel ?? 'Preparing analysis';
  const elapsed = state.analysisStartedAt ? Math.floor((Date.now() - state.analysisStartedAt) / 1000) : 0;
  const timerLabel = elapsed > 0 ? `${label} (${elapsed}s)` : label;
  const card = createElement('div', cx('tc-state-card', 'tc-state-card--left'));
  const title = createElement('div', 'tc-state-title', timerLabel);
  card.appendChild(title);
  const progressSection = createProgressSection(getProgressPercent(state.analysis), stageLabel, getProgressLogs(state.analysis));
  card.appendChild(progressSection);
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Open Settings', 'ghost', showSettings));
  card.appendChild(actions);
  if (state.analysisStartedAt) {
    if (loadingInterval) clearInterval(loadingInterval);
    loadingInterval = setInterval(() => {
      const s = Math.floor((Date.now() - (state.analysisStartedAt ?? Date.now())) / 1000);
      title.textContent = `${label} (${s}s)`;
    }, 1000);
  }
  return card;
}

function createPanelErrorState(error: string): HTMLElement {
  const card = createElement('div', cx('tc-state-card', 'tc-state-card--left'));
  const title = createElement('div', 'tc-state-title', 'Something went wrong');
  const copy = createElement('p', 'tc-state-copy', mapErrorToActionable(error));
  const actions = createElement('div', 'tc-state-actions');
  appendChildren(actions, createButton('Retry', 'primary', handleAnalyze), createButton('Settings', 'secondary', showSettings));
  appendChildren(card, title, copy, actions);
  return card;
}

// ========== SHARED COMPONENTS ==========

function createProgressSection(progressPercent: number, stageLabel: string, logs: PageAnalysisLogEntry[]): HTMLElement {
  const section = createElement('section', 'tc-progress-shell');
  const meta = createElement('div', 'tc-progress-meta');
  const stage = createElement('span', 'tc-progress-stage', stageLabel);
  const percent = createElement('span', 'tc-progress-percent', `${progressPercent}%`);
  const track = createElement('div', 'tc-progress-track');
  const fill = createElement('div', 'tc-progress-fill');
  configureProgressTrack(track, progressPercent, 'Analysis progress');
  fill.style.width = `${progressPercent}%`;
  track.appendChild(fill);
  const latestLog = logs[logs.length - 1];
  const caption = createElement('p', 'tc-progress-caption', latestLog?.message ?? 'Starting analysis pipeline.');
  appendChildren(meta, stage, percent);
  appendChildren(section, meta, track, caption);
  if (logs.length > 0) section.appendChild(createLogStream(logs));
  return section;
}

function createLogStream(logs: PageAnalysisLogEntry[]): HTMLElement {
  const stream = createElement('div', 'tc-log-stream');
  stream.setAttribute('role', 'log');
  stream.setAttribute('aria-live', 'polite');
  stream.setAttribute('aria-relevant', 'additions text');
  stream.setAttribute('aria-label', 'Analysis progress log');
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

function createKeyPointsSection(points: string[], title: string): HTMLElement {
  const section = createElement('section');
  section.appendChild(createSectionHeading(title, 'Structured takeaways from the detected legal language.'));
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
  flags: ClauseFlag[],
  weights = DEFAULT_CLAUSE_TAXONOMY_WEIGHTS
): HTMLElement {
  const section = createElement('section');
  section.appendChild(createSectionHeading(`Red Flags (${flags.length})`, 'Risk labels are flags, not legal advice.'));
  const stack = createElement('div', 'tc-flag-stack');
  const groups = groupRedFlagsByClauseTaxonomy(flags, weights);
  const groupedFlags = new Set<ClauseFlag>();
  for (const group of groups) {
    const groupEl = createElement('div', 'tc-taxonomy-group');
    groupEl.style.setProperty('--tc-taxonomy-color', group.category.color);
    groupEl.title = group.category.description;
    const header = createElement('div', 'tc-taxonomy-header');
    appendChildren(
      header,
      createElement('span', 'tc-taxonomy-swatch'),
      createElement('span', 'tc-taxonomy-title', group.category.label),
      createPill(`weight ${weights[group.category.id]}`, 'muted')
    );
    groupEl.appendChild(header);
    for (const flag of group.flags) {
      groupedFlags.add(flag);
      groupEl.appendChild(createRedFlagCard(flag));
    }
    stack.appendChild(groupEl);
  }
  for (const flag of flags) {
    if (!groupedFlags.has(flag)) stack.appendChild(createRedFlagCard(flag));
  }
  section.appendChild(stack);
  return section;
}

function createRedFlagCard(flag: { category: string; description: string; severity: string; quote: string }): HTMLElement {
  const card = createElement('div', cx('tc-flag-card', isExpandableSeverity(flag.severity) && `tc-flag-card--${flag.severity}`));
  const categoryLabel = flag.category.replace(/_/g, ' ');
  const detailsId = `tc-flag-details-${redFlagCardId += 1}`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-expanded', 'false');
  card.setAttribute('aria-controls', detailsId);
  card.setAttribute('aria-label', `Expand details for ${categoryLabel} (${flag.severity} risk)`);
  const header = createElement('div', 'tc-flag-header');
  const titleWrap = createElement('div');
  const title = createElement('span', 'tc-flag-title', categoryLabel);
  const staticDesc = RED_FLAG_DESCRIPTIONS[flag.category as RedFlagCategory];
  titleWrap.appendChild(title);
  if (staticDesc) titleWrap.appendChild(createElement('p', 'tc-flag-subtitle', staticDesc));
  const severityPill = createSeverityPill(flag.severity);
  const details = createElement('div', 'tc-flag-details');
  details.id = detailsId;
  details.setAttribute('aria-hidden', 'true');
  const desc = createElement('p', 'tc-flag-description', flag.description);
  appendChildren(header, titleWrap, severityPill);
  details.appendChild(desc);
  if (flag.quote) details.appendChild(createElement('blockquote', 'tc-flag-quote', flag.quote));
  appendChildren(card, header, details);
  const setExpanded = (expanded: boolean): void => {
    card.setAttribute('aria-expanded', String(expanded));
    card.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} details for ${categoryLabel} (${flag.severity} risk)`);
    details.setAttribute('aria-hidden', String(!expanded));
    details.style.maxHeight = expanded ? '320px' : '0';
  };
  const toggle = (): void => setExpanded(card.getAttribute('aria-expanded') !== 'true');
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  return card;
}

function configureProgressTrack(track: HTMLElement, value: number, label: string): void {
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(value));
}

function createMetadataRow(analysis: PageAnalysisRecord): HTMLElement {
  const row = createElement('div', 'tc-meta-row');
  row.appendChild(createPill(`Source: ${formatToken(analysis.sourceType)}`, 'default'));
  row.appendChild(createPill(`Detection: ${formatToken(analysis.detectionType)}`, 'default'));
  row.appendChild(createPill(`Confidence: ${formatConfidence(analysis.confidence)}`, 'default'));
  return row;
}

function createSeverityPill(severity: string): HTMLElement {
  return createPill(severity.toUpperCase(), isSeverity(severity) ? severity : 'default');
}

function createDivider(): HTMLElement {
  return createElement('div', 'tc-section-divider');
}

// ========== ACTIONS ==========

async function handleAnalyze(settingsOverride?: Partial<Settings>): Promise<void> {
  state.loading = true;
  state.error = null;
  state.analysisStartedAt = Date.now();
  announceStatus('Analyzing page...');
  renderCurrentApp();
  try {
    if (state.tabId === null) throw new Error('No active tab');
    const payload = settingsOverride ? { tabId: state.tabId, settingsOverride } : { tabId: state.tabId };
    const response = (await chrome.tabs.sendMessage(state.tabId, { type: 'DETECT_TC', payload })) as { ok?: boolean; error?: string } | undefined;
    await refreshPopupState();
    if (response && response.ok === false && !state.analysis) {
      state.error = response.error ?? 'Could not analyze this page.';
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Goodman] handleAnalyze failed:', msg, e);
    state.error = `Could not analyze this page: ${msg}`;
    announceStatus('Analysis failed.');
  } finally {
    state.loading = false;
    state.analysisStartedAt = null;
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
    renderCurrentApp();
  }
}

async function handleCancelAnalysis(): Promise<void> {
  if (state.tabId === null) return;
  try {
    await chrome.tabs.sendMessage(state.tabId, { type: 'CANCEL_TC', payload: { tabId: state.tabId } });
    await sendToBackground({ type: 'CANCEL_PAGE_ANALYSIS', payload: { tabId: state.tabId } });
  } catch (e) { console.warn('[Goodman] cancel analysis messaging failed:', e); }
  state.loading = false;
  state.analysisStartedAt = null;
  if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
  await refreshPopupState();
  renderCurrentApp();
}

async function handleKeepOpen(route: WorkspaceRoute = 'current', domain?: string): Promise<void> {
  try {
    const response = await sendToBackground({
      type: 'OPEN_WORKSPACE_SURFACE',
      payload: {
        tabId: state.tabId ?? undefined,
        windowId: state.windowId ?? undefined,
        route,
        domain,
      },
    });
    if (response && typeof response === 'object' && 'ok' in response && response.ok === false) {
      state.error = 'Could not open a persistent Goodman workspace.';
      renderCurrentApp();
    }
  } catch (e) {
    console.warn('[Goodman] handleKeepOpen failed:', e);
    state.error = 'Could not open a persistent Goodman workspace.';
    renderCurrentApp();
  }
}

// ========== WORKSPACE ROUTING ==========

function showSettings(): void {
  void showWorkspaceRoute('providers');
}

function showHistory(initialDomain?: string): void {
  void showWorkspaceRoute('history', initialDomain);
}

function showLogs(): void {
  void showWorkspaceRoute('diagnostics');
}

async function showWorkspaceRoute(route: WorkspaceRoute, domain?: string): Promise<void> {
  if (surfaceMode === 'workspace') {
    navigateWorkspace(route, domain);
    return;
  }
  await handleKeepOpen(route, domain);
}

async function renderDiagnosticsWorkspace(container: HTMLElement): Promise<void> {
  const analysisResult = await getStorage('pageAnalysis');
  if (!analysisResult.ok) {
    container.appendChild(createElement('p', 'tc-empty-note', 'Could not load logs.'));
    return;
  }
  const records = Object.values(analysisResult.data) as PageAnalysisRecord[];
  const withLogs = records
    .filter((r) => r.progressLogs && r.progressLogs.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  if (withLogs.length === 0) {
    container.appendChild(createElement('p', 'tc-empty-note', 'No analysis logs yet.'));
    return;
  }
  for (const record of withLogs) {
    const run = createElement('div', 'tc-callout');
    const urlLabel = createElement('div', 'tc-callout-title', record.domain || record.url);
    const meta = createElement('p', 'tc-callout-copy',
      `${record.status} \u00b7 ${formatTimestamp(record.updatedAt)} \u00b7 ${record.progressLogs?.length ?? 0} steps`);
    appendChildren(run, urlLabel, meta);
    if (record.error) {
      const errEl = createElement('p', 'tc-callout-copy');
      errEl.style.color = 'var(--tc-severity-critical)';
      errEl.textContent = record.error;
      run.appendChild(errEl);
    }
    if (record.progressLogs && record.progressLogs.length > 0) {
      run.appendChild(createLogStream(record.progressLogs));
    }
    container.appendChild(run);
  }
}

// ========== STATE ==========

async function refreshPopupState(): Promise<void> {
  await prunePageAnalysisState();
  const settingsResult = await getStorage('settings');
  if (settingsResult.ok) state.settings = settingsResult.data;
  await refreshPageAnalysis();
  await refreshNotifications();
}

async function refreshPageAnalysis(): Promise<void> {
  if (!state.tabUrl && state.tabId === null) { state.analysis = null; return; }
  if (state.tabUrl) {
    const analysisByUrl = await getPageAnalysisByUrl(state.tabUrl);
    if (analysisByUrl) {
      state.analysis = { ...analysisByUrl, tabId: state.tabId ?? analysisByUrl.tabId };
      if (state.analysis.status === 'analyzing') {
        state.analysisStartedAt = state.analysisStartedAt ?? state.analysis.progressLogs?.[0]?.timestamp ?? state.analysis.updatedAt;
      } else if (!state.loading) {
        state.analysisStartedAt = null;
      }
      state.error = null;
      if (state.analysis.domain) state.domain = state.analysis.domain;
      return;
    }
  }
  state.analysis = null;
  if (!state.loading) state.analysisStartedAt = null;
  state.error = null;
}

async function refreshNotifications(): Promise<void> {
  state.pendingNotifications = await getPendingNotifications();
}

function renderCurrentApp(): void {
  const app = document.getElementById('app');
  if (app) render(app);
}

async function refreshActiveTabContext(): Promise<void> {
  const tab = await getCurrentTargetTab();
  const previousTabId = state.tabId;
  const previousUrl = state.tabUrl;
  state.tabId = tab?.id ?? null;
  state.windowId = typeof tab?.windowId === 'number' ? tab.windowId : null;
  state.tabUrl = tab?.url ?? '';
  if (tab?.url) {
    try { state.domain = new URL(tab.url).hostname; } catch (e) { console.warn('[Goodman] failed to parse tab URL:', tab.url, e); state.domain = 'unknown'; }
  } else {
    state.domain = 'unknown';
  }
  if (previousTabId !== state.tabId || previousUrl !== state.tabUrl) {
    state.loading = false;
    state.analysisStartedAt = null;
  }
}

function registerActiveTabSync(): void {
  chrome.tabs.onActivated?.addListener(() => { void refreshForCurrentTab().catch(e => console.warn('[Goodman] tab activation refresh failed:', e)); });
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    const navigated = typeof changeInfo.url === 'string' || changeInfo.status === 'complete';
    if (!navigated) return;
    if (state.tabId !== null && tabId !== state.tabId) return;
    void refreshForCurrentTab().catch(e => console.warn('[Goodman] tab update refresh failed:', e));
  });
  chrome.windows?.onFocusChanged?.addListener(() => { void refreshForCurrentTab().catch(e => console.warn('[Goodman] window focus refresh failed:', e)); });
}

async function refreshForCurrentTab(): Promise<void> {
  await refreshActiveTabContext();
  await refreshPopupState();
  renderCurrentApp();
}

async function getCurrentTargetTab(): Promise<chrome.tabs.Tab | undefined> {
  const preferred = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const preferredBrowserTab = preferred.find(isUserBrowsableTab);
  if (preferredBrowserTab) return preferredBrowserTab;
  const activeTabs = await chrome.tabs.query({ active: true });
  return activeTabs.find(isUserBrowsableTab) ?? activeTabs[0];
}

function isUserBrowsableTab(tab: chrome.tabs.Tab): boolean {
  const url = tab.url ?? '';
  const extensionRoot = chrome.runtime.getURL('');
  return url.length > 0 && !url.startsWith(extensionRoot) && !url.startsWith('chrome://') && !url.startsWith('edge://') && !url.startsWith('about:');
}

// ========== HELPERS ==========

function mapErrorToActionable(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('network') || lower.includes('connect')) return 'Check your internet connection and try again.';
  if (lower.includes('rate limit')) return error;
  if (lower.includes('invalid') && lower.includes('response')) return 'Unexpected format from AI. Try a different model in Settings.';
  if (lower.includes('api key') || lower.includes('credentials') || lower.includes('401')) return 'Provider rejected the request. Check your API key in Settings.';
  return error;
}

function isFirstRun(): boolean {
  const settings = state.settings;
  if (!settings) return false;
  const config = settings.providers[settings.activeProvider];
  if (!config) return true;
  if (settings.activeProvider === 'ollama') return !(config.baseUrl ?? '').trim();
  if (settings.activeProvider === 'custom') return !(config.baseUrl ?? '').trim();
  return !config.apiKey.trim();
}

function getCurrentDomain(): string {
  return state.analysis?.domain ?? state.domain;
}

function resolveNotificationTargetDomain(): string {
  const cd = getCurrentDomain();
  const match = state.pendingNotifications.find(n => n.domain === cd);
  return match?.domain ?? state.pendingNotifications[0]?.domain ?? cd;
}

function createAttribution(): HTMLElement {
  const footer = createElement('div', 'tc-attribution');
  const link = createElement('a') as HTMLAnchorElement;
  link.href = 'https://gabrielongzm.com';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'Gabriel Ong';
  footer.append('Made with \u2764\uFE0F by ', link, '.');
  return footer;
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
  return new Date(timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatLogTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function getProgressPercent(analysis: PageAnalysisRecord | null): number {
  const value = analysis?.progressPercent;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  return analysis?.status === 'analyzing' ? 15 : 0;
}

function getProgressLogs(analysis: PageAnalysisRecord | null): PageAnalysisLogEntry[] {
  return analysis?.progressLogs ?? [];
}

function isSeverity(value: string): value is 'low' | 'medium' | 'high' | 'critical' {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isExpandableSeverity(value: string): value is 'low' | 'medium' | 'high' {
  return value === 'low' || value === 'medium' || value === 'high';
}

// ========== BOOTSTRAP ==========

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
