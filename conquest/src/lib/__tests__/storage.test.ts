import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock chrome.storage.local
const store: Record<string, unknown> = {}

const mockChrome = {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        if (typeof keys === 'string') {
          return { [keys]: store[keys] }
        }
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          result[key] = store[key]
        }
        return result
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items)
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const entries = Array.isArray(keys) ? keys : [keys]
        for (const key of entries) {
          delete store[key]
        }
      }),
    },
    session: undefined as typeof chrome.storage.local | undefined,
  },
}

// Assign mock to global
Object.assign(globalThis, { chrome: mockChrome })

// Import after mocking
const {
  clearTabAnalysisState,
  getConfig,
  setConfig,
  getSessionLog,
    appendLog,
    clearSessionLog,
    exportSessionLog,
    getLatestLogEntry,
    getTabAnalysisState,
    takeSmokeCaptureImage,
    setTabAnalysisState,
  } = await import('../storage')

describe('storage', () => {
  beforeEach(() => {
    // Clear store
    for (const key of Object.keys(store)) {
      delete store[key]
    }
    mockChrome.storage.session = undefined
    vi.clearAllMocks()
  })

  describe('getConfig', () => {
    it('returns defaults when no config stored', async () => {
      const config = await getConfig()
      expect(config.llmApiKey).toBe('')
      expect(config.llmProvider).toBe('ollama')
      expect(config.llmEndpoint).toBe('http://localhost:11434')
      expect(config.llmModel).toBe('qwen2.5vl:7b')
      expect(config.captureMode).toBe('fullpage')
      expect(config.autoCapture).toBe(false)
      expect(config.llmTimeoutMs).toBe(90000)
    })

    it('merges stored values with defaults', async () => {
      store.config = { llmModel: 'llava' }
      const config = await getConfig()
      expect(config.llmModel).toBe('llava')
      expect(config.llmApiKey).toBe('')
      expect(config.llmProvider).toBe('ollama') // default
    })

    it('migrates the legacy Ollama qwen2.5-vl model name', async () => {
      store.config = { llmModel: 'qwen2.5-vl' }

      const config = await getConfig()

      expect(config.llmModel).toBe('qwen2.5vl:7b')
      expect(store.config).toMatchObject({ llmModel: 'qwen2.5vl:7b' })
    })

    it('migrates the legacy 30 second Ollama timeout', async () => {
      store.config = { llmTimeoutMs: 30000 }

      const config = await getConfig()

      expect(config.llmTimeoutMs).toBe(90000)
      expect(store.config).toMatchObject({ llmTimeoutMs: 90000 })
    })
  })

  describe('setConfig', () => {
    it('sets partial config', async () => {
      await setConfig({ captureMode: 'region' })
      const config = await getConfig()
      expect(config.captureMode).toBe('region')
      expect(config.llmProvider).toBe('ollama') // other defaults preserved
    })

    it('allows public endpoints for OpenAI-style APIs', async () => {
      await setConfig({
        llmApiKey: 'test-key',
        llmEndpoint: 'https://api.openai.com',
        llmProvider: 'openai-compatible',
      })

      const config = await getConfig()
      expect(config.llmProvider).toBe('openai-compatible')
      expect(config.llmEndpoint).toBe('https://api.openai.com')
      expect(config.llmApiKey).toBe('test-key')
    })
  })

  describe('session log', () => {
    it('starts empty', async () => {
      const log = await getSessionLog()
      expect(log).toEqual([])
    })

    it('appends entries', async () => {
      await appendLog({
        answer: { answer: 'A', confidence: 0.9, reasoning: '', questionType: 'mc' },
        platform: 'kahoot',
        timestamp: 1000,
      })
      const log = await getSessionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.answer?.answer).toBe('A')
    })

    it('clears log', async () => {
      await appendLog({
        answer: { answer: 'A', confidence: 0.9, reasoning: '', questionType: 'mc' },
        platform: 'kahoot',
        timestamp: 1000,
      })
      await clearSessionLog()
      const log = await getSessionLog()
      expect(log).toHaveLength(0)
    })

    it('exports as JSON', async () => {
      await appendLog({
        answer: { answer: 'B', confidence: 0.8, reasoning: 'test', questionType: 'tf' },
        platform: 'generic',
        timestamp: 2000,
      })
      const json = await exportSessionLog()
      const parsed = JSON.parse(json)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].answer.answer).toBe('B')
    })

    it('trims to 500 max entries', async () => {
      // Pre-fill with 500 entries
      const entries = Array.from({ length: 500 }, (_, i) => ({
        answer: { answer: `A${i}`, confidence: 0.5, reasoning: '', questionType: 'mc' },
        platform: 'generic',
        timestamp: i,
      }))
      store.session_log = entries

      // Add one more
      await appendLog({
        answer: { answer: 'New', confidence: 1, reasoning: '', questionType: 'mc' },
        platform: 'generic',
        timestamp: 999,
      })

      const log = await getSessionLog()
      expect(log).toHaveLength(500)
      // Oldest entry should be gone, newest should be present
      expect(log[log.length - 1]!.answer?.answer).toBe('New')
    })

    it('returns the newest log entry', async () => {
      await appendLog({
        answer: { answer: 'Older', confidence: 0.1, reasoning: '', questionType: 'mc' },
        platform: 'generic',
        timestamp: 1000,
      })
      await appendLog({
        answer: { answer: 'Newer', confidence: 0.9, reasoning: '', questionType: 'mc' },
        captureMode: 'fullpage',
        platform: 'kahoot',
        timestamp: 2000,
      })

      const latest = await getLatestLogEntry()
      expect(latest?.answer?.answer).toBe('Newer')
      expect(latest?.captureMode).toBe('fullpage')
    })
  })

  describe('tab analysis state', () => {
    it('stores and returns matching tab state', async () => {
      await setTabAnalysisState(7, {
        answer: { answer: 'A', confidence: 0.9, reasoning: '', questionType: 'mc' },
        badge: { color: '#00d4aa', text: '90%', variant: 'success' },
        captureMode: 'fullpage',
        platform: 'kahoot',
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      })

      const state = await getTabAnalysisState(7, 'https://kahoot.it/game/123')
      expect(state?.answer?.answer).toBe('A')
    })

    it('suppresses tab state when the current URL no longer matches', async () => {
      await setTabAnalysisState(7, {
        badge: { color: '#e04060', text: '!', variant: 'error' },
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      })

      const state = await getTabAnalysisState(7, 'https://kahoot.it/game/456')
      expect(state).toBeUndefined()
    })

    it('clears tab state', async () => {
      await setTabAnalysisState(7, {
        badge: { color: '#e04060', text: '!', variant: 'error' },
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      })

      await clearTabAnalysisState(7)
      const state = await getTabAnalysisState(7)
      expect(state).toBeUndefined()
    })

    it('prefers session storage for tab analysis state when available', async () => {
      const sessionStore: Record<string, unknown> = {}
      mockChrome.storage.session = {
        get: vi.fn(async (keys: string | string[]) => {
          if (typeof keys === 'string') {
            return { [keys]: sessionStore[keys] }
          }
          const result: Record<string, unknown> = {}
          for (const key of keys) {
            result[key] = sessionStore[key]
          }
          return result
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionStore, items)
        }),
      } as unknown as typeof chrome.storage.local

      await setTabAnalysisState(7, {
        badge: { color: '#e04060', text: '!', variant: 'error' },
        tabUrl: 'https://kahoot.it/game/123',
        updatedAt: 1234,
      })

      expect(sessionStore.tab_analysis_state).toBeDefined()
      expect(store.tab_analysis_state).toBeUndefined()

      mockChrome.storage.session = undefined
    })
  })

  describe('smoke capture queue', () => {
    it('consumes a single smoke capture image and clears the override', async () => {
      store.smoke_capture_image = 'first-image'

      await expect(takeSmokeCaptureImage()).resolves.toBe('first-image')
      await expect(takeSmokeCaptureImage()).resolves.toBeUndefined()
      expect(store.smoke_capture_image).toBeUndefined()
    })

    it('consumes queued smoke capture images in order', async () => {
      store.smoke_capture_image = ['first-image', 'second-image']

      await expect(takeSmokeCaptureImage()).resolves.toBe('first-image')
      expect(store.smoke_capture_image).toEqual(['second-image'])

      await expect(takeSmokeCaptureImage()).resolves.toBe('second-image')
      expect(store.smoke_capture_image).toBeUndefined()
    })
  })
})
