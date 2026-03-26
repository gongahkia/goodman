import type { CaptureMode, CaptureTriggerMode } from '../lib/types'

export function resolveRequestedCaptureMode(
  requestedMode: CaptureTriggerMode,
  configuredMode: CaptureMode,
): CaptureMode {
  return requestedMode === 'default' ? configuredMode : requestedMode
}

export function shouldPromptForRegionSelection(
  requestedMode: CaptureTriggerMode,
  configuredMode: CaptureMode,
  hasSavedRegion: boolean,
): boolean {
  if (requestedMode === 'region') return true
  return resolveRequestedCaptureMode(requestedMode, configuredMode) === 'region' && !hasSavedRegion
}
