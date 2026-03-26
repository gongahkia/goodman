import type { CaptureMode, QuizAnswer } from '../lib/types'

import overlayStyles from './overlay.css?inline'

let overlayHost: HTMLDivElement | null = null
let shadowRoot: ShadowRoot | null = null
let overlayEl: HTMLDivElement | null = null
let isDragging = false
let dragOffsetX = 0
let dragOffsetY = 0

function ensureShadowDom(): { shadow: ShadowRoot, overlay: HTMLDivElement } {
  if (overlayHost && shadowRoot && overlayEl) {
    return { shadow: shadowRoot, overlay: overlayEl }
  }

  overlayHost = document.createElement('div')
  overlayHost.id = 'conquest-overlay-host'
  shadowRoot = overlayHost.attachShadow({ mode: 'closed' })

  // Inject styles
  const style = document.createElement('style')
  style.textContent = overlayStyles
  shadowRoot.appendChild(style)

  // Create overlay container
  overlayEl = document.createElement('div')
  overlayEl.className = 'cq-overlay cq-overlay--hidden'
  shadowRoot.appendChild(overlayEl)

  document.body.appendChild(overlayHost)

  return { shadow: shadowRoot, overlay: overlayEl }
}

function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence > 0.8) return 'high'
  if (confidence > 0.5) return 'medium'
  return 'low'
}

export function showOverlay(answer: QuizAnswer, platform?: string): void {
  const { overlay } = ensureShadowDom()
  const level = getConfidenceLevel(answer.confidence)
  const pct = Math.round(answer.confidence * 100)
  const platformBadge = platform && platform !== 'generic'
    ? `<div class="cq-overlay__platform">${escapeHtml(platform)}</div>`
    : ''

  overlay.innerHTML = `
    <div class="cq-overlay__header">
      <div class="cq-overlay__brand">
        <div class="cq-overlay__brand-mark"></div>
        <div class="cq-overlay__brand-name">Conquest</div>
      </div>
      <div class="cq-overlay__header-actions">
        <div class="cq-overlay__drag-handle"></div>
        <button class="cq-overlay__close-btn" aria-label="Close">×</button>
      </div>
    </div>
    <div class="cq-overlay__meta-row">
      <div class="cq-overlay__badge">${escapeHtml(answer.questionType)}</div>
      ${platformBadge}
    </div>
    <div class="cq-overlay__answer-text">${escapeHtml(answer.answer)}</div>
    <div class="cq-overlay__confidence">
      <div class="cq-overlay__confidence-bar">
        <div class="cq-overlay__confidence-fill cq-overlay__confidence-fill--${level}" style="--cq-bar-width: ${pct}%"></div>
      </div>
      <span class="cq-overlay__confidence-pct cq-overlay__confidence-pct--${level}">${pct}%</span>
    </div>
    ${answer.reasoning ? `
      <details class="cq-overlay__reasoning">
        <summary>Reasoning</summary>
        <div class="cq-overlay__reasoning-text">${escapeHtml(answer.reasoning)}</div>
      </details>
    ` : ''}
  `

  overlay.className = 'cq-overlay cq-overlay--entering'

  // Setup close button
  const closeBtn = overlay.querySelector('.cq-overlay__close-btn')
  closeBtn?.addEventListener('click', () => hideOverlay())

  // Setup drag
  const dragHandle = overlay.querySelector('.cq-overlay__drag-handle')
  dragHandle?.addEventListener('mousedown', onDragStart as EventListener)

  // Escape key to close
  document.addEventListener('keydown', onEscapeKey)
}

