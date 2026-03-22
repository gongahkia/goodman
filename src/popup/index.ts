import type { Summary } from '@providers/types';
import { renderProviderSettings } from '@popup/settings/providers';
import { renderDetectionSettings } from '@popup/settings/detection';
import { renderNotificationSettings } from '@popup/settings/notifications';
import { renderCacheSettings } from '@popup/settings/cache';
import { renderHistoryPanel } from '@popup/history';

interface PageState {
  domain: string;
  summary: Summary | null;
  loading: boolean;
  error: string | null;
}

const state: PageState = {
  domain: '',
  summary: null,
  loading: false,
  error: null,
};

async function init(): Promise<void> {
  const app = document.getElementById('app');
  if (!app) return;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.url) {
    try {
      state.domain = new URL(tab.url).hostname;
    } catch {
      state.domain = 'unknown';
    }
  }

  render(app);
}

function render(container: HTMLElement): void {
  container.textContent = '';

  const header = createHeader();
  container.appendChild(header);

  if (state.loading) {
    container.appendChild(createLoadingState());
    return;
  }

  if (state.error) {
    container.appendChild(createErrorState(state.error));
    return;
  }

  if (state.summary) {
    container.appendChild(createSummaryView(state.summary));
  } else {
    container.appendChild(createEmptyState());
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
  domain.textContent = state.domain;
  header.appendChild(title);
  header.appendChild(domain);
  return header;
}

function createEmptyState(): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;padding:32px 16px';
  const msg = document.createElement('p');
  msg.style.cssText = 'color:var(--tc-text-secondary);margin-bottom:16px';
  msg.textContent = 'No T&C detected on this page';
  const btn = createButton('Analyze This Page', handleAnalyze);
  div.appendChild(msg);
  div.appendChild(btn);
  return div;
}

function createLoadingState(): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = 'text-align:center;padding:32px 16px;color:var(--tc-text-secondary)';
  div.textContent = 'Analyzing...';
  return div;
}

function createErrorState(error: string): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = 'padding:12px;background:#fee2e2;border-radius:var(--tc-radius-md);color:#991b1b;margin-bottom:12px';
  div.textContent = error;
  const retryBtn = createButton('Retry', handleAnalyze);
  div.appendChild(retryBtn);
  return div;
}

function createSummaryView(summary: Summary): HTMLElement {
  const div = document.createElement('div');

  const badge = createSeverityBadge(summary.severity);
  div.appendChild(badge);

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

function createRedFlagCard(flag: { category: string; description: string; severity: string; quote: string }): HTMLElement {
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
  details.style.cssText = 'max-height:0;overflow:hidden;transition:max-height 200ms cubic-bezier(0.16,1,0.3,1)';
  const desc = document.createElement('p');
  desc.style.cssText = 'margin:8px 0;font-size:13px;color:var(--tc-text-secondary);line-height:1.4';
  desc.textContent = flag.description;
  details.appendChild(desc);
  if (flag.quote) {
    const quote = document.createElement('blockquote');
    quote.style.cssText = 'border-left:2px solid var(--tc-text-tertiary);padding-left:12px;color:var(--tc-text-secondary);font-style:italic;font-size:12px;margin:8px 0';
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
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
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
  btn.addEventListener('click', onClick);
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
  footer.appendChild(createFooterButton('History', showHistory));
  return footer;
}

function createFooterButton(text: string, onClick: () => void): HTMLButtonElement {
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

async function handleAnalyze(): Promise<void> {
  state.loading = true;
  state.error = null;
  const appEl = document.getElementById('app');
  if (appEl) render(appEl);

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error('No active tab');

    await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_TC', payload: { tabId: tab.id } });
    state.loading = false;
  } catch {
    state.loading = false;
    state.error = 'Could not analyze this page.';
  }

  const appEl2 = document.getElementById('app');
  if (appEl2) render(appEl2);
}

function showSettings(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.textContent = '';
  const back = document.createElement('button');
  back.style.cssText = 'background:none;border:none;color:var(--tc-accent);cursor:pointer;font-size:14px;margin-bottom:12px';
  back.textContent = '← Back';
  back.addEventListener('click', () => { const a = document.getElementById('app'); if (a) render(a); });
  app.appendChild(back);
  const heading = document.createElement('h2');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Settings';
  app.appendChild(heading);

  const tabs = ['Providers', 'Detection', 'Notifications', 'Cache'] as const;
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:4px;margin-bottom:16px;border-bottom:1px solid var(--tc-border)';

  const contentDiv = document.createElement('div');

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.style.cssText = 'background:none;border:none;border-bottom:2px solid transparent;padding:8px 12px;cursor:pointer;font-size:13px;font-weight:500;color:var(--tc-text-secondary)';
    btn.textContent = tab;
    btn.addEventListener('click', async () => {
      for (const child of tabBar.children) {
        (child as HTMLElement).style.borderBottomColor = 'transparent';
        (child as HTMLElement).style.color = 'var(--tc-text-secondary)';
      }
      btn.style.borderBottomColor = 'var(--tc-accent)';
      btn.style.color = 'var(--tc-text)';
      switch (tab) {
        case 'Providers': await renderProviderSettings(contentDiv); break;
        case 'Detection': await renderDetectionSettings(contentDiv); break;
        case 'Notifications': await renderNotificationSettings(contentDiv); break;
        case 'Cache': await renderCacheSettings(contentDiv); break;
      }
    });
    tabBar.appendChild(btn);
  }

  app.appendChild(tabBar);
  app.appendChild(contentDiv);

  // Activate first tab
  const firstTab = tabBar.children[0] as HTMLElement;
  firstTab.style.borderBottomColor = 'var(--tc-accent)';
  firstTab.style.color = 'var(--tc-text)';
  void renderProviderSettings(contentDiv);
}

function showHistory(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.textContent = '';
  const back = document.createElement('button');
  back.style.cssText = 'background:none;border:none;color:var(--tc-accent);cursor:pointer;font-size:14px;margin-bottom:12px';
  back.textContent = '← Back';
  back.addEventListener('click', () => { const a = document.getElementById('app'); if (a) render(a); });
  app.appendChild(back);

  const contentDiv = document.createElement('div');
  app.appendChild(contentDiv);
  void renderHistoryPanel(contentDiv, state.domain);
}

document.addEventListener('DOMContentLoaded', init);
