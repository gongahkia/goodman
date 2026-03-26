import type { TabAnalysisState } from './types'

export function buildTabAnalysisState(
  state: TabAnalysisState | undefined,
  currentTabUrl?: string,
): TabAnalysisState | undefined {
  if (!state) return undefined
  if (!currentTabUrl) return state
  return state.tabUrl === currentTabUrl ? state : undefined
}
