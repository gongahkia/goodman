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
const FIXTURE_PDF_BASE64 =
  'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA4NyA+PgpzdHJlYW0KQlQKL0YxIDE4IFRmCjcyIDcyMCBUZAooVGVybXMgcmVxdWlyZSByZWN1cnJpbmcgYmlsbGluZyBhbmQgYmluZGluZyBhcmJpdHJhdGlvbi4pIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzc4IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDQ4CiUlRU9G';

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
  await closeServer(fixtureServer);
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

test('fresh install defaults to hosted consent gating on a consent-like page', async () => {
  const consentUrl = `${baseUrl}/consent`;
  const page = await context.newPage();

  await page.goto(consentUrl, { waitUntil: 'load' });
  const gatedRecord = await waitForUrlAnalysis(consentUrl, 'needs_consent');
  expect(gatedRecord).toMatchObject({
    status: 'needs_consent',
    sourceType: 'inline',
    detectionType: 'checkbox',
  });

  await page.close();
});

test('suppresses ambiguous newsletter marketing consent pages as no_detection', async () => {
  const page = await context.newPage();
  const newsletterUrl = `${baseUrl}/newsletter-consent`;

  await page.goto(newsletterUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(newsletterUrl, 'no_detection');

  expect(record).toMatchObject({
    status: 'no_detection',
    sourceType: null,
    detectionType: null,
  });

  await page.close();
});

test('keeps linked and PDF extraction routing working under hosted consent gating', async () => {
  const linkedPage = await context.newPage();
  const linkedUrl = `${baseUrl}/consent-linked`;
  await linkedPage.goto(linkedUrl, { waitUntil: 'load' });
  const linkedRecord = await waitForUrlAnalysis(linkedUrl, 'needs_consent');
  expect(linkedRecord).toMatchObject({
    status: 'needs_consent',
    sourceType: 'linked',
    detectionType: 'checkbox',
  });
  await linkedPage.close();

  const pdfPage = await context.newPage();
  const pdfUrl = `${baseUrl}/consent-pdf`;
  await pdfPage.goto(pdfUrl, { waitUntil: 'load' });
  const pdfRecord = await waitForUrlAnalysis(pdfUrl, 'needs_consent');
  expect(pdfRecord).toMatchObject({
    status: 'needs_consent',
    sourceType: 'pdf',
    detectionType: 'checkbox',
  });
  await pdfPage.close();
});

test('renders a pending tracked-change banner in the popup shell', async () => {
  await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        pendingNotifications: [
          {
            domain: '127.0.0.1',
            addedRedFlags: 1,
            timestamp: Date.now(),
            viewed: false,
          },
        ],
      });
    });
  });

  const popup = await openExtensionPage();
  await expect(popup.locator('body')).toContainText('Tracked T&C changes detected');
  await expect(popup.locator('body')).toContainText(
    '1 tracked domain has a new terms change ready for review.'
  );

  await popup.close();
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

async function waitForUrlAnalysis(
  url: string,
  status?: string
): Promise<Record<string, unknown>> {
  let lastResult: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await withWorker(async (worker) => {
      return (await worker.evaluate(async (targetUrl) => {
        const { pageAnalysis } = await chrome.storage.local.get(['pageAnalysis']);
        return (pageAnalysis as Record<string, unknown> | undefined)?.[targetUrl] ?? null;
      }, url)) as Record<string, unknown> | null;
    });

    if (result) {
      lastResult = result;
    }

    if (result && (!status || result.status === status)) {
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(
    `Timed out waiting for page analysis for ${url}. Last record: ${JSON.stringify(lastResult)}`
  );
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveServer, rejectServer) => {
    server.close((error) => {
      if (error) {
        rejectServer(error);
        return;
      }
      resolveServer();
    });
  });
}

function createFixtureServer(): Server {
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;

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

    if (path === '/newsletter-consent') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Stay in the loop</h1>
      <label for="newsletter">
        <input type="checkbox" id="newsletter" />
        Email me newsletter updates, promotions, and product offers every week.
      </label>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/consent-changing') {
      const version = url.searchParams.get('version') ?? '1';
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Checkout</h1>
      <p>
        ${
          version === '2'
            ? 'By completing this order, you agree to our Terms and Conditions, including binding arbitration and automatic renewal for recurring billing plans.'
            : 'By completing this order, you agree to our Terms and Conditions and Privacy Policy for this purchase.'
        }
      </p>
      <label for="agree-change">
        <input type="checkbox" id="agree-change" />
        I agree to the Terms and Conditions before submitting my order.
      </label>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/consent-linked') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Checkout</h1>
      <label for="agree-linked">
        <input type="checkbox" id="agree-linked" />
        I agree to the <a href="/terms-linked">Terms and Conditions</a>.
      </label>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/terms-linked') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Terms and Conditions</h1>
      <p>
        These Terms and Conditions require recurring billing for renewal plans, binding arbitration
        for disputes, a class action waiver, liability limitation, and notice that the company may
        change the agreement unilaterally.
      </p>
      <p>
        By using the service, you accept automatic renewal, recurring billing, binding arbitration,
        and the class action waiver in these Terms and Conditions.
      </p>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/consent-pdf') {
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Checkout</h1>
      <label for="agree-pdf">
        <input type="checkbox" id="agree-pdf" />
        I agree to the <a href="/terms.pdf">PDF Terms and Conditions</a>.
      </label>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/terms.pdf') {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/pdf');
      response.end(Buffer.from(FIXTURE_PDF_BASE64, 'base64'));
      return;
    }

    response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Welcome</h1>
      <p>This page contains marketing copy and product information only.</p>
    </main>
  </body>
</html>`);
  });
}
