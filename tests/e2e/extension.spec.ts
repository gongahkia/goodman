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

test('persists a ready analysis for a consent-like page visit with the fixture provider', async () => {
  const consentUrl = `${baseUrl}/consent`;
  await configureFixtureProvider();

  const page = await context.newPage();
  await page.goto(consentUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(consentUrl);

  expect(record).toMatchObject({
    status: 'ready',
    sourceType: 'inline',
    detectionType: 'checkbox',
    domain: '127.0.0.1',
    url: consentUrl,
  });

  const summary = record.summary as Record<string, unknown>;
  expect(summary.summary).toContain('renewal and dispute provisions');
  expect(
    (summary.redFlags as Array<{ category: string }>).map((flag) => flag.category)
  ).toEqual([
    'arbitration_clause',
    'class_action_waiver',
    'automatic_renewal',
  ]);
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

test('persists a linked-source analysis for a linked legal page visit', async () => {
  const page = await context.newPage();
  const linkedUrl = `${baseUrl}/consent-linked`;

  await page.goto(linkedUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(linkedUrl);

  expect(record).toMatchObject({
    status: 'needs_provider',
    sourceType: 'linked',
    detectionType: 'checkbox',
    domain: '127.0.0.1',
    url: linkedUrl,
  });

  await page.close();
});

test('persists a pdf-source analysis for a PDF legal page visit', async () => {
  const page = await context.newPage();
  const pdfUrl = `${baseUrl}/consent-pdf`;

  await page.goto(pdfUrl, { waitUntil: 'load' });
  const record = await waitForUrlAnalysis(pdfUrl);

  expect(record).toMatchObject({
    status: 'needs_provider',
    sourceType: 'pdf',
    detectionType: 'checkbox',
    domain: '127.0.0.1',
    url: pdfUrl,
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

async function configureFixtureProvider(): Promise<void> {
  await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        settings: {
          activeProvider: 'fixture',
          providers: {
            openai: { apiKey: '', model: 'gpt-4o' },
            claude: { apiKey: '', model: 'claude-sonnet-4-20250514' },
            gemini: { apiKey: '', model: 'gemini-1.5-pro' },
            ollama: { apiKey: '', model: '', baseUrl: 'http://localhost:11434' },
            custom: { apiKey: '', model: '', baseUrl: '' },
            fixture: { apiKey: '', model: 'fixture-v1' },
          },
          detectionSensitivity: 'normal',
          darkMode: 'auto',
          notifyOnChange: true,
        },
      });
    });
  });
}

async function waitForUrlAnalysis(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await withWorker(async (worker) => {
      return (await worker.evaluate(async (targetUrl) => {
        const { pageAnalysis } = await chrome.storage.local.get(['pageAnalysis']);
        return (pageAnalysis as Record<string, unknown> | undefined)?.[targetUrl] ?? null;
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
        change the agreement unilaterally. These Terms and Conditions also explain that disputes
        are resolved in a specified jurisdiction and that service access may be terminated for
        compliance concerns. These Terms and Conditions apply to every renewal transaction and
        continue until cancelled under the contract rules.
      </p>
      <p>
        By using the service, you accept automatic renewal, recurring billing, binding arbitration,
        and the class action waiver in these Terms and Conditions. The company may revise these
        Terms and Conditions without further notice, and continued use constitutes renewed consent
        to the updated agreement, policies, and dispute handling procedures.
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

    response.statusCode = 404;
    response.end('<!doctype html><html><body><p>Not found</p></body></html>');
  });
}
