import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

import { chromium, firefox } from 'playwright'

const browserTarget = process.argv[2] ?? 'chromium'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(repoRoot, 'dist')
const outputDir = path.join(repoRoot, 'output', 'playwright')
const firefoxAddonPath = path.join(repoRoot, 'conquest-firefox.xpi')
const smokePort = 11434
const fixtureUrl = `http://kahoot.it.lvh.me:${smokePort}/fixtures/kahoot`

const analysisResponses = [
  {
    answer: 'Mercury',
    confidence: 0.44,
    questionType: 'multiple-choice',
    reasoning: 'Fast guess based on the closest-planet prompt.',
  },
  {
    answer: 'Venus',
    confidence: 0.31,
    questionType: 'multiple-choice',
    reasoning: 'Low-confidence fallback after the question changed.',
  },
]

await main()

async function main() {
  const server = await startSmokeServer(smokePort)
  const userDataDir = await mkdtemp(path.join(tmpdir(), `conquest-smoke-${browserTarget}-`))

  try {
    const context = await launchContext(userDataDir)

    try {
      const fixturePage = await context.newPage()
      await fixturePage.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
      await fixturePage.waitForLoadState('networkidle')

      const extensionOrigin = await resolveExtensionOrigin(context)
      const controlPage = await openExtensionPage(context, extensionOrigin)

      try {
        const fixtureTabId = await controlPage.evaluate(async (expectedUrl) => {
          const tabs = await chrome.tabs.query({})
          return tabs.find((tab) => tab.url === expectedUrl)?.id ?? null
        }, fixtureUrl)

        if (fixtureTabId === null) {
          throw new Error(`Could not resolve fixture tab id for ${fixtureUrl}`)
        }

        await controlPage.evaluate(async () => {
          await chrome.storage.local.set({
            smoke_capture_image: [
              'iVBORw0KGgoAAAANSUhEUg==',
              'iVBORw0KGgoAAAANSUhEUg==',
            ],
          })
        })

        await fixturePage.bringToFront()
        await controlPage.evaluate((tabId) => {
          return chrome.runtime.sendMessage({
            type: 'START_CAPTURE',
            payload: {
              mode: 'region',
              tabId,
              triggerSource: 'popup',
            },
          })
        }, fixtureTabId)
        await pause(500)
        await fixturePage.keyboard.press('Escape')
        await fixturePage.waitForFunction(() => Boolean(document.getElementById('conquest-overlay-host')))

        const logCountAfterCancel = await controlPage.evaluate(async () => {
          const result = await chrome.storage.local.get('session_log')
          return (result.session_log ?? []).length
        })
        if (logCountAfterCancel !== 0) {
          throw new Error(`Expected region cancel to keep session log empty, got ${logCountAfterCancel}`)
        }

        await fixturePage.bringToFront()
        await controlPage.evaluate((tabId) => {
          return chrome.runtime.sendMessage({
            type: 'START_CAPTURE',
            payload: {
              mode: 'fullpage',
              tabId,
              triggerSource: 'popup',
            },
          })
        }, fixtureTabId)
        await fixturePage.waitForFunction(() => Boolean(document.getElementById('conquest-overlay-host')))

        await waitForStatus(controlPage, fixtureTabId, (status) => {
          return status?.lastAnswer?.answer === 'Mercury'
            && status.providerStatus === 'connected'
        })

        await controlPage.evaluate(async () => {
          const result = await chrome.storage.local.get('config')
          await chrome.storage.local.set({
            config: {
              ...(result.config ?? {}),
              autoCapture: true,
            },
          })
          await chrome.runtime.sendMessage({
            type: 'CONFIG_UPDATED',
            payload: { autoCapture: true },
          })
        })

        await fixturePage.bringToFront()
        await fixturePage.locator('#next-question').click()

        await waitForStatus(controlPage, fixtureTabId, (status) => {
          return status?.lastAnswer?.answer === 'Venus'
            && status.lastTriggerSource === 'platform-auto'
        })

        const finalLogCount = await controlPage.evaluate(async () => {
          const result = await chrome.storage.local.get('session_log')
          return (result.session_log ?? []).length
        })
        if (finalLogCount < 2) {
          throw new Error(`Expected at least 2 session log entries, got ${finalLogCount}`)
        }

        await mkdir(outputDir, { recursive: true })
        await controlPage.screenshot({
          path: path.join(outputDir, `smoke-${browserTarget}-popup.png`),
        })
        await fixturePage.screenshot({
          path: path.join(outputDir, `smoke-${browserTarget}-fixture.png`),
        })
      } finally {
        await controlPage.close()
      }
    } finally {
      await context.close()
    }
  } finally {
    server.close()
    await rm(userDataDir, { force: true, recursive: true })
  }
}

