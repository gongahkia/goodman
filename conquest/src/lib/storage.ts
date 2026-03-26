import { browserApi, storageArea } from './browser-api'
import { DEFAULT_CONFIG, MAX_LOG_ENTRIES } from './constants'
import { assertAllowedEndpoint, maskEndpointForDisplay } from './endpoint'

import type { ExtensionStorageArea } from './browser-api'
import type { ExtensionConfig, LogEntry, Region, TabAnalysisState } from './types'

export async function getConfig(): Promise<ExtensionConfig> {
  const result = await storageArea.local.get('config')
  const stored = (result.config ?? {}) as Partial<ExtensionConfig>
  const merged = { ...DEFAULT_CONFIG, ...stored }
  const normalized = normalizeConfig(merged)

  if (!configsEqual(merged, normalized)) {
    await storageArea.local.set({ config: normalized })
  }

  return normalized
}

export async function setConfig(partial: Partial<ExtensionConfig>): Promise<void> {
  const current = await getConfig()
  const updated = normalizeConfig({ ...current, ...partial })
  assertAllowedEndpoint(updated.llmEndpoint, {
    allowPublicHosts: updated.llmProvider === 'openai-compatible',
  })
  await storageArea.local.set({ config: updated })
}

export async function getSessionLog(): Promise<LogEntry[]> {
  const result = await storageArea.local.get('session_log')
  return (result.session_log ?? []) as LogEntry[]
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const log = await getSessionLog()
  log.push(entry)
  // Trim oldest entries if exceeding max
  const trimmed = log.length > MAX_LOG_ENTRIES
    ? log.slice(log.length - MAX_LOG_ENTRIES)
    : log
  await storageArea.local.set({ session_log: trimmed })
}

export async function clearSessionLog(): Promise<void> {
  await storageArea.local.set({ session_log: [] })
}

export async function exportSessionLog(): Promise<string> {
  const log = await getSessionLog()
  return JSON.stringify(log, null, 2)
}

export async function getLatestLogEntry(): Promise<LogEntry | undefined> {
  const log = await getSessionLog()
  return log.at(-1)
}

export async function getMaskedConfig(): Promise<ExtensionConfig> {
  const config = await getConfig()
  return {
    ...config,
    llmEndpoint: maskEndpointForDisplay(config.llmEndpoint),
  }
}

export async function getSavedRegion(domain: string): Promise<Region | undefined> {
  const result = await storageArea.local.get('regions')
  const regions = (result.regions ?? {}) as Record<string, Region>
  return regions[domain]
}

export async function takeSmokeCaptureImage(): Promise<string | undefined> {
  const result = await storageArea.local.get('smoke_capture_image')
  const smokeCaptureImage = result.smoke_capture_image

  if (typeof smokeCaptureImage === 'string') {
    await storageArea.local.remove('smoke_capture_image')
    return smokeCaptureImage
  }

  if (Array.isArray(smokeCaptureImage)) {
    const [nextImage, ...remainingImages] = smokeCaptureImage
      .filter((value): value is string => typeof value === 'string')

    if (!nextImage) {
      await storageArea.local.remove('smoke_capture_image')
      return undefined
    }

    if (remainingImages.length === 0) {
      await storageArea.local.remove('smoke_capture_image')
    } else {
      await storageArea.local.set({ smoke_capture_image: remainingImages })
    }

    return nextImage
  }

  return undefined
}

export async function saveRegion(domain: string, region: Region): Promise<void> {
  const result = await storageArea.local.get('regions')
  const regions = (result.regions ?? {}) as Record<string, Region>
  regions[domain] = region
  await storageArea.local.set({ regions })
}

export async function getTabAnalysisState(
  tabId: number,
  currentTabUrl?: string,
): Promise<TabAnalysisState | undefined> {
  const result = await getTabStateStorageArea().get('tab_analysis_state')
  const tabAnalysisState = (result.tab_analysis_state ?? {}) as Record<string, TabAnalysisState>
  const state = tabAnalysisState[String(tabId)]

  if (!state) return undefined
  if (currentTabUrl && state.tabUrl !== currentTabUrl) return undefined

  return state
}

export async function setTabAnalysisState(
  tabId: number,
  state: TabAnalysisState,
): Promise<void> {
  const result = await getTabStateStorageArea().get('tab_analysis_state')
  const tabAnalysisState = (result.tab_analysis_state ?? {}) as Record<string, TabAnalysisState>
  tabAnalysisState[String(tabId)] = state
  await getTabStateStorageArea().set({ tab_analysis_state: tabAnalysisState })
}

export async function clearTabAnalysisState(tabId: number): Promise<void> {
  const result = await getTabStateStorageArea().get('tab_analysis_state')
  const tabAnalysisState = (result.tab_analysis_state ?? {}) as Record<string, TabAnalysisState>
  delete tabAnalysisState[String(tabId)]
  await getTabStateStorageArea().set({ tab_analysis_state: tabAnalysisState })
}

export async function clearAllTabAnalysisState(): Promise<void> {
  await getTabStateStorageArea().set({ tab_analysis_state: {} })
}

function getTabStateStorageArea(): ExtensionStorageArea {
  return browserApi.storage.session ?? storageArea.local
}

function normalizeConfig(config: ExtensionConfig): ExtensionConfig {
  let normalized = {
    ...config,
    llmApiKey: config.llmApiKey ?? '',
  }

  if (normalized.llmProvider === 'ollama') {
    const legacyModelMap: Record<string, string> = {
      'qwen2.5-vl': 'qwen2.5vl:7b',
      'qwen2.5-vl:7b': 'qwen2.5vl:7b',
    }
    const normalizedModel = legacyModelMap[normalized.llmModel] ?? normalized.llmModel

    if (normalizedModel !== normalized.llmModel) {
      normalized = { ...normalized, llmModel: normalizedModel }
    }

    // Older default timeouts were too short for first-run local vision inference.
    if (normalized.llmTimeoutMs === 30_000) {
      normalized = { ...normalized, llmTimeoutMs: DEFAULT_CONFIG.llmTimeoutMs }
    }
  }

  return normalized
}

function configsEqual(a: ExtensionConfig, b: ExtensionConfig): boolean {
  return a.autoCapture === b.autoCapture
    && a.captureMode === b.captureMode
    && a.keyboardShortcut === b.keyboardShortcut
    && a.llmApiKey === b.llmApiKey
    && a.llmEndpoint === b.llmEndpoint
    && a.llmModel === b.llmModel
    && a.llmProvider === b.llmProvider
    && a.llmTimeoutMs === b.llmTimeoutMs
}
