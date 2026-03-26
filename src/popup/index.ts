import type { Summary } from '@providers/types';
import { renderOnboarding } from '@popup/onboarding';
import { renderHistoryPanel } from '@popup/history';
import { renderCacheSettings } from '@popup/settings/cache';
import { renderDetectionSettings } from '@popup/settings/detection';
import { renderDomainSettings } from '@popup/settings/domains';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { renderProviderSettings } from '@popup/settings/providers';
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
  iconChevronLeft,
} from '@popup/icons';
import type { Settings } from '@shared/messages';
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

function getSurfaceMode(): 'popup' | 'panel' {
  const params = new URLSearchParams(window.location.search);
  if (params.get('surface') === 'panel') {
    return 'panel';
  }

  return window.location.hash === '#panel' ? 'panel' : 'popup';
}
const surfaceMode = getSurfaceMode();

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
  if (surfaceMode === 'panel') {
    renderPanel(container);
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
        iconShield(28),
        'Enable Goodman Cloud',
        'Send T&C text to an LLM for analysis. Not stored or shared.',
        'Accept & Analyze', () => { void acceptHostedConsentAndAnalyze().catch(e => console.warn('[Goodman] hosted consent flow failed:', e)); },
        'Settings', showSettings
      ));
      break;
    case 'service_unavailable':
      container.appendChild(createCompactActionState(
        iconAlertTriangle(28),
        'Cloud unavailable',
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
  // red flags preview (top 3)
  if (summary.redFlags.length > 0) {
    const flagSection = createElement('div', 'tc-flag-preview');
    const flagsToShow = summary.redFlags.slice(0, 3);
    for (const flag of flagsToShow) {
      const row = createElement('div', cx('tc-flag-preview-row', `tc-flag-preview-row--${flag.severity}`));
      const fname = createElement('span', 'tc-flag-preview-name', flag.category.replace(/_/g, ' '));
      const fsev = createElement('span', cx('tc-flag-preview-severity', `tc-flag-preview-severity--${flag.severity}`), flag.severity);
      appendChildren(row, fname, fsev);
      flagSection.appendChild(row);
    }
    if (summary.redFlags.length > 3) {
      flagSection.appendChild(createElement('span', 'tc-flag-preview-more', `+${summary.redFlags.length - 3} more`));
    }
    wrapper.appendChild(flagSection);
  }
  // metadata
  const meta = createElement('div', 'tc-meta-row');
  meta.appendChild(createPill(`${formatToken(analysis.sourceType)}`, 'default'));
  meta.appendChild(createPill(`${formatConfidence(analysis.confidence)} conf`, 'default'));
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
  const copy = createElement('p', 'tc-state-copy', 'Detect, summarize, and track T&C changes with AI.');
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Get Started', 'primary', () => { void acceptHostedConsentAndAnalyze().catch(e => console.warn('[Goodman] hosted consent flow failed:', e)); }));
  actions.appendChild(createButton('Use Own Provider', 'secondary', showSettings));
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
  actions.appendChild(createButton('Settings', 'secondary', showSettings));
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
  fill.style.width = `${pct}%`;
  track.appendChild(fill);
  const pctLabel = createElement('span', 'tc-progress-percent', `${pct}%`);
  const stageLine = createElement('div', 'tc-progress-label', stageLabel);
  appendChildren(progressWrap, track, pctLabel, stageLine);
  const actions = createElement('div', 'tc-state-actions');
  actions.appendChild(createButton('Cancel Analysis', 'ghost', () => { void handleCancelAnalysis().catch(e => console.warn('[Goodman] cancel analysis failed:', e)); }));
  appendChildren(card, icon, title, progressWrap, actions);
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
  const detailBtn = createButton('View Details', 'primary', () => { void handleKeepOpen().catch(e => console.warn('[Goodman] keep open failed:', e)); });
  const refreshBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  refreshBtn.type = 'button';
  refreshBtn.setAttribute('aria-label', 'Re-analyze page');
  refreshBtn.appendChild(createIcon(iconRefresh(16)));
  refreshBtn.addEventListener('click', () => handleAnalyze());
  const settingsBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  settingsBtn.type = 'button';
  settingsBtn.setAttribute('aria-label', 'Open settings');
  settingsBtn.appendChild(createIcon(iconSettings(16)));
  settingsBtn.addEventListener('click', showSettings);
  const historyBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  historyBtn.type = 'button';
  historyBtn.setAttribute('aria-label', 'View history');
  historyBtn.appendChild(createIcon(iconClock(16)));
  historyBtn.addEventListener('click', () => showHistory());
  appendChildren(bar, detailBtn, refreshBtn, settingsBtn, historyBtn);
  return bar;
}

function createNotificationBanner(): HTMLElement | null {
  if (state.pendingNotifications.length === 0) return null;
  const currentDomain = getCurrentDomain();
  const current = state.pendingNotifications.find(n => n.domain === currentDomain);
  const banner = createElement('div', 'tc-banner');
  const text = createElement('span', 'tc-banner-text',
    current
      ? `Terms changed on ${current.domain}`
      : `${state.pendingNotifications.length} domain${state.pendingNotifications.length > 1 ? 's' : ''} with T&C changes`
  );
  const btn = createButton('History', 'ghost', () => showHistory(resolveNotificationTargetDomain()));
  appendChildren(banner, text, btn);
  return banner;
}

// ========== PANEL MODE ==========

function renderPanel(container: HTMLElement): void {
  container.appendChild(createCompactHeader());
  const banner = createNotificationBanner();
  if (banner) container.appendChild(banner);

  if (state.loading) {
    container.appendChild(createPanelLoadingState('Analyzing this page...'));
    return;
  }
  if (state.error && !state.analysis) {
    container.appendChild(createPanelErrorState(state.error));
    container.appendChild(createPanelFooter());
    return;
  }
  if (!state.analysis) {
    if (isFirstRun()) {
      container.appendChild(createCompactWelcome());
    } else {
      container.appendChild(createCompactIdleState());
    }
    container.appendChild(createPanelFooter());
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
      container.appendChild(createCompactActionState(iconShield(28), 'Enable Goodman Cloud',
        'Send T&C text to an LLM for analysis.', 'Accept & Analyze',
        () => { void acceptHostedConsentAndAnalyze().catch(e => console.warn('[Goodman] hosted consent flow failed:', e)); }, 'Settings', showSettings));
      break;
    case 'service_unavailable':
      container.appendChild(createCompactActionState(iconAlertTriangle(28), 'Cloud unavailable',
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
  container.appendChild(createPanelFooter());
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
    card.appendChild(createRedFlagsSection(summary.redFlags));
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

function createPanelFooter(): HTMLElement {
  const footer = createElement('div', 'tc-footer-nav');
  appendChildren(footer,
    createButton('Re-analyze', 'pill', () => handleAnalyze()),
    createButton('Settings', 'pill', showSettings),
    createButton('History', 'pill', () => showHistory()),
  );
  return footer;
}

// ========== SHARED COMPONENTS ==========

function createProgressSection(progressPercent: number, stageLabel: string, logs: PageAnalysisLogEntry[]): HTMLElement {
  const section = createElement('section', 'tc-progress-shell');
  const meta = createElement('div', 'tc-progress-meta');
  const stage = createElement('span', 'tc-progress-stage', stageLabel);
  const percent = createElement('span', 'tc-progress-percent', `${progressPercent}%`);
  const track = createElement('div', 'tc-progress-track');
  const fill = createElement('div', 'tc-progress-fill');
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

function createRedFlagsSection(flags: Array<{ category: string; description: string; severity: string; quote: string }>): HTMLElement {
  const section = createElement('section');
  section.appendChild(createSectionHeading(`Red Flags (${flags.length})`, 'Clauses that look riskier than the rest of the agreement.'));
  const stack = createElement('div', 'tc-flag-stack');
  for (const flag of flags) stack.appendChild(createRedFlagCard(flag));
  section.appendChild(stack);
  return section;
}

function createRedFlagCard(flag: { category: string; description: string; severity: string; quote: string }): HTMLElement {
  const card = createElement('div', cx('tc-flag-card', isExpandableSeverity(flag.severity) && `tc-flag-card--${flag.severity}`));
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-expanded', 'false');
  const header = createElement('div', 'tc-flag-header');
  const titleWrap = createElement('div');
  const title = createElement('span', 'tc-flag-title', flag.category.replace(/_/g, ' '));
  const staticDesc = RED_FLAG_DESCRIPTIONS[flag.category as RedFlagCategory];
  titleWrap.appendChild(title);
  if (staticDesc) titleWrap.appendChild(createElement('p', 'tc-flag-subtitle', staticDesc));
  const severityPill = createSeverityPill(flag.severity);
  const details = createElement('div', 'tc-flag-details');
  const desc = createElement('p', 'tc-flag-description', flag.description);
  appendChildren(header, titleWrap, severityPill);
  details.appendChild(desc);
  if (flag.quote) details.appendChild(createElement('blockquote', 'tc-flag-quote', flag.quote));
  appendChildren(card, header, details);
  const toggle = (): void => {
    const expanded = card.getAttribute('aria-expanded') === 'true';
    card.setAttribute('aria-expanded', String(!expanded));
    details.style.maxHeight = expanded ? '0' : '320px';
  };
  card.addEventListener('click', toggle);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  return card;
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

async function handleKeepOpen(): Promise<void> {
  try {
    const response = await sendToBackground({
      type: 'OPEN_WORKSPACE_SURFACE',
      payload: { tabId: state.tabId ?? undefined, windowId: state.windowId ?? undefined },
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

async function acceptHostedConsentAndAnalyze(): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) { state.error = 'Could not update settings.'; renderCurrentApp(); return; }
  const saveResult = await setStorage('settings', { ...settingsResult.data, hostedConsentAccepted: true });
  if (!saveResult.ok) { state.error = 'Could not save consent.'; renderCurrentApp(); return; }
  state.analysis = state.analysis ? { ...state.analysis, status: 'analyzing', error: null } : state.analysis;
  await handleAnalyze({ hostedConsentAccepted: true });
}

// ========== SUB-VIEWS ==========

function showSettings(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.className = 'tc-page';
  app.textContent = '';
  const panel = createElement('section', 'tc-settings-panel');
  const body = createElement('div', 'tc-settings-body');
  const contentDiv = createElement('div');
  const tabBar = createElement('div', 'tc-tabs');
  appendChildren(body, createViewHeader('Settings', 'Providers, detection, notifications, and cache.'), tabBar, contentDiv);
  panel.appendChild(body);
  app.appendChild(panel);
  const buttons: HTMLButtonElement[] = [];
  for (const tab of SETTINGS_TABS) {
    const button = createElement('button', 'tc-tab', tab) as HTMLButtonElement;
    button.type = 'button';
    button.addEventListener('click', async () => {
      setActiveTab(buttons, button);
      switch (tab) {
        case 'Providers': await renderProviderSettings(contentDiv); break;
        case 'Detection': await renderDetectionSettings(contentDiv); break;
        case 'Notifications': await renderNotificationSettings(contentDiv); break;
        case 'Domains': await renderDomainSettings(contentDiv); break;
        case 'Cache': await renderCacheSettings(contentDiv); break;
      }
    });
    buttons.push(button);
    tabBar.appendChild(button);
  }
  const firstTab = buttons[0];
  if (firstTab) setActiveTab(buttons, firstTab);
  void renderProviderSettings(contentDiv).catch(e => console.warn('[Goodman] initial provider settings render failed:', e));
}

function showHistory(initialDomain?: string): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.className = 'tc-page';
  app.textContent = '';
  const panel = createElement('section', 'tc-history-panel');
  const body = createElement('div', 'tc-history-body');
  const contentDiv = createElement('div');
  appendChildren(body, createViewHeader('History', 'Inspect saved versions and compare T&C changes over time.'), contentDiv);
  panel.appendChild(body);
  app.appendChild(panel);
  void renderHistoryPanel(contentDiv, initialDomain ?? getCurrentDomain()).catch(e => console.warn('[Goodman] history panel render failed:', e));
}

function createViewHeader(title: string, subtitle: string): HTMLElement {
  const wrapper = createElement('div');
  const header = createElement('div', 'tc-view-header');
  const backBtn = createElement('button', 'tc-icon-btn') as HTMLButtonElement;
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', 'Go back');
  backBtn.appendChild(createIcon(iconChevronLeft(16)));
  backBtn.addEventListener('click', handleBack);
  appendChildren(header, backBtn, createElement('h2', 'tc-view-title', title));
  appendChildren(wrapper, header, createElement('p', 'tc-page-copy', subtitle));
  return wrapper;
}

function handleBack(): void {
  void refreshPopupState().then(() => renderCurrentApp()).catch(e => console.warn('[Goodman] back navigation refresh failed:', e));
}

function setActiveTab(buttons: HTMLButtonElement[], activeButton: HTMLButtonElement): void {
  for (const button of buttons) button.classList.toggle('is-active', button === activeButton);
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
  return state.settings?.activeProvider === 'hosted' && !state.settings?.hostedConsentAccepted;
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
