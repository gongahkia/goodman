import { browserApi, storageArea } from '../lib/browser-api'
import { sendMessage } from '../lib/messages'

import type { Message } from '../lib/messages'
import type { QuizAnswer, StatusPayload } from '../lib/types'

const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement
const statusDot = document.getElementById('status-dot') as HTMLSpanElement
const statusText = document.getElementById('status-text') as HTMLSpanElement
const answerCard = document.getElementById('answer-card') as HTMLDivElement
const answerEmpty = document.getElementById('answer-empty') as HTMLDivElement
const answerText = document.getElementById('answer-text') as HTMLDivElement
const confidenceBadge = document.getElementById('confidence-badge') as HTMLSpanElement
const platformChip = document.getElementById('platform-chip') as HTMLSpanElement
const logCountChip = document.getElementById('log-count-chip') as HTMLButtonElement
const logCount = document.getElementById('log-count') as HTMLSpanElement
const errorBanner = document.getElementById('error-banner') as HTMLDivElement
const captureFullpageBtn = document.getElementById('capture-fullpage-btn') as HTMLButtonElement
const captureRegionBtn = document.getElementById('capture-region-btn') as HTMLButtonElement
const captureLoading = document.getElementById('capture-loading') as HTMLDivElement
const captureLoadingTitle = document.getElementById('capture-loading-title') as HTMLDivElement
const captureLoadingText = document.getElementById('capture-loading-text') as HTMLDivElement

let capturePending = false

settingsBtn.addEventListener('click', () => {
  browserApi.runtime.openOptionsPage()
})

captureFullpageBtn.addEventListener('click', async () => {
  const activeTabId = await getActiveTabId()
  setCapturePending('fullpage')
  try {
    await sendMessage({
      type: 'START_CAPTURE',
      payload: { mode: 'fullpage', tabId: activeTabId, triggerSource: 'popup' },
    })
  } catch (err) {
    clearCapturePending()
    showErrorBanner(err instanceof Error ? err.message : 'Capture failed to start')
  }
})

captureRegionBtn.addEventListener('click', async () => {
  const activeTabId = await getActiveTabId()
  setCapturePending('region')
  try {
    await sendMessage({
      type: 'START_CAPTURE',
      payload: { mode: 'region', tabId: activeTabId, triggerSource: 'popup' },
    })
  } catch (err) {
    clearCapturePending()
    showErrorBanner(err instanceof Error ? err.message : 'Capture failed to start')
  }
})

logCountChip.addEventListener('click', () => {
  const url = browserApi.runtime.getURL('src/options/options.html#log-section')
  void browserApi.tabs.create({ url })
})

function updateStatus(status: StatusPayload): void {
  if (status.captureInProgress) {
    setCapturePending(status.pendingCaptureMode ?? 'fullpage')
  } else {
    clearCapturePending()
  }
  updateStatusChip(status)
  updatePlatformChip(status.lastPlatform)
  if (status.lastAnswer) {
    displayAnswer(status.lastAnswer)
  } else {
    clearDisplayedAnswer()
  }
}

function updateStatusChip(status: StatusPayload): void {
  const label = formatProviderStatus(status.providerStatus)
  statusText.textContent = `${status.modelName}, ${status.providerName} · ${label}`
  statusText.title = status.providerErrorMessage ?? ''
  if (status.providerStatus === 'connected') {
    statusDot.className = 'cq-status-dot cq-status-dot--connected'
  } else if (status.providerStatus === 'timed_out') {
    statusDot.className = 'cq-status-dot cq-status-dot--warning'
  } else {
    statusDot.className = 'cq-status-dot'
  }
}

function updatePlatformChip(platform?: string): void {
  if (platform) {
    platformChip.textContent = platform
    platformChip.hidden = false
  } else {
    platformChip.hidden = true
  }
}

function displayAnswer(answer: QuizAnswer): void {
  answerCard.hidden = false
  answerEmpty.hidden = true
  answerText.textContent = answer.answer
  const pct = Math.round(answer.confidence * 100)
  const level = answer.confidence > 0.8 ? 'high'
    : answer.confidence > 0.5 ? 'medium' : 'low'
  confidenceBadge.textContent = `${pct}%`
  confidenceBadge.className = `cq-confidence-badge cq-confidence-badge--${level}`
}

function clearDisplayedAnswer(): void {
  answerCard.hidden = true
  answerEmpty.hidden = false
  answerText.textContent = ''
  confidenceBadge.textContent = ''
  confidenceBadge.className = 'cq-confidence-badge'
}

function showErrorBanner(message: string): void {
  errorBanner.textContent = message
  errorBanner.hidden = false
  setTimeout(() => {
    errorBanner.hidden = true
  }, 5000)
}

function setCapturePending(captureMode: 'fullpage' | 'region'): void {
  capturePending = true
  captureLoading.hidden = false
  captureFullpageBtn.disabled = true
  captureRegionBtn.disabled = true
  captureLoadingTitle.textContent = captureMode === 'region'
    ? 'Analyzing selected region...'
    : 'Analyzing visible page...'
  captureLoadingText.textContent = captureMode === 'region'
    ? 'Region captured. Waiting for the model to finish.'
    : 'Screenshot captured. Waiting for the model to finish.'
}

function clearCapturePending(): void {
  if (!capturePending) return
  capturePending = false
  captureLoading.hidden = true
  captureFullpageBtn.disabled = false
  captureRegionBtn.disabled = false
}

browserApi.runtime.onMessage.addListener((message: Message) => {
  if (message.type === 'STATUS_CHANGED') {
    void refreshStatusForTab(message.payload.tabId)
  } else if (message.type === 'ERROR') {
    showErrorBanner(message.payload.userMessage)
  }
})

async function refreshStatus(): Promise<void> {
  try {
    const activeTabId = await getActiveTabId()
    await refreshStatusForTab(activeTabId)
  } catch (err) {
    console.error('[conquest] popup init error:', err)
  }
}

async function refreshStatusForTab(tabId: number | null): Promise<void> {
  const activeTabId = await getActiveTabId()
  if (tabId !== activeTabId) return
  const response = await sendMessage({
    type: 'GET_STATUS',
    payload: { tabId: activeTabId },
  })
  if (response?.type === 'STATUS') {
    updateStatus(response.payload)
  }
}

function formatProviderStatus(providerStatus: StatusPayload['providerStatus']): string {
  switch (providerStatus) {
    case 'connected':
      return 'healthy'
    case 'misconfigured':
      return 'misconfigured'
    case 'timed_out':
      return 'timed out'
    case 'unavailable':
      return 'unavailable'
  }
}

async function getActiveTabId(): Promise<number | null> {
  const [activeTab] = await browserApi.tabs.query({ active: true, currentWindow: true })
  return activeTab?.id ?? null
}

async function refreshLogCount(): Promise<void> {
  try {
    const result = await storageArea.local.get('session_log')
    const log = (result.session_log ?? []) as unknown[]
    logCount.textContent = String(log.length)
  } catch {
    // ignore
  }
}

async function init(): Promise<void> {
  clearCapturePending()
  void refreshStatus()
  void refreshLogCount()
}

init()
