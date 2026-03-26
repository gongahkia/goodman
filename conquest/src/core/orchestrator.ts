import { captureFullPage, captureRegion } from '../capture/screenshot'
import { detectPlatform } from '../detect/platform'
import { LIVE_CAPTURE_RETRY_OPTIONS } from '../lib/constants'
import { AgentError, ErrorCode, handleError } from '../lib/error-handler'
import { applyBadgeState, buildSuccessBadgeState, ERROR_BADGE_STATE } from '../lib/badge'
import { sendRuntimeMessageBestEffort, sendToTab, sendToTabBestEffort } from '../lib/messages'
import {
  appendLog,
  getConfig,
  getSavedRegion,
  setTabAnalysisState,
} from '../lib/storage'
import { createProvider } from '../llm/factory'
import { withRetry } from '../llm/retry'

import type {
  CapturedImage,
  CaptureMode,
  ExtensionConfig,
  QuizAnalysisResult,
  QuizAnswer,
  Region,
  TriggerSource,
} from '../lib/types'

function buildPrompt(platformHints: string): string {
  return [
    'Analyze this live quiz screenshot quickly.',
    'Always return your best likely answer, even if confidence is low.',
    'Keep reasoning to one short sentence.',
    platformHints,
    'Respond with JSON only: {"answer":"...","confidence":0.0,"reasoning":"...","questionType":"..."}',
  ].join(' ')
}

export async function handleCaptureRequest(
  tabId: number,
  tabUrl: string,
  captureMode: CaptureMode,
  region?: Region,
  triggerSource: TriggerSource = 'popup',
): Promise<void> {
  const { platform, hints } = detectPlatform(tabUrl)
  const startedAt = Date.now()
  let config: ExtensionConfig | undefined
  let analysis: QuizAnalysisResult | undefined

  try {
    // Capture screenshot
    const screenshot = await resolveScreenshot(tabUrl, captureMode, region)

    // Detect platform and build prompt
    const prompt = buildPrompt(hints)

    // Get config and create provider
    config = await getConfig()
    const provider = createProvider(config)

    // Call LLM with retry and timeout
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.llmTimeoutMs)

    let answer: QuizAnswer
    try {
      analysis = await withRetry(
        () => provider.analyzeImage(screenshot, prompt, controller.signal),
        LIVE_CAPTURE_RETRY_OPTIONS,
      )
      answer = analysis.answer
    } finally {
      clearTimeout(timer)
    }

    // The popup/log should still work even if the current tab cannot host the overlay.
    await sendToTabBestEffort(tabId, { type: 'ANSWER_READY', payload: answer })

    // Update badge
    const badgeState = buildSuccessBadgeState(answer.confidence)
    await applyBadgeState(tabId, badgeState)

    const timestamp = Date.now()
    const latencyMs = timestamp - startedAt
    await setTabAnalysisState(tabId, {
      answer,
      badge: badgeState,
      captureMode,
      latencyMs,
      model: config.llmModel,
      parseStrategy: analysis?.parseStrategy,
      platform,
      provider: config.llmProvider,
      tabUrl,
      triggerSource,
      updatedAt: timestamp,
    })
    await sendRuntimeMessageBestEffort({
      type: 'STATUS_CHANGED',
      payload: { tabId },
    })

    // Log to session
    await appendLog({
      answer,
      captureMode,
      latencyMs,
      model: config.llmModel,
      parseStrategy: analysis?.parseStrategy,
      platform,
      provider: config.llmProvider,
      status: 'success',
      timestamp,
      triggerSource,
    })
  } catch (err) {
    const agentErr = handleError(err)
    const userMessage = buildUserMessage(agentErr, config, captureMode)
    console.error(`[conquest] ${agentErr.code}:`, agentErr.message, agentErr.cause)

    await applyBadgeState(tabId, ERROR_BADGE_STATE)
    const latencyMs = Date.now() - startedAt
    await setTabAnalysisState(tabId, {
      badge: ERROR_BADGE_STATE,
      captureMode,
      errorCode: agentErr.code,
      latencyMs,
      model: config?.llmModel,
      platform,
      provider: config?.llmProvider,
      tabUrl,
      triggerSource,
      updatedAt: Date.now(),
    })
    await sendRuntimeMessageBestEffort({
      type: 'STATUS_CHANGED',
      payload: { tabId },
    })

    try {
      await appendLog({
        captureMode,
        errorCode: agentErr.code,
        latencyMs,
        model: config?.llmModel,
        platform,
        provider: config?.llmProvider,
        status: 'error',
        timestamp: Date.now(),
        triggerSource,
        userMessage,
      })
      await sendToTab(tabId, {
        type: 'ERROR',
        payload: { code: agentErr.code, userMessage },
      })
    } catch {
      // Tab may not be available
    }
  }
}

function buildUserMessage(
  error: AgentError,
  config: ExtensionConfig | undefined,
  captureMode: CaptureMode,
): string {
  if (error.code !== ErrorCode.LlmTimeout || !config) {
    return error.userMessage
  }

  if (config.llmProvider === 'ollama') {
    if (captureMode === 'fullpage') {
      return 'Local model timed out on a full-page screenshot. Try Region mode, switch to a smaller vision model like moondream:1.8b, or raise the timeout.'
    }

    return 'Local model timed out on the selected region. Try a tighter region, a smaller vision model like moondream:1.8b, or raise the timeout.'
  }

  return 'Model timed out before it returned an answer. Try Region mode, a faster model, or a higher timeout.'
}

async function resolveScreenshot(
  tabUrl: string,
  captureMode: CaptureMode,
  region?: Region,
): Promise<CapturedImage> {
  if (captureMode === 'fullpage') {
    return captureFullPage()
  }

  if (region) {
    return captureRegion(region)
  }

  try {
    const url = new URL(tabUrl)
    const savedRegion = await getSavedRegion(url.hostname)
    if (savedRegion) {
      return captureRegion(savedRegion)
    }
  } catch {
    // fall through to explicit region error
  }

  throw new AgentError(
    ErrorCode.CaptureFailed,
    'Region capture unavailable: select a region before capturing this page',
  )
}
