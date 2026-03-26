export type PlatformId =
  | 'wooclap'
  | 'kahoot'
  | 'google-forms'
  | 'mentimeter'
  | 'slido'
  | 'generic'

export type KnownPlatform = Exclude<PlatformId, 'generic'>

interface PlatformInfo {
  platform: PlatformId
  hints: string
}

const PLATFORM_SIGNATURES: Array<{
  patterns: string[]
  platform: PlatformId
  hints: string
}> = [
  {
    patterns: ['wooclap.com', 'app.wooclap.com'],
    platform: 'wooclap',
    hints: 'This is from WooClap. Questions appear as interactive polls with multiple choice options displayed as clickable cards.',
  },
  {
    patterns: ['kahoot.it', 'play.kahoot.it'],
    platform: 'kahoot',
    hints: 'This is from Kahoot. Answers are shown as colored blocks with geometric shapes (triangle, diamond, circle, square) in red, blue, yellow, green.',
  },
  {
    patterns: ['docs.google.com/forms'],
    platform: 'google-forms',
    hints: 'This is from Google Forms. Questions appear with radio buttons or checkboxes for multiple choice, or text fields for open-ended questions.',
  },
  {
    patterns: ['menti.com', 'mentimeter.com'],
    platform: 'mentimeter',
    hints: 'This is from Mentimeter. Questions appear as interactive slides with voting options, word clouds, or scales.',
  },
  {
    patterns: ['slido.com', 'app.sli.do'],
    platform: 'slido',
    hints: 'This is from Slido. Questions appear as polls with voting buttons or open text input fields.',
  },
]

export function detectPlatform(url: string): PlatformInfo {
  const lowerUrl = url.toLowerCase()

  for (const sig of PLATFORM_SIGNATURES) {
    for (const pattern of sig.patterns) {
      if (lowerUrl.includes(pattern.toLowerCase())) {
        return { platform: sig.platform, hints: sig.hints }
      }
    }
  }

  return {
    platform: 'generic',
    hints: 'Analyze the screenshot to identify the question type and provide the correct answer.',
  }
}

export function isKnownPlatform(url: string): boolean {
  return detectPlatform(url).platform !== 'generic'
}
