export interface VoicePerceptionInput {
  rawText: string
  source: 'microphone' | 'text' | 'system'
  timestamp: number
  contextTags?: string[]
}

export interface NormalizedCommand {
  commandId: string
  originalText: string
  normalizedText: string
  intent: string
  entities: string[]
  aliasesApplied: Array<{ from: string; to: string }>
  confidence: number
  requiresVerification: boolean
  timestamp: number
}

export interface ScreenWindowState {
  windowId: string
  title: string
  appName: string
  executable?: string
  isFocused: boolean
  isMinimized?: boolean
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
}

export interface ScreenStateSnapshot {
  snapshotId: string
  timestamp: number
  focusedWindow?: ScreenWindowState
  windows: ScreenWindowState[]
  runningApps: string[]
  confidence: number
}

export interface SensorSignal {
  signalId: string
  channel: 'notification' | 'system_alert' | 'microphone' | 'camera' | 'peripheral' | 'network'
  level: 'info' | 'warning' | 'critical'
  message: string
  data?: Record<string, unknown>
  timestamp: number
  confidence: number
}

export interface PerceptionDecision {
  accepted: boolean
  confidence: number
  reason: string
  clarificationPrompt?: string
}

export interface PerceptionCycleResult {
  cycleId: string
  timestamp: number
  voice?: NormalizedCommand
  screen?: ScreenStateSnapshot
  signals: SensorSignal[]
  aggregateConfidence: number
  requiresVerification: boolean
}

export interface PerceptionHealth {
  lastCycleAt: number
  voiceConfidence: number
  screenConfidence: number
  sensorConfidence: number
  verificationRate: number
  totalCycles: number
}
