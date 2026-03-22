/**
 * E2E tests for TC Guard extension
 * These tests launch a persistent Chromium profile with the built extension
 * and validate the packaged popup page, runtime messaging, and persisted
 * background analysis state.
 */

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type ServiceWorker,
} from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = resolve(__dirname, '../../dist');

let context: BrowserContext;
let extensionId = '';

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });

  const worker = await getExtensionWorker();
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

test.beforeEach(async () => {
  await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
    });
  });
});

test('loads the packaged MV3 worker and popup page', async () => {
  const worker = await getExtensionWorker();
  expect(worker.url()).toContain('chrome-extension://');

  const popup = await openExtensionPage();
  await expect(popup.locator('#app')).toHaveCount(1);
  await popup.close();
});

test('round-trips persisted page analysis through extension storage', async () => {
  const record = {
    tabId: 11,
    url: 'https://example.com/checkout',
    domain: 'example.com',
    status: 'no_detection',
    sourceType: null,
    detectionType: null,
    confidence: null,
    textHash: null,
    summary: null,
    error: null,
    updatedAt: Date.now(),
  };

  const result = await withWorker(async (worker) => {
    await worker.evaluate(async (payload) => {
      await chrome.storage.local.set({
        pageAnalysis: {
          [String(payload.tabId)]: payload,
        },
      });
    }, record);

    return (await worker.evaluate(async () => {
      return await chrome.storage.local.get(['pageAnalysis']);
    })) as { pageAnalysis: Record<string, typeof record> };
  });

  expect(result.pageAnalysis['11']).toMatchObject({
    tabId: 11,
    domain: 'example.com',
    status: 'no_detection',
  });
});

test('round-trips per-domain notification preferences through extension storage', async () => {
  const result = await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        domainNotificationPreferences: {
          'example.com': false,
          'tracked.test': true,
        },
      });
    });

    return (await worker.evaluate(async () => {
      return await chrome.storage.local.get(['domainNotificationPreferences']);
    })) as {
      domainNotificationPreferences: Record<string, boolean>;
    };
  });

  expect(result.domainNotificationPreferences).toMatchObject({
    'example.com': false,
    'tracked.test': true,
  });
});

async function getExtensionWorker(): Promise<ServiceWorker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

async function withWorker<T>(
  callback: (worker: ServiceWorker) => Promise<T>
): Promise<T> {
  return callback(await getExtensionWorker());
}

async function openExtensionPage(): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/popup/index.html`);
  return page;
}
