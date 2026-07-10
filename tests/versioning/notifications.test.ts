import { beforeEach, describe, expect, it } from 'vitest';
import { getPendingNotifications, notifyChange } from '@versioning/notifications';
import { DEFAULT_SETTINGS } from '@shared/storage';
import { mockStorage } from '../mocks/chrome';

describe('pending notifications', () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    mockStorage.settings = {
      ...DEFAULT_SETTINGS,
      notifyOnChange: true,
    };
  });

  it('keeps only the latest pending notification per domain', async () => {
    await notifyChange('example.com', {
      addedRedFlags: [
        {
          category: 'automatic_renewal',
          description: 'Auto renewal',
          severity: 'medium',
          quote: 'Renews monthly.',
        },
      ],
      removedRedFlags: [],
      changedRedFlags: [],
      severityChange: null,
      newKeyPoints: [],
      removedKeyPoints: [],
    });

    await notifyChange('example.com', {
      addedRedFlags: [],
      removedRedFlags: [],
      changedRedFlags: [
        {
          old: {
            category: 'automatic_renewal',
            description: 'Auto renewal',
            severity: 'medium',
            quote: 'Renews monthly.',
          },
          new: {
            category: 'automatic_renewal',
            description: 'Auto renewal',
            severity: 'medium',
            quote: 'Renews annually.',
          },
        },
      ],
      severityChange: null,
      newKeyPoints: [],
      removedKeyPoints: [],
    });

    const pending = await getPendingNotifications();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      domain: 'example.com',
      viewed: false,
      addedRedFlags: 1,
    });
  });

  it('deduplicates legacy duplicate notifications when reading pending state', async () => {
    mockStorage.pendingNotifications = [
      {
        domain: 'example.com',
        addedRedFlags: 1,
        timestamp: 1,
        viewed: false,
      },
      {
        domain: 'example.com',
        addedRedFlags: 2,
        timestamp: 2,
        viewed: false,
      },
      {
        domain: 'other.com',
        addedRedFlags: 0,
        timestamp: 3,
        viewed: false,
      },
    ];

    const pending = await getPendingNotifications();

    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({
      domain: 'other.com',
      addedRedFlags: 0,
    });
    expect(pending[1]).toMatchObject({
      domain: 'example.com',
      addedRedFlags: 2,
    });
  });
});
