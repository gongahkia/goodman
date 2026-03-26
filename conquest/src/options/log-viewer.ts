import { sendMessage } from '../lib/messages'
import { exportSessionLog, getSessionLog } from '../lib/storage'

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleTimeString('en-US', { hour12: false })
}

function escapeHtml(str: string): string {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

export async function renderLogPanel(container: HTMLElement): Promise<void> {
  const log = await getSessionLog()

  if (log.length === 0) {
    container.innerHTML = `
      <div class="cq-log__shell">
        <div class="cq-log__empty">
          No captures yet.
        </div>
      </div>
    `
    return
  }

  const sorted = [...log].reverse()
  let html = '<div class="cq-log__shell"><div class="cq-log__list">'

  for (const entry of sorted) {
    const pct = entry.answer
      ? Math.round(entry.answer.confidence * 100)
      : null
    const metadata = [
      entry.platform ? `Platform: ${escapeHtml(entry.platform)}` : '',
      entry.triggerSource ? `Trigger: ${escapeHtml(entry.triggerSource)}` : '',
      entry.provider ? `Provider: ${escapeHtml(entry.provider)}` : '',
      entry.model ? `Model: ${escapeHtml(entry.model)}` : '',
      typeof entry.latencyMs === 'number' ? `Latency: ${entry.latencyMs}ms` : '',
      entry.parseStrategy ? `Parse: ${escapeHtml(entry.parseStrategy)}` : '',
      entry.errorCode ? `Error: ${escapeHtml(entry.errorCode)}` : '',
    ].filter(Boolean)
    const tagClass = entry.status === 'error'
      ? 'cq-log__tag cq-log__tag--error'
      : 'cq-log__tag cq-log__tag--success'

    html += `
      <div class="cq-log__entry">
        <div class="cq-log__entry-head">
          <span class="cq-log__time">${formatTime(entry.timestamp)}</span>
          <span class="${tagClass}">
            ${escapeHtml(entry.answer?.questionType ?? 'error')}
          </span>
        </div>
        <div class="cq-log__answer">
          ${escapeHtml(entry.answer?.answer ?? entry.userMessage ?? 'Capture failed')}
        </div>
        <div class="cq-log__meta">
          ${pct === null
            ? metadata.join(' | ')
            : `Confidence: ${pct}%${metadata.length > 0 ? ` | ${metadata.join(' | ')}` : ''}`}
        </div>
      </div>
    `
  }

  html += `
      </div>
      <div class="cq-log__toolbar">
        <button id="clear-log-btn" class="cq-log__toolbar-btn cq-log__toolbar-btn--danger">Clear Log</button>
        <button id="export-log-btn" class="cq-log__toolbar-btn">Export Log</button>
      </div>
    </div>
  `

  container.innerHTML = html

  container.querySelector<HTMLButtonElement>('#clear-log-btn')?.addEventListener('click', async () => {
    await sendMessage({
      type: 'CLEAR_SESSION_STATE',
      payload: null,
    })
    await renderLogPanel(container)
  })

  container.querySelector<HTMLButtonElement>('#export-log-btn')?.addEventListener('click', async () => {
    const json = await exportSessionLog()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `conquest-log-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  })
}
