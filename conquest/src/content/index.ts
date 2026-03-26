import { startRegionSelection } from './region-selector'
import { checkAutoCapture, setupAutoCapture } from '../detect/trigger'
import { browserApi } from '../lib/browser-api'
import { showLoading, showOverlay, showError } from '../ui/overlay'

import type { Message } from '../lib/messages'

// Listen for messages from background
browserApi.runtime.onMessage.addListener(
  (message: Message) => {
    switch (message.type) {
      case 'ANALYSIS_STARTED':
        showLoading(message.payload.captureMode)
        break
      case 'ANSWER_READY':
        showOverlay(message.payload)
        break
      case 'ERROR':
        showError(message.payload.userMessage)
        break
      case 'CONFIG_UPDATED':
        void checkAutoCapture()
        break
      case 'START_REGION_SELECTION':
        startRegionSelection()
        break
    }
  },
)

setupAutoCapture()
