import {
  getDomainNotificationPreference,
  getStorage,
  setStorage,
  withStorageLock,
} from '@shared/storage';
import type { PendingNotification } from '@shared/storage';
import type { SummaryDiff } from './summary-diff';

export async function notifyChange(
  domain: string,
  diff: SummaryDiff
): Promise<boolean> {
  const settingsResult = await getStorage('settings');
  if (!settingsResult.ok) return false;

  if (!settingsResult.data.notifyOnChange) return false;

  const domainPreference = await getDomainNotificationPreference(domain);
  if (!domainPreference) return false;

  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch {
    // may fail in non-extension context
  }

  return withStorageLock('pendingNotifications', async () => {
    const notificationsResult = await getStorage('pendingNotifications');
    if (!notificationsResult.ok) return false;

    const notifications = upsertPendingNotification(notificationsResult.data, {
      domain,
      addedRedFlags: diff.addedRedFlags.length,
      timestamp: Date.now(),
      viewed: false,
    });

    await setStorage('pendingNotifications', notifications);
    return true;
  });
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  const result = await getStorage('pendingNotifications');
  if (!result.ok) return [];
  return deduplicatePendingNotifications(result.data.filter((n) => !n.viewed));
}

export function clearNotification(domain: string): Promise<void> {
  return withStorageLock('pendingNotifications', async () => {
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
  });
}

function upsertPendingNotification(
  notifications: PendingNotification[],
  incoming: PendingNotification
): PendingNotification[] {
  const existing = notifications.find(
    (notification) =>
      notification.domain === incoming.domain && notification.viewed === false
  );
  const nextNotification = existing
    ? {
        ...incoming,
        addedRedFlags: Math.max(existing.addedRedFlags, incoming.addedRedFlags),
      }
    : incoming;

  const filtered = notifications.filter(
    (notification) => notification.domain !== incoming.domain
  );

  return deduplicatePendingNotifications([...filtered, nextNotification]);
}

function deduplicatePendingNotifications(
  notifications: PendingNotification[]
): PendingNotification[] {
  const byDomain = new Map<string, PendingNotification>();

  for (const notification of notifications) {
    const existing = byDomain.get(notification.domain);
    if (
      !existing ||
      notification.timestamp > existing.timestamp ||
      (notification.timestamp === existing.timestamp &&
        notification.addedRedFlags > existing.addedRedFlags)
    ) {
      byDomain.set(notification.domain, notification);
    }
  }

  return [...byDomain.values()].sort((left, right) => right.timestamp - left.timestamp);
}
