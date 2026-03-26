import {
  AUTO_CAPTURE_COOLDOWN_MS,
  AUTO_CAPTURE_DEBOUNCE_MS,
} from '../lib/constants'
import { sendMessage } from '../lib/messages'
import { getConfig } from '../lib/storage'
import {
  detectPlatform,
  type KnownPlatform,
} from './platform'

interface PlatformTriggerDetector {
  getFingerprint: (root: ParentNode) => string | null
  platform: KnownPlatform
}

interface TriggerDecision {
  retryAfterMs?: number
  shouldTrigger: boolean
}

interface TriggerRuntimeState {
  detector?: PlatformTriggerDetector
  evaluationTimer?: ReturnType<typeof setTimeout>
  initialized: boolean
  lastTriggeredAt: number
  lastTriggeredFingerprint: string | null
  lastUrl: string
  mutationObserver?: MutationObserver
  pending: boolean
}

interface SelectorDetectorConfig {
  containerSelectors?: string[]
  optionSelectors: string[]
  questionSelectors: string[]
}

const runtimeState: TriggerRuntimeState = {
  initialized: false,
  lastTriggeredAt: 0,
  lastTriggeredFingerprint: null,
  lastUrl: window.location.href,
  pending: false,
}

const SELECTOR_DETECTORS: Record<KnownPlatform, SelectorDetectorConfig> = {
  'google-forms': {
    containerSelectors: ['[role="listitem"]'],
    optionSelectors: [
      '[role="radio"] [dir="auto"]',
      '[role="checkbox"] [dir="auto"]',
      '[role="radio"] .aDTYNe',
      '[role="checkbox"] .aDTYNe',
    ],
    questionSelectors: [
      '.M7eMe',
      '[jsname="jynDCd"]',
    ],
  },
  'kahoot': {
    optionSelectors: [
      '[data-functional-selector*="answer"]',
      '[data-testid*="answer"]',
      'button[class*="answer"]',
    ],
    questionSelectors: [
      '[data-functional-selector="question-block-title"]',
      '[data-functional-selector="block-title"]',
      '[data-testid*="question"] h1',
      '[data-testid*="question"] h2',
      'main h1',
      'main h2',
    ],
  },
  'mentimeter': {
    optionSelectors: [
      '[data-testid*="option"]',
      '[data-testid*="answer"]',
      'button',
      '[role="button"]',
      'label',
    ],
    questionSelectors: [
      '[data-testid*="question"]',
      '.presentation__title',
      'main h1',
      'main h2',
    ],
  },
  'slido': {
    optionSelectors: [
      '[data-testid*="option"]',
      '[data-testid*="answer"]',
      'button',
      '[role="button"]',
      'label',
    ],
    questionSelectors: [
      '[data-testid*="question"]',
      '[data-testid*="poll-question"]',
      'main h1',
      'main h2',
    ],
  },
  'wooclap': {
    optionSelectors: [
      '[data-testid*="choice"]',
      '[data-testid*="answer"]',
      'button',
      '[role="button"]',
      'label',
    ],
    questionSelectors: [
      '[data-testid*="question"]',
      '.question-title',
      'main h1',
      'main h2',
    ],
  },
}

export function setupAutoCapture(): void {
  if (!runtimeState.initialized) {
    runtimeState.initialized = true
    setupNavigationListener()
  }

  void checkAutoCapture()
}

export async function checkAutoCapture(): Promise<void> {
  const config = await getConfig()
  const detector = config.autoCapture
    ? getPlatformTriggerDetector(window.location.href)
    : null

  runtimeState.detector = detector ?? undefined

  if (!detector) {
    disconnectMutationObserver()
    clearEvaluationTimer()
    return
  }

  ensureMutationObserver()
  scheduleFingerprintEvaluation(0)
}

export function extractQuestionFingerprint(
  platform: KnownPlatform,
  root: ParentNode = document,
): string | null {
  const detector = PLATFORM_TRIGGER_DETECTORS[platform]
  return detector?.getFingerprint(root) ?? null
}

export function shouldTriggerFingerprint(
  fingerprint: string | null,
  state: Pick<TriggerRuntimeState, 'lastTriggeredAt' | 'lastTriggeredFingerprint'>,
  now = Date.now(),
  cooldownMs = AUTO_CAPTURE_COOLDOWN_MS,
): TriggerDecision {
  if (!fingerprint) {
    return { shouldTrigger: false }
  }

  if (fingerprint === state.lastTriggeredFingerprint) {
    return { shouldTrigger: false }
  }

  const elapsed = now - state.lastTriggeredAt
  if (elapsed < cooldownMs) {
    return {
      retryAfterMs: cooldownMs - elapsed,
      shouldTrigger: false,
    }
  }

  return { shouldTrigger: true }
}

function getPlatformTriggerDetector(url: string): PlatformTriggerDetector | null {
  const { platform } = detectPlatform(url)
  if (platform === 'generic') return null
  return PLATFORM_TRIGGER_DETECTORS[platform]
}

