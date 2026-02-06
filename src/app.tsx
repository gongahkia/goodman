/* eslint-disable */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getSettings, saveSettings } from './storage';
import type { UserSettings } from './storage';
import './app.css';

export function App() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      setLoading(false);
    });
  }, []);

  // Apply theme whenever settings change
  useEffect(() => {
    if (!settings) return;

    const applyTheme = () => {
      let theme = settings.theme;
      if (theme === 'auto') {
        theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }

      if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    };
    applyTheme();
  }, [settings]);

  const handleChange = (field: keyof UserSettings, value: UserSettings[keyof UserSettings]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleDomainsChange = (e: JSX.TargetedEvent<HTMLTextAreaElement>) => {
    const text = (e.target as HTMLTextAreaElement).value;
    // Split by newline and filter empty
    const domains = text.split('\n').map((d: string) => d.trim()).filter((d: string) => d.length > 0);
    handleChange('ignoredDomains', domains);
  };

  const handleSave = async () => {
    if (!settings) return;
    await saveSettings(settings); // This updates persistent storage

    // Theme applied via useEffect, but we also want to ensure it's saved correctly
    setStatus('Saved!');
    setTimeout(() => setStatus(''), 2000);
  };

  if (loading || !settings) {
    return <div class="container">Loading...</div>;
  }

  // specific hack for getting supported timezones
  const supportedTimezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : ['UTC', 'America/New_York', 'Europe/London'];

  return (
    <div class="container">
      <header>
        <h1>ONUL</h1>
        <p>Simple, privacy-first timezone converter.</p>
      </header>

      <section class="setting-group">
        <label>Theme</label>
        <select
          value={settings.theme}
          onChange={(e: JSX.TargetedEvent<HTMLSelectElement>) => handleChange('theme', (e.target as HTMLSelectElement).value)}
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
          onChange={(e: JSX.TargetedEvent<HTMLSelectElement>) => handleChange('targetTimezone', (e.target as HTMLSelectElement).value)}
        >
          <option value="auto">Auto (System Default)</option>
          {supportedTimezones.map(tz => (
            <option value={tz}>{tz}</option>
          ))}
        </select>
      </section>

      <section class="setting-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={settings.format24h}
            onChange={(e: JSX.TargetedEvent<HTMLInputElement>) => handleChange('format24h', (e.target as HTMLInputElement).checked)}
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
        <button class="primary" onClick={handleSave}>Save Settings</button>
        {status && <span class="status">{status}</span>}
      </div>
    </div>
  );
}
