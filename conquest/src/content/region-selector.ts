import { sendMessage } from '../lib/messages'

import type { Region } from '../lib/types'

interface RegionSelector {
  destroy: () => void
  start: () => void
}

let activeSelector: RegionSelector | null = null

export function startRegionSelection(): void {
  activeSelector?.destroy()

  const selector = createRegionSelector({
    onCancel: () => void cancelSelection(),
    onSelect: (region) => void completeSelection(region),
  })

  activeSelector = selector
  selector.start()
}

async function completeSelection(region: Region): Promise<void> {
  activeSelector?.destroy()
  activeSelector = null
  await sendMessage({
    type: 'REGION_SELECTED',
    payload: {
      region,
      tabUrl: window.location.href,
      triggerSource: 'popup',
    },
  })
}

async function cancelSelection(): Promise<void> {
  activeSelector?.destroy()
  activeSelector = null
  await sendMessage({
    type: 'REGION_SELECTION_CANCELLED',
    payload: null,
  })
}

function createRegionSelector(options: {
  onCancel: () => void
  onSelect: (region: Region) => void
}): RegionSelector {
  let overlay: HTMLDivElement | null = null
  let selectionBox: HTMLDivElement | null = null
  let startX = 0
  let startY = 0
  let selecting = false

  const onMouseDown = (e: MouseEvent): void => {
    selecting = true
    startX = e.clientX
    startY = e.clientY

    if (!selectionBox) {
      selectionBox = document.createElement('div')
      selectionBox.style.cssText = `
        position: fixed;
        border: 2px solid #6c5ce7;
        background: rgba(108, 92, 231, 0.15);
        z-index: 2147483647;
        pointer-events: none;
      `
      document.body.appendChild(selectionBox)
    }
  }

  const onMouseMove = (e: MouseEvent): void => {
    if (!selecting || !selectionBox) return
    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)
    selectionBox.style.left = `${x}px`
    selectionBox.style.top = `${y}px`
    selectionBox.style.width = `${w}px`
    selectionBox.style.height = `${h}px`
  }

  const onMouseUp = (e: MouseEvent): void => {
    if (!selecting) return
    selecting = false

    const x = Math.min(startX, e.clientX)
    const y = Math.min(startY, e.clientY)
    const w = Math.abs(e.clientX - startX)
    const h = Math.abs(e.clientY - startY)

    destroy()

    if (w < 20 || h < 20) {
      options.onCancel()
      return
    }

    const dpr = window.devicePixelRatio || 1
    options.onSelect({
      x: Math.round(x * dpr),
      y: Math.round(y * dpr),
      w: Math.round(w * dpr),
      h: Math.round(h * dpr),
    })
  }

  const onEscape = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return
    destroy()
    options.onCancel()
  }

  function start(): void {
    overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 2147483646;
    `
    document.body.appendChild(overlay)

    document.addEventListener('keydown', onEscape)
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function destroy(): void {
    document.removeEventListener('keydown', onEscape)
    document.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    overlay?.remove()
    selectionBox?.remove()
    overlay = null
    selectionBox = null
    selecting = false
  }

  return { destroy, start }
}
