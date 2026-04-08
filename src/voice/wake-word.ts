export interface WakeWordMatch {
  detected: boolean
  commandText: string
  wakeToken: string
}

const DEFAULT_TOKENS = ['hey patrich', 'ok patrich', 'jarvis', 'hey jarvis']

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
