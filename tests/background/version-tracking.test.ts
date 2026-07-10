import { beforeEach, describe, expect, it } from 'vitest';
import type { Summary } from '@providers/types';
import {
  DEFAULT_SETTINGS,
  setDomainPreferences,
  setDomainNotificationPreference,
} from '@shared/storage';
import { DEFAULT_DOMAIN_PREFERENCES } from '@shared/domain-preferences';
import { getVersionHistory } from '@versioning/schema';
import { syncVersionHistory } from '@background/version-tracking';
import { mockStorage } from '../mocks/chrome';

const mockCrypto = {
  subtle: {
    digest: async (_algorithm: string, data: ArrayBuffer) => {
      const view = new Uint8Array(data);
      const hash = new Uint8Array(32);
      for (let i = 0; i < view.length; i++) {
        hash[i % 32] = (hash[i % 32]! + view[i]!) % 256;
      }
      return hash.buffer;
    },
  },
};

Object.defineProperty(globalThis, 'crypto', { value: mockCrypto, writable: true });

const baseSummary: Summary = {
  summary: 'Base summary',
  keyPoints: ['Point one'],
  redFlags: [],
  severity: 'low',
};

const changedSummary: Summary = {
  summary: 'Changed summary',
  keyPoints: ['Point one', 'Point two'],
  redFlags: [
    {
      category: 'arbitration_clause',
      description: 'Mandatory arbitration',
      severity: 'high',
      quote: 'All disputes must be resolved by arbitration.',
    },
  ],
  severity: 'high',
};

const dataSharingSummary: Summary = {
  summary: 'Data sharing summary',
  keyPoints: ['Point one'],
  redFlags: [
    {
      category: 'third_party_sharing',
      description: 'Shares data with partners',
      severity: 'medium',
      quote: 'We share data with selected partners.',
    },
  ],
  severity: 'medium',
};

const keyPointOnlySummary: Summary = {
  summary: 'Base summary',
  keyPoints: ['Point one', 'Point two'],
  redFlags: [],
  severity: 'low',
};

const quoteChangedSummary: Summary = {
  summary: 'Base summary',
  keyPoints: ['Point one'],
  redFlags: [
    {
      category: 'automatic_renewal',
      description: 'Auto renewal',
      severity: 'medium',
      quote: 'Your subscription renews monthly.',
    },
  ],
  severity: 'medium',
};

const quoteUpdatedSummary: Summary = {
  summary: 'Base summary',
  keyPoints: ['Point one'],
  redFlags: [
    {
      category: 'automatic_renewal',
      description: 'Auto renewal',
      severity: 'medium',
      quote: 'Your subscription renews annually unless cancelled.',
    },
  ],
  severity: 'medium',
};

describe('syncVersionHistory', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockStorage.settings = {
      ...DEFAULT_SETTINGS,
      notifyOnChange: true,
    };
  });

  it('stores the first seen version without notifying', async () => {
    const result = await syncVersionHistory(
      'example.com',
      'original text',
      baseSummary
    );

    expect(result.versionNumber).toBe(1);
    expect(result.notified).toBe(false);
    expect(mockStorage.pendingNotifications).toBeUndefined();
  });

  it('does not create a new version when the text is unchanged', async () => {
    await syncVersionHistory('example.com', 'same text', baseSummary);
    const result = await syncVersionHistory('example.com', 'same text', baseSummary);

    expect(result.changed).toBe(false);
    const history = await getVersionHistory('example.com');
    expect(history).toHaveLength(1);
  });

  it('does not notify when the text changes but the summary meaning does not', async () => {
    await syncVersionHistory('example.com', 'text v1', baseSummary);
    const result = await syncVersionHistory('example.com', 'text v2', baseSummary);

    expect(result.changed).toBe(true);
    expect(result.notified).toBe(false);
    expect(mockStorage.pendingNotifications).toBeUndefined();
  });

  it('respects per-domain notification preferences', async () => {
    await syncVersionHistory('example.com', 'text v1', baseSummary);
    await setDomainNotificationPreference('example.com', false);

    const result = await syncVersionHistory(
      'example.com',
      'text v2',
      changedSummary
    );

    expect(result.changed).toBe(true);
    expect(result.notified).toBe(false);
    expect(mockStorage.pendingNotifications).toBeUndefined();
  });

  it('queues notifications for meaningful changes when notifications are enabled', async () => {
    await syncVersionHistory('example.com', 'text v1', baseSummary);

    const result = await syncVersionHistory(
      'example.com',
      'text v2',
      changedSummary
    );

    expect(result.changed).toBe(true);
    expect(result.notified).toBe(true);
    expect(mockStorage.pendingNotifications).toHaveLength(1);
  });

  it('keeps any meaningful change as the default domain threshold', async () => {
    await syncVersionHistory('example.com', 'text v1', baseSummary);

    const result = await syncVersionHistory(
      'example.com',
      'text v2',
      keyPointOnlySummary
    );

    expect(result.changed).toBe(true);
    expect(result.notified).toBe(true);
    expect(mockStorage.pendingNotifications).toHaveLength(1);
  });

  it('notifies only watched clause changes for domain preferences', async () => {
    await setDomainPreferences('example.com', {
      ...DEFAULT_DOMAIN_PREFERENCES,
      watchClauses: ['arbitration'],
      notificationThreshold: 'red_flag_only',
    });
    await syncVersionHistory('example.com', 'text v1', baseSummary);

    const unrelated = await syncVersionHistory(
      'example.com',
      'text v2',
      dataSharingSummary
    );

    expect(unrelated.changed).toBe(true);
    expect(unrelated.notified).toBe(false);
    expect(mockStorage.pendingNotifications).toBeUndefined();

    const watched = await syncVersionHistory(
      'example.com',
      'text v3',
      changedSummary
    );

    expect(watched.changed).toBe(true);
    expect(watched.notified).toBe(true);
    expect(mockStorage.pendingNotifications).toHaveLength(1);
  });

  it('treats quote-only red flag changes as meaningful notifications', async () => {
    await syncVersionHistory('example.com', 'text v1', quoteChangedSummary);

    const result = await syncVersionHistory(
      'example.com',
      'text v2',
      quoteUpdatedSummary
    );

    expect(result.changed).toBe(true);
    expect(result.notified).toBe(true);
    expect(result.summaryDiff?.changedRedFlags).toHaveLength(1);
  });
});
