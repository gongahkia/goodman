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
import { getDarkPatternFixture } from '../fixtures/dark-pattern-consent';

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
  userDataDir = await mkdtemp(resolve(tmpdir(), 'goodman-e2e-'));
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
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });

  const worker = await getExtensionWorker();
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  if (context) await context.close();
  await closeFixtureServer(fixtureServer);
  await rm(userDataDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
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

test('renders the packaged persistent workspace at its requested route', async () => {
  const workspace = await openExtensionPage('src/popup/index.html?workspace=1&route=history');

  await expect(workspace.locator('.tc-workspace-sidebar')).toBeVisible();
  await expect(workspace.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'History', exact: true })).toHaveAttribute(
    'aria-current',
    'page'
  );

  await workspace.close();
});

test('fresh install requires provider setup on a consent-like page', async () => {
  const consentUrl = `${baseUrl}/consent`;
  const page = await context.newPage();

  await page.goto(consentUrl, { waitUntil: 'load' });
  const gatedRecord = await waitForUrlAnalysis(consentUrl, 'needs_provider');
  expect(gatedRecord).toMatchObject({
    status: 'needs_provider',
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

test('keeps linked and PDF extraction routing working before provider setup', async () => {
  const linkedPage = await context.newPage();
  const linkedUrl = `${baseUrl}/consent-linked`;
  await linkedPage.goto(linkedUrl, { waitUntil: 'load' });
  const linkedRecord = await waitForUrlAnalysis(linkedUrl, 'needs_provider');
  expect(linkedRecord).toMatchObject({
    status: 'needs_provider',
    sourceType: 'linked',
    detectionType: 'checkbox',
  });
  await linkedPage.close();

  const pdfPage = await context.newPage();
  const pdfUrl = `${baseUrl}/consent-pdf`;
  await pdfPage.goto(pdfUrl, { waitUntil: 'load' });
  const pdfRecord = await waitForUrlAnalysis(pdfUrl, 'needs_provider');
  expect(pdfRecord).toMatchObject({
    status: 'needs_provider',
    sourceType: 'pdf',
    detectionType: 'checkbox',
  });
  await pdfPage.close();
});

test('renders a pending tracked-change banner in the popup shell', async () => {
  await withWorker(async (worker) => {
    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        onboardingCompleted: true,
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
  await expect(popup.locator('body')).toContainText('1 domain with T&C changes');
  await expect(popup.locator('body')).toContainText('History');

  await popup.close();
});

test('renders passive dark-pattern badge without intercepting site controls', async () => {
  const page = await context.newPage();
  const badgeUrl = `${baseUrl}/dark-pattern-badge`;

  await page.goto(badgeUrl, { waitUntil: 'load' });
  await expect(page.locator('#goodman-consent-warning-host')).toHaveCount(1);
  await expect(page.locator('.goodman-consent-warning')).toContainText('consent pattern');
  await expect(page.locator('.goodman-consent-warning')).toContainText('Evidence:');

  await page.getByRole('button', { name: 'Accept All Cookies' }).click();
  await expect(page.locator('#site-click-status')).toHaveText('site accept clicked');

  await page.close();
});

test('does not render passive badge for balanced consent controls', async () => {
  const page = await context.newPage();
  const balancedUrl = `${baseUrl}/dark-pattern-balanced`;

  await page.goto(balancedUrl, { waitUntil: 'load' });
  await waitForUrlAnalysis(balancedUrl, 'needs_provider');
  await expect(page.locator('#goodman-consent-warning-host')).toHaveCount(0);

  await page.close();
});

test('asks before provider use, then shows a quiet chip with sourced results', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/consent-linked`;
  await page.goto(url);
  await waitForUrlAnalysis(url, 'needs_consent');
  expect(
    await withWorker((worker) =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('versionHistory')).versionHistory ?? {}
      )
    )
  ).toEqual({});
  await page.locator('#goodman-summary-chip').getByRole('button').click();
  const result = await waitForUrlAnalysis(url, 'ready');
  expect(result.document).toMatchObject({ url: `${baseUrl}/terms-linked`, kind: 'terms' });
  expect(Number(result.confidence)).toBeLessThanOrEqual(1);
  await expect(page.locator('#goodman-overlay-host')).toHaveCount(0);
  await expect(page.locator('#goodman-saul-toast')).toHaveCount(0);
  await page.locator('#goodman-summary-chip').getByRole('button').click();
  await expect(page.locator('#goodman-overlay-host')).toHaveCount(1);
  await page.close();
});

test('manual text bypasses detection and is labeled as an excerpt', async () => {
  await configureFixture('detect_only');
  const page = await context.newPage();
  const url = `${baseUrl}/plain`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'no_detection');
  await withWorker((worker) =>
    worker.evaluate(async ({ tabId }) => {
      return chrome.tabs.sendMessage(
        tabId as number,
        {
          type: 'MANUAL_ANALYSIS',
          payload: {
            text: 'The agreement requires binding arbitration. You accept recurring billing until you cancel the subscription in your account settings.',
          },
        },
        { frameId: 0 }
      );
    }, record)
  );
  const ready = await waitForUrlAnalysis(url, 'ready');
  expect(ready.document).toMatchObject({ kind: 'selection' });
  expect(ready.detectionType).toBe('manual');
  expect(
    await withWorker((worker) =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('versionHistory')).versionHistory ?? {}
      )
    )
  ).toEqual({});
  await page.close();
});

test('associates embedded consent with its parent tab and routes manual review to that frame', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/embedded`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'needs_consent');
  expect(Number(record.frameId)).toBeGreaterThan(0);
  expect(record.sourceFrameUrl).toBe(`${baseUrl}/consent-linked`);
  await withWorker((worker) =>
    worker.evaluate(async ({ tabId, frameId }) => {
      return chrome.tabs.sendMessage(
        tabId as number,
        { type: 'DETECT_TC', payload: { tabId } },
        { frameId: frameId as number }
      );
    }, record)
  );
  const ready = await waitForUrlAnalysis(url, 'ready');
  expect(ready.document).toMatchObject({ url: `${baseUrl}/terms-linked` });
  expect(ready.url).toBe(url);
  await page.close();
});

test('discovers and versions multiple agreements independently', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/multiple`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'needs_consent');
  expect(record.availableDocuments).toHaveLength(2);
  for (const path of ['/terms-linked', '/privacy']) {
    await withWorker((worker) =>
      worker.evaluate(
        async ({ tabId, target }) => {
          return chrome.tabs.sendMessage(
            tabId as number,
            { type: 'MANUAL_ANALYSIS', payload: { url: target } },
            { frameId: 0 }
          );
        },
        { tabId: record.tabId, target: `${baseUrl}${path}` }
      )
    );
    await waitForUrlAnalysis(url, 'ready');
  }
  const history = await withWorker((worker) =>
    worker.evaluate(
      async () => (await chrome.storage.local.get('versionHistory')).versionHistory['127.0.0.1']
    )
  );
  expect(history).toHaveLength(2);
  expect(history.map((entry: { version: number }) => entry.version)).toEqual([1, 1]);
  const ready = await waitForUrlAnalysis(url, 'ready');
  expect(ready.analyzedDocumentIds).toHaveLength(2);
  expect(ready.availableDocuments).toHaveLength(2);
  await page.close();
});

test('supports custom controls, implicit consent, shadow roots and banners in the packaged extension', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  for (const path of [
    '/custom-control',
    '/implicit-control',
    '/shadow-control',
    '/banner-control',
  ]) {
    await page.goto(`${baseUrl}${path}`);
    const record = await waitForUrlAnalysis(`${baseUrl}${path}`, 'needs_consent');
    expect(Number(record.confidence)).toBeLessThanOrEqual(1);
  }
  await page.close();
});

test('keeps narrow navigation named and settings focused during unrelated page updates', async ({}, testInfo) => {
  const workspace = await openExtensionPage('src/popup/index.html?workspace=1&route=providers');
  await workspace.setViewportSize({ width: 380, height: 700 });
  await expect(workspace.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  expect(
    await workspace.locator('body').evaluate((el) => getComputedStyle(el).fontFamily)
  ).toContain('Arial');
  const model = workspace.getByRole('textbox', { name: 'Model', exact: true });
  await model.focus();
  await withWorker((worker) =>
    worker.evaluate(async () => {
      await chrome.storage.local.set({
        pageAnalysis: {
          'https://elsewhere.test/': {
            tabId: 99,
            url: 'https://elsewhere.test/',
            domain: 'elsewhere.test',
            status: 'no_detection',
            sourceType: null,
            detectionType: null,
            confidence: null,
            textHash: null,
            summary: null,
            error: null,
            updatedAt: Date.now(),
          },
        },
      });
    })
  );
  await workspace.waitForTimeout(500);
  await expect(model).toBeFocused();
  await workspace.screenshot({ path: testInfo.outputPath('narrow-providers.png'), fullPage: true });
  await workspace.close();
});

test('honors per-site detect-only over automatic analysis and resumes when changed', async () => {
  await configureFixture('automatic');
  await withWorker((worker) =>
    worker.evaluate(async () => {
      await chrome.storage.sync.set({
        domainPreferences: { '127.0.0.1': { analysisMode: 'detect_only' } },
      });
    })
  );
  const page = await context.newPage();
  const url = `${baseUrl}/consent-linked`;
  await page.goto(url);
  await waitForUrlAnalysis(url, 'needs_consent');
  expect(
    await withWorker((worker) =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('versionHistory')).versionHistory ?? {}
      )
    )
  ).toEqual({});
  await withWorker((worker) =>
    worker.evaluate(async () => {
      await chrome.storage.sync.set({
        domainPreferences: { '127.0.0.1': { analysisMode: 'automatic' } },
      });
    })
  );
  await waitForUrlAnalysis(url, 'ready');
  await page.close();
});

test('analyzes linked PDFs and preserves redirected document identity', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/consent-pdf`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'needs_consent');
  await page.locator('#goodman-summary-chip').getByRole('button').click();
  const pdf = await waitForUrlAnalysis(url, 'ready');
  expect(pdf.sourceType).toBe('pdf');
  expect(pdf.document).toMatchObject({ url: `${baseUrl}/terms.pdf` });
  await withWorker((worker) =>
    worker.evaluate(
      async ({ tabId, target }) => {
        return chrome.tabs.sendMessage(
          tabId as number,
          { type: 'MANUAL_ANALYSIS', payload: { url: target } },
          { frameId: 0 }
        );
      },
      { tabId: record.tabId, target: `${baseUrl}/legal-redirect` }
    )
  );
  const redirected = await waitForUrlAnalysis(url, 'ready');
  expect(redirected.document).toMatchObject({ url: `${baseUrl}/terms-linked` });
  expect(
    (redirected.availableDocuments as Array<{ url: string }>).some((doc) =>
      doc.url.endsWith('/legal-redirect')
    )
  ).toBe(false);
  await page.close();
});

test('keeps a manual excerpt separate from the full terms page', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/terms-full`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'needs_consent');
  await withWorker((worker) =>
    worker.evaluate(async ({ tabId }) => {
      return chrome.tabs.sendMessage(
        tabId as number,
        {
          type: 'MANUAL_ANALYSIS',
          payload: {
            text: 'These terms require recurring billing and binding arbitration for disputes. You can cancel future renewals in account settings.',
          },
        },
        { frameId: 0 }
      );
    }, record)
  );
  const ready = await waitForUrlAnalysis(url, 'ready');
  expect(ready.document).toMatchObject({ kind: 'selection' });
  expect(
    await withWorker((worker) =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('versionHistory')).versionHistory ?? {}
      )
    )
  ).toEqual({});
  await page.close();
});

test('cancels an in-flight download without late results or automatic restarts', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/slow-consent`;
  await page.goto(url);
  const record = await waitForUrlAnalysis(url, 'needs_consent');
  await page.locator('#goodman-summary-chip').getByRole('button').click();
  await waitForUrlAnalysis(url, 'analyzing');
  await withWorker((worker) =>
    worker.evaluate(async ({ tabId }) => {
      return chrome.tabs.sendMessage(
        tabId as number,
        { type: 'CANCEL_TC', payload: { tabId } },
        { frameId: 0 }
      );
    }, record)
  );
  await waitForUrlAnalysis(url, 'cancelled');
  await page.evaluate(() => {
    document.body.append(document.createElement('p'));
  });
  await page.waitForTimeout(3000);
  expect((await waitForUrlAnalysis(url)).status).toBe('cancelled');
  expect(
    await withWorker((worker) =>
      worker.evaluate(
        async () => (await chrome.storage.local.get('versionHistory')).versionHistory ?? {}
      )
    )
  ).toEqual({});
  await page.close();
});

test('restarts detection after navigation interrupts an analysis', async () => {
  await configureFixture('ask');
  const page = await context.newPage();
  const url = `${baseUrl}/slow-consent`;
  await page.goto(url);
  await waitForUrlAnalysis(url, 'needs_consent');
  await page.locator('#goodman-summary-chip').getByRole('button').click();
  await waitForUrlAnalysis(url, 'analyzing');
  await page.evaluate(() => {
    history.pushState({}, '', '/terms-full');
    document.body.innerHTML =
      '<main><h1>Terms and Conditions</h1>' +
      '<p>These terms and conditions require binding arbitration, recurring billing and consent to the privacy policy.</p>'.repeat(
        30
      ) +
      '</main>';
  });
  const next = await waitForUrlAnalysis(`${baseUrl}/terms-full`, 'needs_consent');
  expect(next.document).toMatchObject({ url: `${baseUrl}/terms-full`, kind: 'terms' });
  await page.close();
});

async function configureFixture(analysisMode: string): Promise<void> {
  await withWorker((worker) =>
    worker.evaluate(async (mode) => {
      await chrome.storage.local.set({
        onboardingCompleted: true,
        settings: {
          activeProvider: 'fixture',
          providers: { fixture: { apiKey: '', model: 'fixture-v1' } },
          analysisMode: mode,
        },
      });
    }, analysisMode)
  );
}

async function getExtensionWorker(): Promise<ServiceWorker> {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

async function withWorker<T>(callback: (worker: ServiceWorker) => Promise<T>): Promise<T> {
  return callback(await getExtensionWorker());
}

async function openExtensionPage(path = 'src/popup/index.html'): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${path}`);
  return page;
}

async function waitForUrlAnalysis(url: string, status?: string): Promise<Record<string, unknown>> {
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

async function closeFixtureServer(instance: Server): Promise<void> {
  await new Promise<void>((resolveServer, rejectServer) => {
    instance.close((error) => {
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
    const consent =
      'By continuing, I agree to the terms and conditions and privacy policy. The service requires recurring billing and binding arbitration. Cancellation of automatic subscription renewal is available in account settings.';
    if (path === '/terms-full') {
      response.end(
        `<html lang="en"><main><h1>Terms and Conditions</h1>${('<p>' + consent + '</p>').repeat(20)}</main></html>`
      );
      return;
    }
    if (path === '/legal-redirect') {
      response.writeHead(302, { Location: '/terms-linked' });
      response.end();
      return;
    }
    if (path === '/slow-consent') {
      response.end(
        '<label><input type="checkbox">I agree to the <a href="/slow-terms">Terms and Conditions</a>.</label>'
      );
      return;
    }
    if (path === '/slow-terms') {
      setTimeout(
        () => response.end(`<main><h1>Terms and Conditions</h1><p>${consent}</p></main>`),
        2500
      );
      return;
    }
    if (path === '/embedded') {
      response.end('<h1>Embedded checkout</h1><iframe src="/consent-linked"></iframe>');
      return;
    }
    if (path === '/multiple') {
      response.end(
        '<form><label><input type="checkbox">I agree to the <a href="/terms-linked">Terms and Conditions</a> and <a href="/privacy">Privacy Policy</a>.</label><button>Continue</button></form>'
      );
      return;
    }
    if (path === '/privacy') {
      response.end(
        '<html lang="en"><main><h1>Privacy policy</h1><p>We collect usage data to operate the service. We do not sell personal information. You may request deletion of your account and associated data at any time.</p></main></html>'
      );
      return;
    }
    if (path === '/custom-control') {
      response.end(
        `<form><label><span role="checkbox" aria-checked="false" tabindex="0"></span>${consent}</label><button>Continue</button></form>`
      );
      return;
    }
    if (path === '/implicit-control') {
      response.end(
        `<form><p>${consent}<a href="/terms-linked">Terms</a></p><button>Continue</button></form>`
      );
      return;
    }
    if (path === '/shadow-control') {
      response.end(
        `<div id="host"></div><script>document.querySelector('#host').attachShadow({mode:'open'}).innerHTML = ${JSON.stringify('<label><input type="checkbox">' + consent + '</label>')};</script>`
      );
      return;
    }
    if (path === '/banner-control') {
      response.end(
        `<div class="cookie-banner" style="position:fixed;bottom:0">${consent}<button>Accept</button><button>Reject</button></div>`
      );
      return;
    }

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

    if (path === '/dark-pattern-badge') {
      const fixture = getDarkPatternFixture('accept-all-manage-only');
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Cookie choices</h1>
      ${fixture.html}
      <p id="site-click-status">waiting</p>
      <script>
        document.querySelector('button').addEventListener('click', () => {
          document.getElementById('site-click-status').textContent = 'site accept clicked';
        });
      </script>
    </main>
  </body>
</html>`);
      return;
    }

    if (path === '/dark-pattern-balanced') {
      const fixture = getDarkPatternFixture('accept-all-equal-reject');
      response.end(`<!doctype html>
<html lang="en">
  <body>
    <main>
      <h1>Cookie choices</h1>
      ${fixture.html}
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