async function launchContext(userDataDir) {
  if (browserTarget === 'firefox') {
    return firefox.launchPersistentContext(userDataDir, {
      args: ['-install-addon', firefoxAddonPath],
      firefoxUserPrefs: {
        'extensions.autoDisableScopes': 0,
        'extensions.enabledScopes': 15,
        'xpinstall.signatures.required': false,
      },
      headless: false,
    })
  }

  return chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${distDir}`,
      `--load-extension=${distDir}`,
    ],
    headless: false,
  })
}

async function resolveExtensionOrigin(context) {
  if (browserTarget === 'chromium') {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const worker = context.serviceWorkers()[0]
      if (worker) {
        const url = new URL(worker.url())
        return `${url.protocol}//${url.host}`
      }

      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    throw new Error('Could not resolve Chromium extension origin')
  }

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const extensionPage = context.pages().find((page) => page.url().startsWith('moz-extension://'))
    if (extensionPage) {
      const url = new URL(extensionPage.url())
      return `${url.protocol}//${url.host}`
    }

    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error('Could not resolve Firefox extension origin')
}

async function startSmokeServer(port) {
  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400).end('Missing URL')
      return
    }

    if (req.method === 'GET' && req.url === '/fixtures/kahoot') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(buildFixturePage())
      return
    }

    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        models: [{ name: 'qwen2.5-vl:7b', details: { families: ['clip'] } }],
      }))
      return
    }

    if (req.method === 'POST' && req.url === '/api/generate') {
      const response = analysisResponses.shift() ?? {
        answer: 'Fallback',
        confidence: 0.11,
        questionType: 'multiple-choice',
        reasoning: 'Fallback response after the scripted queue was exhausted.',
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        response: JSON.stringify(response),
      }))
      return
    }

    res.writeHead(404).end('Not found')
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => resolve())
  })

  return server
}

async function waitForStatus(controlPage, fixtureTabId, predicate) {
  const deadline = Date.now() + 30000
  let lastStatus = null

  while (Date.now() < deadline) {
    const status = await controlPage.evaluate(async (tabId) => {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STATUS',
        payload: { tabId },
      })
      return response?.type === 'STATUS' ? response.payload : null
    }, fixtureTabId)
    lastStatus = status

    if (predicate(status)) {
      return status
    }

    await pause(250)
  }

  const latestLogEntry = await controlPage.evaluate(async () => {
    const result = await chrome.storage.local.get('session_log')
    return (result.session_log ?? []).at(-1) ?? null
  }).catch(() => null)

  throw new Error(
    `Timed out waiting for background status update: ${JSON.stringify({
      lastStatus,
      latestLogEntry,
    })}`,
  )
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function openExtensionPage(context, extensionOrigin) {
  const page = await context.newPage()
  await page.goto(`${extensionOrigin}/src/options/options.html`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('#provider-select')
  return page
}

function buildFixturePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Conquest Smoke Fixture</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #151725;
      color: #f7f7fb;
    }
    main {
      max-width: 920px;
      margin: 40px auto;
      padding: 32px;
      background: #1f2234;
      border-radius: 20px;
    }
    h1 {
      margin-bottom: 24px;
      font-size: 32px;
    }
    .answers {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .answer-btn, #next-question {
      border: none;
      border-radius: 16px;
      padding: 18px 20px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
    }
    .answer-btn {
      background: #2b3050;
      color: #f7f7fb;
      min-height: 88px;
    }
    #next-question {
      background: #6c5ce7;
      color: #fff;
    }
  </style>
</head>
<body>
  <main>
    <h1 data-functional-selector="question-block-title">What planet is closest to the sun?</h1>
    <div class="answers">
      <button class="answer-btn" data-functional-selector="answer-0">Mercury</button>
      <button class="answer-btn" data-functional-selector="answer-1">Venus</button>
      <button class="answer-btn" data-functional-selector="answer-2">Mars</button>
      <button class="answer-btn" data-functional-selector="answer-3">Jupiter</button>
    </div>
    <button id="next-question" type="button">Next Question</button>
  </main>
  <script>
    const questionEl = document.querySelector('[data-functional-selector="question-block-title"]')
    const answerEls = Array.from(document.querySelectorAll('[data-functional-selector^="answer-"]'))
    const nextQuestionBtn = document.getElementById('next-question')

    nextQuestionBtn.addEventListener('click', () => {
      questionEl.textContent = 'Which planet is known as the morning star?'
      const answers = ['Saturn', 'Venus', 'Uranus', 'Neptune']
      answerEls.forEach((element, index) => {
        element.textContent = answers[index]
      })
    })
  </script>
</body>
</html>`
}
