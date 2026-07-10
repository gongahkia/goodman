import {
  getDomainPreferences,
  getDomainNotificationPreference,
  getStorage,
  setStorage,
  withStorageLock,
} from '@shared/storage';
import {
  matchesWatchedClause,
  type DomainPreferences,
} from '@shared/domain-preferences';
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

  const preferences = await getDomainPreferences(domain);
  if (!shouldNotifyForDomainPreferences(diff, preferences)) return false;

  try {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } catch (e) {
    console.warn('[Goodman] failed to set notification badge:', e);
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

function shouldNotifyForDomainPreferences(
  diff: SummaryDiff,
  preferences: DomainPreferences
): boolean {
  if (isIgnoredByPatterns(diff, preferences.ignorePatterns)) return false;
  if (!matchesWatchedClauses(diff, preferences)) return false;

  switch (preferences.notificationThreshold) {
    case 'any':
      return true;
    case 'material':
      return hasRedFlagChange(diff) || diff.severityChange !== null;
    case 'red_flag_only':
      return hasRedFlagChange(diff);
  }
}

function matchesWatchedClauses(
  diff: SummaryDiff,
  preferences: DomainPreferences
): boolean {
  if (preferences.watchClauses.length === 0) return true;
  const flags = [
    ...diff.addedRedFlags,
    ...diff.removedRedFlags,
    ...diff.changedRedFlags.flatMap(change => [change.old, change.new]),
  ];
  return flags.some(flag =>
    matchesWatchedClause(
      flag.category,
      preferences.watchClauses,
      `${flag.description} ${flag.quote}`
    )
  );
}

function hasRedFlagChange(diff: SummaryDiff): boolean {
  return (
    diff.addedRedFlags.length > 0 ||
    diff.removedRedFlags.length > 0 ||
    diff.changedRedFlags.length > 0
  );
}

function isIgnoredByPatterns(diff: SummaryDiff, patterns: string[]): boolean {
  const regexes = patterns.flatMap(pattern => {
    try {
      return [new RegExp(pattern, 'i')];
    } catch {
      return [];
    }
  });
  if (regexes.length === 0) return false;

  const diffText = collectDiffText(diff);
  return diffText.length > 0 && diffText.every(text => regexes.some(regex => regex.test(text)));
}

function collectDiffText(diff: SummaryDiff): string[] {
  return [
    ...diff.addedRedFlags.flatMap(flag => [flag.category, flag.description, flag.quote]),
    ...diff.removedRedFlags.flatMap(flag => [flag.category, flag.description, flag.quote]),
    ...diff.changedRedFlags.flatMap(change => [
      change.old.category,
      change.old.description,
      change.old.quote,
      change.new.category,
      change.new.description,
      change.new.quote,
    ]),
    ...(diff.severityChange ? [diff.severityChange.old, diff.severityChange.new] : []),
    ...diff.newKeyPoints,
    ...diff.removedKeyPoints,
  ].filter(Boolean);
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
      } catch (e) {
        console.warn('[Goodman] failed to clear notification badge:', e);
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
