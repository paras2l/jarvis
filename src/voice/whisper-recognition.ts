export interface WhisperTranscriptResult {
  success: boolean
  transcript?: string
  confidence?: number
  error?: string
}

const WHISPER_CONFIG_KEY = 'Pixi.whisper.config'

export interface WhisperConfig {
  provider: 'local_whisper'
  model: 'tiny' | 'base' | 'small'
  device: 'cpu' | 'gpu'
}

const DEFAULT_WHISPER_CONFIG: WhisperConfig = {
  provider: 'local_whisper',
  model: (import.meta.env.VITE_WHISPER_MODEL || 'base') as WhisperConfig['model'],
  device: (import.meta.env.VITE_WHISPER_DEVICE || 'cpu') as WhisperConfig['device'],
}

function loadConfig(): WhisperConfig {
  try {
    const raw = localStorage.getItem(WHISPER_CONFIG_KEY)
    if (!raw) return DEFAULT_WHISPER_CONFIG
    const parsed = JSON.parse(raw) as Partial<WhisperConfig>
    return {
      provider: 'local_whisper',
      model: parsed.model === 'tiny' || parsed.model === 'small' ? parsed.model : 'base',
      device: parsed.device === 'gpu' ? 'gpu' : 'cpu',
    }
  } catch {
    return DEFAULT_WHISPER_CONFIG
  }
}

export function getWhisperConfig(): WhisperConfig {
  return loadConfig()
}

export function updateWhisperConfig(partial: Partial<WhisperConfig>): WhisperConfig {
  const current = loadConfig()
  const next: WhisperConfig = {
    provider: 'local_whisper',
    model: partial.model === 'tiny' || partial.model === 'small' || partial.model === 'base' ? partial.model : current.model,
    device: partial.device === 'gpu' || partial.device === 'cpu' ? partial.device : current.device,
  }
  localStorage.setItem(WHISPER_CONFIG_KEY, JSON.stringify(next))
  return next
}

class WhisperRecognition {
  async transcribeOnce(): Promise<WhisperTranscriptResult> {
    return { success: false, error: 'Realtime local whisper runs in streaming mode only.' }
  }
}

export const whisperRecognition = new WhisperRecognition()

