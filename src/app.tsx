import { useEffect, useState } from 'preact/hooks';
import browser from './browser';
import type { ActiveTabContext, ManualConvertFailureReason, ManualConvertResponse, RuntimeMessage } from './messages';
import { isIgnoredHostname } from './site-access';
import { getSettings, saveSettings } from './storage';
import type { UserSettings } from './storage';
import './app.css';

type StatusTone = 'success' | 'error' | 'info';
type BusyAction = 'manual' | 'enable' | 'disable' | 'save' | null;

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

export function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [tabContext, setTabContext] = useState<ActiveTabContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const resolvedTheme = settings.theme === 'auto'
      ? window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
      : settings.theme;

    if (resolvedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [settings]);

  async function bootstrap() {
    try {
      const [storedSettings, activeTabContext] = await Promise.all([
        getSettings(),
        getActiveTabContext(),
      ]);
      setSettings(storedSettings);
      setTabContext(activeTabContext);
    } finally {
      setLoading(false);
    }
  }

  async function refreshTabContext() {
    setTabContext(await getActiveTabContext());
  }

  function handleChange(field: keyof UserSettings, value: UserSettings[keyof UserSettings]) {
    if (!settings) {
      return;
    }

    setSettings({ ...settings, [field]: value });
  }

  function handleAddPinnedZone(timezone: string) {
    if (!settings || !timezone || timezone === 'auto') {
      return;
    }

    if (settings.pinnedTimezones.includes(timezone) || settings.pinnedTimezones.length >= 4) {
      return;
    }

    handleChange('pinnedTimezones', [...settings.pinnedTimezones, timezone]);
  }

  function handleRemovePinnedZone(timezone: string) {
    if (!settings) {
      return;
    }

    handleChange('pinnedTimezones', settings.pinnedTimezones.filter((zone) => zone !== timezone));
  }

  function handleDomainsChange(event: Event) {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    const domains = text
      .split('\n')
      .map((domain) => domain.trim())
      .filter((domain) => domain.length > 0);
    handleChange('ignoredDomains', domains);
  }

  async function handleSave() {
    if (!settings) {
      return;
    }

    setBusyAction('save');

    try {
      await saveSettings(settings);
      setStatus({
        tone: 'success',
        text: 'Settings saved.',
      });
      await refreshTabContext();
    } catch (error) {
      setStatus({
        tone: 'error',
        text: getErrorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleManualConvert() {
    if (!tabContext?.tabId) {
      return;
    }

    setBusyAction('manual');

    try {
      const result: ManualConvertResponse = await browser.runtime.sendMessage({
        type: 'ONUL_RUN_MANUAL_CONVERT',
        tabId: tabContext.tabId,
      } satisfies RuntimeMessage);

      setStatus(result.ok
        ? { tone: 'success', text: 'Conversion shown on the current page.' }
        : { tone: 'error', text: messageForManualFailure(result.reason) });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: getErrorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleEnableLive() {
    if (!tabContext?.originPattern || !tabContext.tabId) {
      return;
    }

    setBusyAction('enable');

    try {
      const granted = await browser.permissions.request({
        origins: [tabContext.originPattern],
      });

      if (!granted) {
        setStatus({
          tone: 'info',
          text: 'Site access was not granted.',
        });
        return;
      }

      await browser.runtime.sendMessage({
        type: 'ONUL_SET_LIVE_MODE',
        enabled: true,
        tabId: tabContext.tabId,
      } satisfies RuntimeMessage);
      await refreshTabContext();
      setStatus({
        tone: 'success',
        text: 'Live conversion enabled for this site.',
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: getErrorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDisableLive() {
    if (!tabContext?.originPattern || !tabContext.tabId) {
      return;
    }

    setBusyAction('disable');

    try {
      const removed = await browser.permissions.remove({
        origins: [tabContext.originPattern],
      });

      await browser.runtime.sendMessage({
        type: 'ONUL_SET_LIVE_MODE',
        enabled: false,
        tabId: tabContext.tabId,
      } satisfies RuntimeMessage);
      await refreshTabContext();
      setStatus(removed
        ? {
            tone: 'success',
            text: 'Live conversion disabled for this site.',
          }
        : {
            tone: 'info',
            text: 'Remove site access from your browser settings if it remains enabled.',
          });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: getErrorMessage(error),
      });
    } finally {
      setBusyAction(null);
    }
  }

  if (loading || !settings) {
    return <div class="container">Loading...</div>;
  }

  const supportedTimezones = Intl.supportedValuesOf('timeZone');
  const currentHostname = getHostname(tabContext?.url);
  const ignoredBySettings = currentHostname
    ? isIgnoredHostname(currentHostname, settings.ignoredDomains)
    : false;
  const liveToggleDisabled = !tabContext?.originPattern || tabContext.restricted || ignoredBySettings;
  const manualDisabled = !tabContext?.tabId || tabContext.restricted;
  const siteStatusMessage = getSiteStatusMessage(tabContext, ignoredBySettings);

  return (
    <div class="container">
      <header>
        <h1>ONUL</h1>
        <p>Manual-by-default timezone conversion with optional site access.</p>
      </header>

      <section class="setting-group site-actions">
        <label>Current Page</label>
        <div class="site-summary">
          <strong>{currentHostname ?? 'No active tab'}</strong>
          <span class={`site-state ${tabContext?.liveEnabled ? 'enabled' : ''}`}>{siteStatusMessage}</span>
        </div>
        <div class="action-grid">
          <button
            class="primary"
            disabled={manualDisabled || busyAction !== null}
            onClick={() => {
              void handleManualConvert();
            }}
          >
            {busyAction === 'manual' ? 'Converting...' : 'Convert selection on this page'}
          </button>
          {tabContext?.liveEnabled ? (
            <button
              class="secondary"
              disabled={busyAction !== null}
              onClick={() => {
                void handleDisableLive();
              }}
            >
              {busyAction === 'disable' ? 'Disabling...' : 'Disable on this site'}
            </button>
          ) : (
            <button
              class="secondary"
              disabled={liveToggleDisabled || busyAction !== null}
              onClick={() => {
                void handleEnableLive();
              }}
            >
              {busyAction === 'enable' ? 'Enabling...' : 'Enable live conversion on this site'}
            </button>
          )}
        </div>
        {ignoredBySettings ? (
          <small class="muted">This hostname is ignored in your saved settings. Manual conversion still works.</small>
        ) : null}
        {tabContext?.browser === 'safari' ? (
          <small class="muted">Safari may additionally require website access to be granted in Safari settings.</small>
        ) : null}
      </section>

      <section class="setting-group">
        <label>Theme</label>
        <select
          value={settings.theme}
          onChange={(event) => {
            handleChange('theme', event.currentTarget.value);
          }}
        >
          <option value="auto">Auto (System Default)</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </section>

      <section class="setting-group">
        <label>Target Timezone</label>
        <select
          value={settings.targetTimezone}
          onChange={(event) => {
            handleChange('targetTimezone', event.currentTarget.value);
          }}
        >
          <option value="auto">Auto (System Default)</option>
          {supportedTimezones.map((timezone) => (
            <option value={timezone} key={timezone}>{timezone}</option>
          ))}
        </select>
      </section>

      <section class="setting-group">
        <label>Pinned Zones (max 4)</label>
        <div class="pinned-zones">
          {settings.pinnedTimezones.map((timezone) => (
            <div class="pinned-zone-tag" key={timezone}>
              <span>{timezone}</span>
              <button class="remove-btn" onClick={() => {
                handleRemovePinnedZone(timezone);
              }}>&times;</button>
            </div>
          ))}
        </div>
        {settings.pinnedTimezones.length < 4 ? (
          <select
            value=""
            onChange={(event) => {
              const value = event.currentTarget.value;
              handleAddPinnedZone(value);
              event.currentTarget.value = '';
            }}
          >
            <option value="" disabled>Add a timezone...</option>
            {supportedTimezones
              .filter((timezone) => !settings.pinnedTimezones.includes(timezone))
              .map((timezone) => (
                <option value={timezone} key={timezone}>{timezone}</option>
              ))}
          </select>
        ) : null}
      </section>

      <section class="setting-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={settings.format24h}
            onChange={(event) => {
              handleChange('format24h', event.currentTarget.checked);
            }}
          />
          Use 24-hour format
        </label>
      </section>

      <section class="setting-group">
        <label>Ignored Domains (one per line)</label>
        <textarea
          rows={5}
          value={settings.ignoredDomains.join('\n')}
          onInput={handleDomainsChange}
          placeholder="example.com&#10;google.com"
        />
      </section>

      <div class="actions">
        <button class="primary" disabled={busyAction !== null} onClick={() => {
          void handleSave();
        }}>
          {busyAction === 'save' ? 'Saving...' : 'Save Settings'}
        </button>
        {status ? <span class={`status ${status.tone}`}>{status.text}</span> : null}
      </div>
    </div>
  );
}

async function getActiveTabContext(): Promise<ActiveTabContext> {
  const context: ActiveTabContext = await browser.runtime.sendMessage({
    type: 'ONUL_GET_ACTIVE_TAB_CONTEXT',
  } satisfies RuntimeMessage);

  return context;
}

function getHostname(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function getSiteStatusMessage(context: ActiveTabContext | null, ignoredBySettings: boolean): string {
  if (!context?.url) {
    return 'No active webpage detected.';
  }

  if (context.restricted) {
    return 'This page does not allow extension scripts.';
  }

  if (ignoredBySettings) {
    return 'Ignored by saved settings.';
  }

  if (context.liveEnabled) {
    return 'Enabled for this site.';
  }

  if (context.browser === 'safari') {
    return 'Not enabled. Safari may also prompt for site access.';
  }

  return 'Not enabled for this site.';
}

function messageForManualFailure(reason: ManualConvertFailureReason | undefined): string {
  switch (reason) {
    case 'NO_SELECTION':
      return 'Select a time or date on the current page first.';
    case 'SELECTION_TOO_LONG':
      return 'The selected text is too long to parse safely.';
    case 'NO_RANGE':
      return 'The current selection could not be located on the page.';
    case 'UNSUPPORTED_SELECTION':
    default:
      return 'No supported time or date was found in the current selection.';
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'The requested action could not be completed on this page.';
}
