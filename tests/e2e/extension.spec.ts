import { createServer, type Server } from 'http';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
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
let fixtureServer: Server;
let baseUrl = '';
let userDataDir = '';

test.beforeAll(async () => {
  userDataDir = await mkdtemp(resolve(tmpdir(), 'tc-guard-e2e-'));
  fixtureServer = createFixtureServer();
  await new Promise<void>((resolveServer) => {
    fixtureServer.listen(0, '127.0.0.1', () => resolveServer());
  });
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not start fixture server');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;

  context = await chromium.launchPersistentContext(userDataDir, {
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
  await new Promise<void>((resolveServer, rejectServer) => {
    fixtureServer.close((error) => {
      if (error) {
        rejectServer(error);
        return;
      }
      resolveServer();
    });
  });
  await rm(userDataDir, { recursive: true, force: true });
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

test('persists a needs_provider analysis for a consent-like page visit', async () => {
  const page = await context.newPage();
  const consentUrl = `${baseUrl}/consent`;

  await page.goto(consentUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(consentUrl);

  expect(record).toMatchObject({
    status: 'needs_provider',
    sourceType: 'inline',
    detectionType: 'checkbox',
    domain: '127.0.0.1',
    url: consentUrl,
  });

  await page.close();
});

test('persists a no_detection analysis for a plain page visit', async () => {
  const page = await context.newPage();
  const plainUrl = `${baseUrl}/plain`;

  await page.goto(plainUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(plainUrl);

  expect(record).toMatchObject({
    status: 'no_detection',
    sourceType: null,
    detectionType: null,
    domain: '127.0.0.1',
    url: plainUrl,
  });

  await page.close();
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

async function waitForUrlAnalysis(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await withWorker(async (worker) => {
      return (await worker.evaluate(async (targetUrl) => {
        const { pageAnalysisByUrl } = await chrome.storage.local.get(['pageAnalysisByUrl']);
        return (pageAnalysisByUrl as Record<string, unknown> | undefined)?.[targetUrl] ?? null;
      }, url)) as Record<string, unknown> | null;
    });

    if (result) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for page analysis for ${url}`);
}

function createFixtureServer(): Server {
  return createServer((request, response) => {
    const path = request.url ?? '/';

    response.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (path === '/consent') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Checkout</h1>
      <p>
        By completing this order, you agree to our Terms and Conditions, consent to recurring
        billing for renewal plans, accept binding arbitration, and authorize data sharing with
        our payment and analytics partners as described below.
      </p>
      <p>
        You also accept a class action waiver, automatic subscription renewal unless canceled
        before the next billing date, a mandatory dispute resolution process, and the collection
        of usage data to improve service operations and marketing attribution.
      </p>
      <label for="agree">
        <input type="checkbox" id="agree" />
        I agree to the Terms and Conditions before submitting my order.
      </label>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/plain') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Welcome</h1>
      <p>This page contains marketing copy and product information only.</p>
    </main>
  </body>
</html>`);
      return;
    }

    response.statusCode = 404;
    response.end('<!doctype html><html><body><p>Not found</p></body></html>');
  });
}
