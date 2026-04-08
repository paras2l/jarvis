export interface WakeWordMatch {
  detected: boolean
  commandText: string
  wakeToken: string
}

const DEFAULT_TOKENS = [
  'hey pixi',
  'ok pixi',
  'okay pixi',
  'pixi',
  'hey pixie',
  'ok pixie',
]

export class WakeWordDetector {
  private tokens: string[]

  constructor(tokens: string[] = DEFAULT_TOKENS) {
    this.tokens = tokens.map((token) => token.toLowerCase())
  }

  setTokens(tokens: string[]): void {
    this.tokens = tokens.map((token) => token.toLowerCase())
  }

  match(transcript: string): WakeWordMatch {
    const normalized = transcript.toLowerCase().trim()

    const regex = /\b(?:hey|ok|okay)?\s*(?:pixi|pixie)\b/i
    const matched = normalized.match(regex)
    if (matched && matched.index !== undefined) {
      const suffixStart = matched.index + matched[0].length
      const commandText = transcript.slice(suffixStart).replace(/^[\s,:-]+/, '')
      return {
        detected: true,
        commandText,
        wakeToken: matched[0].toLowerCase(),
      }
    }

    for (const token of this.tokens) {
      if (!normalized.startsWith(token)) continue
      const commandText = transcript.slice(token.length).replace(/^[\s,:-]+/, '')
      return {
        detected: true,
        commandText,
        wakeToken: token,
      }
    }

    return {
      detected: false,
      commandText: transcript,
      wakeToken: '',
    }
  }
}

export const wakeWordDetector = new WakeWordDetector()
