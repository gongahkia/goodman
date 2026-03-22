import { getStorage, setStorage } from '@shared/storage';
import type { PendingNotification } from '@shared/storage';
import type { SummaryDiff } from './summary-diff';

export async function notifyChange(
  domain: string,
  diff: SummaryDiff
): Promise<void> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return;

  if (!settingsResult.data.notifyOnChange) return;

  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch {
    // may fail in non-extension context
  }

  const notificationsResult = await getStorage('pendingNotifications');
  if (!notificationsResult.ok) return;

  const notifications = [...notificationsResult.data];
  notifications.push({
    domain,
    addedRedFlags: diff.addedRedFlags.length,
    timestamp: Date.now(),
    viewed: false,
  });

  await setStorage('pendingNotifications', notifications);
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const result = await getStorage('pendingNotifications');
  if (!result.ok) return [];
  return result.data.filter((n) => !n.viewed);
}

export async function clearNotification(domain: string): Promise<void> {
  const result = await getStorage('pendingNotifications');
  if (!result.ok) return;

  const updated = result.data.map((n) =>
    n.domain === domain ? { ...n, viewed: true } : n
  );
  await setStorage('pendingNotifications', updated);

  const remaining = updated.filter((n) => !n.viewed);
  if (remaining.length === 0) {
    try {
      await chrome.action.setBadgeText({ text: '' });
    } catch {
      // may fail in non-extension context
    }
  }
}