export function showLoading(captureMode: CaptureMode): void {
  const { overlay } = ensureShadowDom()
  const loadingLabel = captureMode === 'region'
    ? 'Analyzing selected region'
    : 'Analyzing visible page'
  const loadingDetail = captureMode === 'region'
    ? 'Region captured. Waiting for the model to finish.'
    : 'Screenshot captured. Waiting for the model to finish.'

  overlay.innerHTML = `
    <div class="cq-overlay__header">
      <div class="cq-overlay__brand">
        <div class="cq-overlay__brand-mark"></div>
        <div class="cq-overlay__brand-name">Conquest</div>
      </div>
      <div class="cq-overlay__header-actions">
        <div class="cq-overlay__drag-handle"></div>
        <button class="cq-overlay__close-btn" aria-label="Close">×</button>
      </div>
    </div>
    <div class="cq-overlay__meta-row">
      <div class="cq-overlay__badge">Analyzing</div>
    </div>
    <div class="cq-overlay__loading">
      <div class="cq-overlay__spinner" aria-hidden="true"></div>
      <div class="cq-overlay__loading-copy">
        <div class="cq-overlay__loading-title">${escapeHtml(loadingLabel)}</div>
        <div class="cq-overlay__loading-text">${escapeHtml(loadingDetail)}</div>
      </div>
    </div>
  `

  overlay.className = 'cq-overlay cq-overlay--entering cq-overlay--loading'

  const closeBtn = overlay.querySelector('.cq-overlay__close-btn')
  closeBtn?.addEventListener('click', () => hideOverlay())

  const dragHandle = overlay.querySelector('.cq-overlay__drag-handle')
  dragHandle?.addEventListener('mousedown', onDragStart as EventListener)

  document.addEventListener('keydown', onEscapeKey)
}

export function showError(userMessage: string): void {
  const { overlay } = ensureShadowDom()

  overlay.innerHTML = `
    <div class="cq-overlay__header">
      <div class="cq-overlay__brand">
        <div class="cq-overlay__brand-mark"></div>
        <div class="cq-overlay__brand-name">Conquest</div>
      </div>
      <div class="cq-overlay__header-actions">
        <button class="cq-overlay__close-btn" aria-label="Close">×</button>
      </div>
    </div>
    <div class="cq-overlay__meta-row">
      <div class="cq-overlay__badge cq-overlay__badge--error">Error</div>
    </div>
    <div class="cq-overlay__error-text">${escapeHtml(userMessage)}</div>
  `

  overlay.className = 'cq-overlay cq-overlay--entering cq-overlay--error'

  const closeBtn = overlay.querySelector('.cq-overlay__close-btn')
  closeBtn?.addEventListener('click', () => hideOverlay())

  document.addEventListener('keydown', onEscapeKey)

  // Auto-dismiss after 5s
  setTimeout(() => hideOverlay(), 5000)
}

export function hideOverlay(): void {
  if (!overlayEl) return

  overlayEl.className = 'cq-overlay cq-overlay--exiting'
  document.removeEventListener('keydown', onEscapeKey)

  setTimeout(() => {
    if (overlayEl) {
      overlayEl.className = 'cq-overlay cq-overlay--hidden'
    }
  }, 350) // match transition-slow
}

function onEscapeKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    hideOverlay()
  }
}

function onDragStart(e: MouseEvent): void {
  if (!overlayEl) return
  isDragging = true
  overlayEl.classList.add('is-dragging')
  const rect = overlayEl.getBoundingClientRect()
  dragOffsetX = e.clientX - rect.left
  dragOffsetY = e.clientY - rect.top
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
}

function onDragMove(e: MouseEvent): void {
  if (!isDragging || !overlayEl) return
  let newLeft = e.clientX - dragOffsetX
  let newTop = e.clientY - dragOffsetY

  // Clamp to viewport with 8px margin
  const minMargin = 8
  newLeft = Math.max(minMargin, Math.min(window.innerWidth - overlayEl.offsetWidth - minMargin, newLeft))
  newTop = Math.max(minMargin, Math.min(window.innerHeight - overlayEl.offsetHeight - minMargin, newTop))

  overlayEl.style.left = `${newLeft}px`
  overlayEl.style.top = `${newTop}px`
  overlayEl.style.right = 'auto'
}

function onDragEnd(): void {
  if (!overlayEl) return
  isDragging = false
  overlayEl.classList.remove('is-dragging')
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}