const PLATFORM_TRIGGER_DETECTORS = Object.fromEntries(
  Object.entries(SELECTOR_DETECTORS).map(([platform, config]) => [
    platform,
    createSelectorDetector(platform as KnownPlatform, config),
  ]),
) as Record<KnownPlatform, PlatformTriggerDetector>

function createSelectorDetector(
  platform: KnownPlatform,
  config: SelectorDetectorConfig,
): PlatformTriggerDetector {
  return {
    platform,
    getFingerprint(root) {
      const scope = findScope(root, config)
      const questionParts = findVisibleTexts(scope, config.questionSelectors, 2)
      if (questionParts.length === 0) return null

      const optionParts = findVisibleTexts(scope, config.optionSelectors, 6)
      return buildFingerprint(questionParts, optionParts)
    },
  }
}

function findScope(
  root: ParentNode,
  config: SelectorDetectorConfig,
): ParentNode {
  if (!config.containerSelectors || config.containerSelectors.length === 0) {
    return root
  }

  for (const selector of config.containerSelectors) {
    const candidates = Array.from(root.querySelectorAll(selector))
    const match = candidates.find((candidate) => {
      if (!isElementVisible(candidate)) return false
      const questionTexts = findVisibleTexts(candidate, config.questionSelectors, 1)
      return questionTexts.length > 0
    })
    if (match) return match
  }

  return root
}

function findVisibleTexts(
  root: ParentNode,
  selectors: string[],
  limit: number,
): string[] {
  const texts: string[] = []
  const seen = new Set<string>()

  for (const selector of selectors) {
    const elements = Array.from(root.querySelectorAll(selector))
    for (const element of elements) {
      if (!isElementVisible(element)) continue
      const normalized = normalizeText(element.textContent ?? '')
      if (!normalized || seen.has(normalized)) continue

      seen.add(normalized)
      texts.push(normalized)

      if (texts.length >= limit) {
        return texts
      }
    }
  }

  return texts
}

function buildFingerprint(questionParts: string[], optionParts: string[]): string {
  const question = questionParts.join(' ').trim()
  const options = optionParts.join(' | ').trim()
  return options ? `${question} :: ${options}` : question
}

function normalizeText(text: string): string {
  return text
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\bquestion\s+\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function isElementVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return true

  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false
  }

  return element.getClientRects().length === 0 || element.offsetParent !== null
}

function clearEvaluationTimer(): void {
  if (runtimeState.evaluationTimer) {
    clearTimeout(runtimeState.evaluationTimer)
    runtimeState.evaluationTimer = undefined
  }
}

function scheduleFingerprintEvaluation(delayMs = AUTO_CAPTURE_DEBOUNCE_MS): void {
  clearEvaluationTimer()
  runtimeState.evaluationTimer = setTimeout(() => {
    runtimeState.evaluationTimer = undefined
    void evaluateQuestionState()
  }, delayMs)
}

async function evaluateQuestionState(): Promise<void> {
  const detector = runtimeState.detector
  if (!detector || runtimeState.pending) return

  const fingerprint = detector.getFingerprint(document)
  const decision = shouldTriggerFingerprint(fingerprint, runtimeState)

  if (!decision.shouldTrigger) {
    if (decision.retryAfterMs !== undefined) {
      scheduleFingerprintEvaluation(decision.retryAfterMs)
    }
    return
  }

  runtimeState.lastTriggeredAt = Date.now()
  runtimeState.lastTriggeredFingerprint = fingerprint
  runtimeState.pending = true

  try {
    await sendMessage({
      type: 'START_CAPTURE',
      payload: {
        mode: 'default',
        triggerSource: 'platform-auto',
      },
    })
  } finally {
    runtimeState.pending = false
    scheduleFingerprintEvaluation(0)
  }
}

function ensureMutationObserver(): void {
  if (runtimeState.mutationObserver || !document.body) return

  runtimeState.mutationObserver = new MutationObserver(() => {
    scheduleFingerprintEvaluation()
  })

  runtimeState.mutationObserver.observe(document.body, {
    characterData: true,
    childList: true,
    subtree: true,
  })
}

function disconnectMutationObserver(): void {
  runtimeState.mutationObserver?.disconnect()
  runtimeState.mutationObserver = undefined
}

function resetTriggerState(): void {
  runtimeState.lastTriggeredAt = 0
  runtimeState.lastTriggeredFingerprint = null
  runtimeState.pending = false
  clearEvaluationTimer()
}

function setupNavigationListener(): void {
  const notifyNavigation = (): void => {
    if (window.location.href === runtimeState.lastUrl) return
    runtimeState.lastUrl = window.location.href
    resetTriggerState()
    void checkAutoCapture()
  }

  window.addEventListener('hashchange', notifyNavigation)
  window.addEventListener('popstate', notifyNavigation)

  const originalPushState = history.pushState.bind(history)
  history.pushState = ((...args: Parameters<History['pushState']>) => {
    const result = originalPushState(...args)
    notifyNavigation()
    return result
  }) as History['pushState']

  const originalReplaceState = history.replaceState.bind(history)
  history.replaceState = ((...args: Parameters<History['replaceState']>) => {
    const result = originalReplaceState(...args)
    notifyNavigation()
    return result
  }) as History['replaceState']
}
