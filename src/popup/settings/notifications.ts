import {
  getDomainNotificationPreference,
  getStorage,
  setDomainNotificationPreference,
  setStorage,
} from '@shared/storage';
import { getAllTrackedDomains } from '@versioning/schema';

export async function renderNotificationSettings(container: HTMLElement): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;
  const settings = settingsResult.data;

  container.textContent = '';

  const heading = document.createElement('h3');
  heading.style.cssText = 'font-size:16px;font-weight:600;margin-bottom:16px';
  heading.textContent = 'Notification Settings';
  container.appendChild(heading);

  const globalToggle = document.createElement('label');
  globalToggle.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer';
  const globalCheck = document.createElement('input');
  globalCheck.type = 'checkbox';
  globalCheck.checked = settings.notifyOnChange;
  globalCheck.addEventListener('change', async () => {
    const s = await getStorage('settings');
    if (!s.ok) return;
    await setStorage('settings', { ...s.data, notifyOnChange: globalCheck.checked });
  });
  globalToggle.appendChild(globalCheck);
  globalToggle.appendChild(document.createTextNode('Notify when tracked T&C change'));
  container.appendChild(globalToggle);

  const domainsHeading = document.createElement('h4');
  domainsHeading.style.cssText = 'font-size:14px;font-weight:500;margin-bottom:8px';
  domainsHeading.textContent = 'Tracked Domains';
  container.appendChild(domainsHeading);

  const domains = await getAllTrackedDomains();
  if (domains.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'font-size:13px;color:#6b7280';
    empty.textContent = 'No domains tracked yet.';
    container.appendChild(empty);
    return;
  }

  for (const domain of domains) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e5e7eb;cursor:pointer';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = await getDomainNotificationPreference(domain);
    check.addEventListener('change', async () => {
      await setDomainNotificationPreference(domain, check.checked);
    });
    row.appendChild(check);
    row.appendChild(document.createTextNode(domain));
    container.appendChild(row);
  }
}
