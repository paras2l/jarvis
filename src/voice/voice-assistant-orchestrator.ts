import { detectPlatform } from '@/core/platform/platform-detection'
import { brainDirector } from '@/core/brain/brain-director'
import { emotionCore } from '@/core/emotion/emotion-core'
import { consciousnessEngine, type ConsciousnessLevel, type ConsciousnessSnapshot, type EmotionalState } from '@/core/consciousness/consciousness-engine'
import { memoryEngine } from '@/core/memory-engine'
import { naturalCommandLayer, type NCULTask } from '@/core/natural-command-layer'
import taskExecutor from '@/core/task-executor'
import { reflectionEngine } from '@/core/reflection-engine'
import { runtimePolicyStore } from '@/core/runtime-policy'
import { eventPublisher } from '@/event_system/event_publisher'
import { sentimentAnalyzer, type Emotion as SentimentEmotion } from '@/core/sentiment/sentiment-analyzer'
import { voiceToolBackend, type VoiceToolIntent } from '@/voice/voice-tool-backend'
import voiceHandler from '@/core/voice-handler'
import type { VoicePersonality } from '@/voice/speech-synthesis'
import { voicePreferencesManager } from '@/voice/voice-preferences'
import type { ExecutionContext } from '@/types'
import {
  getCognitiveWorkspace,
  getConfidenceGate,
  type ConfidenceLevel,
} from '@/core/cognitive-workspace'

export type VoiceSpeechIntent =
  | 'confirmation'
  | 'action'
  | 'research'
  | 'memory'
  | 'system'
  | 'conversation'
  | 'error'

export interface VoiceSpeechPlan {
  intent: VoiceSpeechIntent
  tempo: 'fast' | 'normal' | 'slow'
  brevity: 'short' | 'normal' | 'detailed' | 'auto'
  priority: 'low' | 'normal' | 'high'
  personality?: VoicePersonality
}

interface VoiceOrchestrationResult {
  handled: boolean
  success: boolean
  speech?: string
  speechPlan?: VoiceSpeechPlan
}

interface PendingConfirmationOutcome {
  type: 'none' | 'response' | 'execute'
  result?: VoiceOrchestrationResult
  command?: string
}

interface VoicePersonalityState {
  active: VoicePersonality
  lockUntil: number
  scores: Record<VoicePersonality, number>
  updatedAt: number
  manualLockUntil?: number
}

interface VoiceTuningState {
  churnSwitchThreshold: number
  stabilizationWindowMs: number
  anomalyCount: number
  recoveryCount: number
  lastAnomalyAt: number
  updatedAt: number
}

interface VoiceSystemSnapshot {
  version: number
  capturedAt: number
  userName: string
  safetyModeEnabled: boolean
  stabilizationModeEnabled: boolean
  prefs: {
    personality: VoicePersonality
    auto: boolean
  }
  personalityState: VoicePersonalityState
  tuningState: VoiceTuningState
  stabilizationUntil: number
}

export interface VoicePersonalityStatus {
  active: VoicePersonality
  autoPersonalityEnabled: boolean
  safetyModeEnabled: boolean
  stabilizationModeEnabled: boolean
  preferred: VoicePersonality
  lockRemainingMs: number
  manualLockRemainingMs: number
  stabilizationRemainingMs: number
  churnPerMinute: number
  tuningThreshold: number
  tuningWindowMs: number
  readinessScore: number
  readinessGrade: 'A' | 'B' | 'C' | 'D'
  decisionReason: string
  spectrumSentiment: 'tired' | 'excited' | 'focused' | 'neutral'
  scores: Record<VoicePersonality, number>
  consciousnessMood: EmotionalState
  consciousnessConfidence: number
  consciousnessAwareness: ConsciousnessLevel
  consciousnessUpdatedAt: number
  recentLearnings: number
  emotionalHistoryCount: number
}

export interface VoicePersonalityTraceEntry {
  timestamp: number
  userName: string
  commandPreview: string
  intent?: string
  confidence?: number
  activePersonality: VoicePersonality
  preferredPersonality: VoicePersonality
  autoPersonalityEnabled: boolean
  safetyModeEnabled: boolean
  reason: string
  spectrumSentiment: 'tired' | 'excited' | 'focused' | 'neutral'
  lockRemainingMs: number
  manualLockRemainingMs: number
  scores: Record<VoicePersonality, number>
}

class VoiceAssistantOrchestrator {
  private inFlightCommands = new Set<string>()
  private commandControllers = new Map<string, AbortController>()
  private voicePersonalityStateByUser = new Map<string, VoicePersonalityState>()
  private lastVoiceDecisionReasonByUser = new Map<string, string>()
  private voiceDecisionTrace: VoicePersonalityTraceEntry[] = []
  private stabilizationUntilByUser = new Map<string, number>()
  private tuningStateByUser = new Map<string, VoiceTuningState>()
  private voiceStateLoadedUsers = new Set<string>()
  private voiceStatePersistTimers = new Map<string, number>()
  private lastCommandKey = ''
  private lastCommandAt = 0
  private pendingSensitiveCommand: { command: string; expiresAt: number } | null = null

  private readonly DUPLICATE_WINDOW_MS = 1_600
  private readonly SENSITIVE_CONFIRM_WINDOW_MS = 20_000
  private readonly MAX_SPOKEN_RESPONSE_CHARS = 420
  private readonly PERSONALITY_LOCK_MS = 14_000
  private readonly PERSONALITY_PERSIST_DEBOUNCE_MS = 2_000
  private readonly VOICE_SAFETY_MODE_KEY = 'patrich.voice.safety_mode'
  private readonly VOICE_STABILIZATION_MODE_KEY = 'patrich.voice.stabilization_mode'
  private readonly VOICE_TUNING_KEY_PREFIX = 'patrich.voice.tuning.'
  private readonly VOICE_SNAPSHOT_KEY_PREFIX = 'patrich.voice.snapshot.'
  private readonly VOICE_TRACE_MAX_ITEMS = 120
  private readonly CHURN_LOOKBACK_MS = 60_000
  private readonly DEFAULT_CHURN_SWITCH_THRESHOLD = 5
  private readonly DEFAULT_STABILIZATION_WINDOW_MS = 45_000
  private workspace = getCognitiveWorkspace()
  private confidenceGate = getConfidenceGate()

  private recordVoiceDecisionTrace(entry: VoicePersonalityTraceEntry): void {
    this.voiceDecisionTrace.push(entry)
    if (this.voiceDecisionTrace.length > this.VOICE_TRACE_MAX_ITEMS) {
      this.voiceDecisionTrace = this.voiceDecisionTrace.slice(-this.VOICE_TRACE_MAX_ITEMS)
    }
  }

  getRecentVoiceDecisionTrace(limit = 20): VoicePersonalityTraceEntry[] {
    return this.voiceDecisionTrace.slice(-Math.max(1, limit))
  }

  private tuningStorageKey(userName: string): string {
    const normalized = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default'
    return `${this.VOICE_TUNING_KEY_PREFIX}${normalized}`
  }

  private snapshotStorageKey(userName: string): string {
    const normalized = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default'
    return `${this.VOICE_SNAPSHOT_KEY_PREFIX}${normalized}`
  }

  private createDefaultTuningState(): VoiceTuningState {
    return {
      churnSwitchThreshold: this.DEFAULT_CHURN_SWITCH_THRESHOLD,
      stabilizationWindowMs: this.DEFAULT_STABILIZATION_WINDOW_MS,
      anomalyCount: 0,
      recoveryCount: 0,
      lastAnomalyAt: 0,
      updatedAt: Date.now(),
    }
  }

  private loadTuningState(userName: string): VoiceTuningState {
    const cached = this.tuningStateByUser.get(userName)
    if (cached) return cached

    try {
      const raw = localStorage.getItem(this.tuningStorageKey(userName))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VoiceTuningState>
        const state: VoiceTuningState = {
          ...this.createDefaultTuningState(),
          ...parsed,
          churnSwitchThreshold: Math.max(3, Math.min(10, Math.round(parsed.churnSwitchThreshold ?? this.DEFAULT_CHURN_SWITCH_THRESHOLD))),
          stabilizationWindowMs: Math.max(20_000, Math.min(120_000, Math.round(parsed.stabilizationWindowMs ?? this.DEFAULT_STABILIZATION_WINDOW_MS))),
          anomalyCount: Math.max(0, Math.round(parsed.anomalyCount ?? 0)),
          recoveryCount: Math.max(0, Math.round(parsed.recoveryCount ?? 0)),
          lastAnomalyAt: Math.max(0, Math.round(parsed.lastAnomalyAt ?? 0)),
          updatedAt: Math.max(0, Math.round(parsed.updatedAt ?? Date.now())),
        }
        this.tuningStateByUser.set(userName, state)
        return state
      }
    } catch {
      // Ignore malformed tuning state.
    }

    const created = this.createDefaultTuningState()
    this.tuningStateByUser.set(userName, created)
    return created
  }

  private saveTuningState(userName: string, state: VoiceTuningState): void {
    this.tuningStateByUser.set(userName, state)
    localStorage.setItem(this.tuningStorageKey(userName), JSON.stringify(state))
  }

  private emitTuningUpdate(userName: string, reason: 'anomaly_response' | 'stability_optimization' | 'manual_reset', state: VoiceTuningState): void {
    void eventPublisher.voicePersonalityTuningUpdated({
      userName,
      reason,
      churnSwitchThreshold: state.churnSwitchThreshold,
      stabilizationWindowMs: state.stabilizationWindowMs,
      anomalyCount: state.anomalyCount,
      recoveryCount: state.recoveryCount,
      updatedAt: state.updatedAt,
    })
  }

  private computeReadinessScore(userName: string): { score: number; grade: 'A' | 'B' | 'C' | 'D' } {
    const status = this.getVoicePersonalityStatus(userName)
    const tuning = this.loadTuningState(userName)

    let score = 100
    score -= Math.min(35, status.churnPerMinute * 8)
    score -= status.stabilizationRemainingMs > 0 ? 14 : 0
    score -= tuning.anomalyCount > tuning.recoveryCount ? 10 : 0
    score -= status.safetyModeEnabled ? 0 : 8

    const clamped = Math.max(0, Math.min(100, Math.round(score)))
    const grade: 'A' | 'B' | 'C' | 'D' =
      clamped >= 85 ? 'A' :
      clamped >= 70 ? 'B' :
      clamped >= 55 ? 'C' :
      'D'

    return { score: clamped, grade }
  }

  private createSnapshot(userName = 'Paras'): VoiceSystemSnapshot {
    this.loadVoicePersonalityState(userName)
    const prefs = voicePreferencesManager.getPreferences()
    const personalityState = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()
    const tuningState = this.loadTuningState(userName)

    return {
      version: 1,
      capturedAt: Date.now(),
      userName,
      safetyModeEnabled: this.isVoiceSafetyModeEnabled(),
      stabilizationModeEnabled: this.isStabilizationModeEnabled(),
      prefs: {
        personality: prefs.personality,
        auto: prefs.enableAutoPersonality,
      },
      personalityState,
      tuningState,
      stabilizationUntil: this.stabilizationUntilByUser.get(userName) || 0,
    }
  }

  private saveSnapshot(userName = 'Paras'): VoiceSystemSnapshot {
    const snapshot = this.createSnapshot(userName)
    localStorage.setItem(this.snapshotStorageKey(userName), JSON.stringify(snapshot))
    return snapshot
  }

  private restoreSnapshot(userName = 'Paras'): { ok: boolean; message: string } {
    const raw = localStorage.getItem(this.snapshotStorageKey(userName))
    if (!raw) {
      return { ok: false, message: 'No snapshot found for restore.' }
    }

    try {
      const snapshot = JSON.parse(raw) as VoiceSystemSnapshot
      if (!snapshot || snapshot.version !== 1) {
        return { ok: false, message: 'Snapshot format is invalid or unsupported.' }
      }

      this.setVoiceSafetyMode(Boolean(snapshot.safetyModeEnabled))
      this.setStabilizationMode(Boolean(snapshot.stabilizationModeEnabled))
      voicePreferencesManager.setPersonality(snapshot.prefs.personality)
      voicePreferencesManager.setAutoPersonality(Boolean(snapshot.prefs.auto))

      this.voicePersonalityStateByUser.set(userName, snapshot.personalityState)
      this.tuningStateByUser.set(userName, snapshot.tuningState)
      this.saveTuningState(userName, snapshot.tuningState)
      this.stabilizationUntilByUser.set(userName, snapshot.stabilizationUntil)
      this.schedulePersistVoicePersonalityState(userName)

      return { ok: true, message: 'Voice snapshot restored successfully.' }
    } catch {
      return { ok: false, message: 'Snapshot restore failed due to malformed data.' }
    }
  }

  private isStabilizationModeEnabled(): boolean {
    return localStorage.getItem(this.VOICE_STABILIZATION_MODE_KEY) !== 'false'
  }

  setStabilizationMode(enabled: boolean): void {
    localStorage.setItem(this.VOICE_STABILIZATION_MODE_KEY, enabled ? 'true' : 'false')
  }

  private computeVoiceChurn(userName: string, lookbackMs = this.CHURN_LOOKBACK_MS): { switchCount: number; decisions: number; churnPerMinute: number } {
    const cutoff = Date.now() - lookbackMs
    const recent = this.voiceDecisionTrace
      .filter((entry) => entry.userName === userName && entry.timestamp >= cutoff)
      .sort((a, b) => a.timestamp - b.timestamp)

    if (recent.length <= 1) {
      return { switchCount: 0, decisions: recent.length, churnPerMinute: 0 }
    }

    let switchCount = 0
    for (let i = 1; i < recent.length; i += 1) {
      if (recent[i].activePersonality !== recent[i - 1].activePersonality) {
        switchCount += 1
      }
    }

    const churnPerMinute = Number(((switchCount / Math.max(1, lookbackMs)) * 60_000).toFixed(2))
    return { switchCount, decisions: recent.length, churnPerMinute }
  }

  private maybeTriggerStabilization(userName: string): void {
    if (!this.isStabilizationModeEnabled()) return

    const now = Date.now()
    const currentUntil = this.stabilizationUntilByUser.get(userName) || 0
    if (currentUntil > now) return

    const tuning = this.loadTuningState(userName)
    const churn = this.computeVoiceChurn(userName)
    if (churn.switchCount < tuning.churnSwitchThreshold) return

    const until = now + tuning.stabilizationWindowMs
    this.stabilizationUntilByUser.set(userName, until)

    tuning.anomalyCount += 1
    tuning.lastAnomalyAt = now
    tuning.churnSwitchThreshold = Math.max(3, tuning.churnSwitchThreshold - 1)
    tuning.stabilizationWindowMs = Math.min(120_000, tuning.stabilizationWindowMs + 10_000)
    tuning.updatedAt = now
    this.saveTuningState(userName, tuning)
    this.emitTuningUpdate(userName, 'anomaly_response', tuning)

    const recentReasons = this.getRecentVoiceDecisionTrace(8)
      .filter((entry) => entry.userName === userName)
      .map((entry) => entry.reason)

    void eventPublisher.voicePersonalityAnomaly({
      userName,
      anomalyType: churn.switchCount >= tuning.churnSwitchThreshold + 2 ? 'rapid_switching' : 'high_churn',
      switchCount: churn.switchCount,
      decisions: churn.decisions,
      churnPerMinute: churn.churnPerMinute,
      stabilizationWindowMs: tuning.stabilizationWindowMs,
      recentReasons,
    })
  }

  private maybeTuneFromStability(userName: string): void {
    const now = Date.now()
    const tuning = this.loadTuningState(userName)
    const stabilizationRemaining = Math.max(0, (this.stabilizationUntilByUser.get(userName) || 0) - now)
    if (stabilizationRemaining > 0) return
    if (tuning.lastAnomalyAt > 0 && now - tuning.lastAnomalyAt < 5 * 60_000) return

    const churn = this.computeVoiceChurn(userName)
    if (churn.decisions < 12 || churn.switchCount > 1) return

    tuning.recoveryCount += 1
    tuning.churnSwitchThreshold = Math.min(10, tuning.churnSwitchThreshold + 1)
    tuning.stabilizationWindowMs = Math.max(20_000, tuning.stabilizationWindowMs - 5_000)
    tuning.updatedAt = now
    this.saveTuningState(userName, tuning)
    this.emitTuningUpdate(userName, 'stability_optimization', tuning)
  }

  private withAdaptiveVoicePersonality(
    plan: VoiceSpeechPlan,
    command: string,
    intent?: string,
    confidence?: number,
  ): VoiceSpeechPlan {
    const userName = 'Paras'
    const prefs = voicePreferencesManager.getPreferences()
    const rawPersonality = prefs.enableAutoPersonality
      ? this.resolveStableVoicePersonality(userName, command, intent, confidence)
      : prefs.personality
    const { personality, reason } = this.applySafetyPersonalityPolicy(rawPersonality, command, intent, confidence, userName)
    this.lastVoiceDecisionReasonByUser.set(userName, reason)

    const status = this.getVoicePersonalityStatus(userName)
    const traceEntry: VoicePersonalityTraceEntry = {
      timestamp: Date.now(),
      userName,
      commandPreview: command.slice(0, 120),
      intent,
      confidence,
      activePersonality: personality,
      preferredPersonality: prefs.personality,
      autoPersonalityEnabled: prefs.enableAutoPersonality,
      safetyModeEnabled: status.safetyModeEnabled,
      reason,
      spectrumSentiment: status.spectrumSentiment,
      lockRemainingMs: status.lockRemainingMs,
      manualLockRemainingMs: status.manualLockRemainingMs,
      scores: status.scores,
    }
    this.recordVoiceDecisionTrace(traceEntry)
    this.maybeTriggerStabilization(userName)
    this.maybeTuneFromStability(userName)

    void eventPublisher.voicePersonalityDecided({
      userName,
      commandPreview: traceEntry.commandPreview,
      intent,
      confidence,
      activePersonality: personality,
      preferredPersonality: prefs.personality,
      autoPersonalityEnabled: prefs.enableAutoPersonality,
      safetyModeEnabled: status.safetyModeEnabled,
      reason,
      spectrumSentiment: status.spectrumSentiment,
      lockRemainingMs: status.lockRemainingMs,
      manualLockRemainingMs: status.manualLockRemainingMs,
      scores: Object.fromEntries(Object.entries(status.scores)),
    })

    return {
      ...plan,
      personality,
    }
  }

  private isVoiceSafetyModeEnabled(): boolean {
    return localStorage.getItem(this.VOICE_SAFETY_MODE_KEY) !== 'false'
  }

  setVoiceSafetyMode(enabled: boolean): void {
    localStorage.setItem(this.VOICE_SAFETY_MODE_KEY, enabled ? 'true' : 'false')
  }

  private applySafetyPersonalityPolicy(
    personality: VoicePersonality,
    command: string,
    intent?: string,
    confidence?: number,
    userName = 'Paras',
  ): { personality: VoicePersonality; reason: string } {
    if (!this.isVoiceSafetyModeEnabled()) {
      return { personality, reason: 'safety_mode_off' }
    }

    const state = this.voicePersonalityStateByUser.get(userName)
    const now = Date.now()
    if ((state?.manualLockUntil || 0) > now) {
      return { personality: state?.active || personality, reason: 'manual_lock' }
    }

    const stabilizationUntil = this.stabilizationUntilByUser.get(userName) || 0
    if (this.isStabilizationModeEnabled() && stabilizationUntil > now) {
      return { personality: 'calm', reason: 'stabilization_mode' }
    }

    const lower = command.toLowerCase()
    if (/(shutdown|restart|sleep|power off|format|wipe|factory reset|delete all|erase|clear all)/.test(lower)) {
      return { personality: 'calm', reason: 'sensitive_operation' }
    }

    const hour = new Date().getHours()
    if ((hour >= 23 || hour < 6) && personality === 'energetic') {
      return { personality: 'calm', reason: 'quiet_hours' }
    }

    if (typeof confidence === 'number' && confidence < 0.52 && intent !== 'conversation') {
      return { personality: 'professional', reason: 'low_confidence' }
    }

    const sentiment = voiceHandler.getSpectrumProfile().sentiment
    if (sentiment === 'tired' && personality === 'energetic') {
      return { personality: 'warm', reason: 'tone_alignment' }
    }

    return { personality, reason: 'adaptive' }
  }

  private createDefaultPersonalityState(): VoicePersonalityState {
    return {
      active: 'cute',
      lockUntil: 0,
      updatedAt: Date.now(),
      scores: {
        cute: 1,
        warm: 0.8,
        professional: 0.8,
        energetic: 0.8,
        calm: 0.8,
      },
    }
  }

  private personalityStateKey(userName: string): string {
    const normalized = userName.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'default'
    return `voice_personality_state_${normalized}`
  }

  private loadVoicePersonalityState(userName: string): void {
    if (this.voiceStateLoadedUsers.has(userName)) return
    this.voiceStateLoadedUsers.add(userName)

    const raw = memoryEngine.get(this.personalityStateKey(userName))
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Partial<VoicePersonalityState>
      if (!parsed || typeof parsed !== 'object') return

      const fallback = this.createDefaultPersonalityState()
      const scores = {
        ...fallback.scores,
        ...(parsed.scores || {}),
      }

      const active = parsed.active && scores[parsed.active] !== undefined ? parsed.active : fallback.active
      this.voicePersonalityStateByUser.set(userName, {
        active,
        lockUntil: typeof parsed.lockUntil === 'number' ? parsed.lockUntil : 0,
        updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
        scores,
      })
    } catch {
      // Ignore malformed persisted state.
    }
  }

  private schedulePersistVoicePersonalityState(userName: string): void {
    const existing = this.voiceStatePersistTimers.get(userName)
    if (typeof existing === 'number') {
      window.clearTimeout(existing)
    }

    const timer = window.setTimeout(() => {
      const state = this.voicePersonalityStateByUser.get(userName)
      if (!state) return

      const payload = JSON.stringify(state)
      void memoryEngine.rememberFact(this.personalityStateKey(userName), payload, 'preference')
      this.voiceStatePersistTimers.delete(userName)
    }, this.PERSONALITY_PERSIST_DEBOUNCE_MS)

    this.voiceStatePersistTimers.set(userName, timer)
  }

  private resolveStableVoicePersonality(
    userName: string,
    command: string,
    intent?: string,
    confidence?: number,
  ): VoicePersonality {
    this.loadVoicePersonalityState(userName)

    const immediate = this.pickVoicePersonality(command, intent, confidence)
    const now = Date.now()
    const state = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()

    // Exponential decay keeps state adaptive while avoiding rapid jitter.
    const elapsedMs = Math.max(0, now - state.updatedAt)
    const decayFactor = Math.pow(0.82, elapsedMs / 5000)
    for (const key of Object.keys(state.scores) as VoicePersonality[]) {
      state.scores[key] = Math.max(0.15, state.scores[key] * decayFactor)
    }

    state.scores[immediate] += 1.25

    // Phase 4.2: keep user preference influential, but never absolute.
    const prefs = voicePreferencesManager.getPreferences()
    state.scores[prefs.personality] += 0.45

    const ranked = (Object.entries(state.scores) as Array<[VoicePersonality, number]>).sort((a, b) => b[1] - a[1])
    const top = ranked[0][0]
    const second = ranked[1]?.[1] ?? 0
    const topScore = ranked[0][1]
    const confidenceGap = topScore - second

    if ((state.manualLockUntil || 0) > now) {
      state.updatedAt = now
      this.voicePersonalityStateByUser.set(userName, state)
      this.schedulePersistVoicePersonalityState(userName)
      return state.active
    }

    if (now <= state.lockUntil && top !== state.active && confidenceGap < 0.65) {
      state.scores[state.active] += 0.2
      state.updatedAt = now
      this.voicePersonalityStateByUser.set(userName, state)
      this.schedulePersistVoicePersonalityState(userName)
      return state.active
    }

    if (top !== state.active && confidenceGap >= 0.5) {
      state.active = top
      state.lockUntil = now + this.PERSONALITY_LOCK_MS
    } else if (top === state.active) {
      state.lockUntil = now + Math.min(this.PERSONALITY_LOCK_MS, 10_000)
    }

    state.updatedAt = now
    this.voicePersonalityStateByUser.set(userName, state)
    this.schedulePersistVoicePersonalityState(userName)
    return state.active
  }

  getVoicePersonalityStatus(userName = 'Paras'): VoicePersonalityStatus {
    this.loadVoicePersonalityState(userName)
    const now = Date.now()
    const state = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()
    const prefs = voicePreferencesManager.getPreferences()
    const churn = this.computeVoiceChurn(userName)
    const stabilizationRemainingMs = Math.max(0, (this.stabilizationUntilByUser.get(userName) || 0) - now)
    const tuning = this.loadTuningState(userName)
    const readiness = this.computeReadinessScore(userName)
    const consciousness: ConsciousnessSnapshot | null = consciousnessEngine.getConsciousnessState(userName)

    return {
      active: state.active,
      autoPersonalityEnabled: prefs.enableAutoPersonality,
      safetyModeEnabled: this.isVoiceSafetyModeEnabled(),
      stabilizationModeEnabled: this.isStabilizationModeEnabled(),
      preferred: prefs.personality,
      lockRemainingMs: Math.max(0, state.lockUntil - now),
      manualLockRemainingMs: Math.max(0, (state.manualLockUntil || 0) - now),
      stabilizationRemainingMs,
      churnPerMinute: churn.churnPerMinute,
      tuningThreshold: tuning.churnSwitchThreshold,
      tuningWindowMs: tuning.stabilizationWindowMs,
      readinessScore: readiness.score,
      readinessGrade: readiness.grade,
      decisionReason: this.lastVoiceDecisionReasonByUser.get(userName) || 'adaptive',
      spectrumSentiment: voiceHandler.getSpectrumProfile().sentiment,
      scores: { ...state.scores },
      consciousnessMood: consciousness?.currentMood || 'calm',
      consciousnessConfidence: consciousness?.confidenceLevel || 0.5,
      consciousnessAwareness: consciousness?.selfAwareness || 'minimal',
      consciousnessUpdatedAt: consciousness?.timestamp || 0,
      recentLearnings: consciousness?.recentLearnings.length || 0,
      emotionalHistoryCount: consciousness?.emotionalHistory.length || 0,
    }
  }

  private async handleVoicePersonalityCommand(command: string): Promise<VoiceOrchestrationResult | null> {
    const normalized = command.toLowerCase().trim()
    const userName = 'Paras'

    const personalityMatch = normalized.match(/(?:use|switch(?:\s+to)?|set)(?:\s+voice)?(?:\s+personality)?(?:\s+to)?\s+(cute|warm|professional|energetic|calm)\b/i)
    if (personalityMatch) {
      const personality = personalityMatch[1].toLowerCase() as VoicePersonality
      voicePreferencesManager.setPersonality(personality)

      const state = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()
      state.active = personality
      state.lockUntil = Date.now() + this.PERSONALITY_LOCK_MS
      state.scores[personality] = Math.max(state.scores[personality], 1.4)
      state.updatedAt = Date.now()
      this.voicePersonalityStateByUser.set(userName, state)
      this.schedulePersistVoicePersonalityState(userName)

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          `Voice personality updated to ${personality}.`,
          `Set. I am now using the ${personality} voice style.`,
          `${personality} mode is active now.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(enable|turn on)\s+auto\s+personality\b/.test(normalized)) {
      voicePreferencesManager.setAutoPersonality(true)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Auto personality enabled. I will adapt tone to context with your preferred bias.',
          'Auto personality is on. I will shape my tone to the situation.',
          'Understood. I will adapt my style based on context now.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(disable|turn off)\s+auto\s+personality\b/.test(normalized)) {
      voicePreferencesManager.setAutoPersonality(false)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Auto personality disabled. I will keep your selected voice style fixed.',
          'Auto personality is off. I will keep the current voice style steady.',
          'Got it. I will keep one stable voice style until you change it.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(enable|turn on)\s+(voice\s+)?safety\s+mode\b/.test(normalized)) {
      this.setVoiceSafetyMode(true)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice safety mode enabled.',
          'Safety mode is on now.',
          'Understood. I have enabled voice safety mode.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(disable|turn off)\s+(voice\s+)?safety\s+mode\b/.test(normalized)) {
      this.setVoiceSafetyMode(false)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice safety mode disabled.',
          'Safety mode is off now.',
          'Okay. I have turned off voice safety mode.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(enable|turn on)\s+(voice\s+)?stabilization\s+mode\b/.test(normalized)) {
      this.setStabilizationMode(true)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice stabilization mode enabled.',
          'Stabilization mode is on now.',
          'Understood. I have enabled voice stabilization mode.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(disable|turn off)\s+(voice\s+)?stabilization\s+mode\b/.test(normalized)) {
      this.setStabilizationMode(false)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice stabilization mode disabled.',
          'Stabilization mode is off now.',
          'Okay. I have turned off voice stabilization mode.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(reset|clear)\s+(voice\s+)?personality\s+(memory|state)\b/.test(normalized)) {
      const state = this.createDefaultPersonalityState()
      this.voicePersonalityStateByUser.set(userName, state)
      const payload = JSON.stringify(state)
      await memoryEngine.rememberFact(this.personalityStateKey(userName), payload, 'preference')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice personality memory reset complete.',
          'I cleared the stored voice personality memory.',
          'Done. The voice personality state is now reset.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    const lockMatch = normalized.match(/\block\s+(?:voice\s+)?personality\s+(cute|warm|professional|energetic|calm)(?:\s+for\s+(\d+)\s*(minute|minutes|min))?\b/)
    if (lockMatch) {
      const personality = lockMatch[1] as VoicePersonality
      const minutes = Math.max(1, Math.min(60, Number(lockMatch[2] || 10)))
      const state = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()
      state.active = personality
      state.manualLockUntil = Date.now() + minutes * 60_000
      state.lockUntil = state.manualLockUntil
      state.scores[personality] = Math.max(state.scores[personality], 1.6)
      state.updatedAt = Date.now()
      this.voicePersonalityStateByUser.set(userName, state)
      this.schedulePersistVoicePersonalityState(userName)

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          `Locked voice personality to ${personality} for ${minutes} minutes.`,
          `${personality} is now locked for ${minutes} minutes.`,
          `I will keep the ${personality} style for ${minutes} minutes.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(unlock|release)\s+(voice\s+)?personality\b/.test(normalized)) {
      const state = this.voicePersonalityStateByUser.get(userName) || this.createDefaultPersonalityState()
      state.manualLockUntil = 0
      state.updatedAt = Date.now()
      this.voicePersonalityStateByUser.set(userName, state)
      this.schedulePersistVoicePersonalityState(userName)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice personality lock released.',
          'The personality lock is off now.',
          'Understood. I have released the voice personality lock.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(voice\s+personality\s+status|why\s+this\s+voice|voice\s+status)\b/.test(normalized)) {
      const status = this.getVoicePersonalityStatus(userName)
      const lockSecs = Math.round(status.lockRemainingMs / 1000)
      const manualSecs = Math.round(status.manualLockRemainingMs / 1000)
      const explain = [
        `Current voice personality is ${status.active}.`,
        `Auto personality is ${status.autoPersonalityEnabled ? 'on' : 'off'}.`,
        `Safety mode is ${status.safetyModeEnabled ? 'on' : 'off'}.`,
        `Stabilization mode is ${status.stabilizationModeEnabled ? 'on' : 'off'}.`,
        `Preferred personality is ${status.preferred}.`,
        `Spectrum sentiment is ${status.spectrumSentiment}.`,
        `Decision reason is ${status.decisionReason}.`,
        `Churn per minute is ${status.churnPerMinute}.`,
        lockSecs > 0 ? `Stability lock ${lockSecs} seconds remaining.` : 'No stability lock active.',
        status.stabilizationRemainingMs > 0 ? `Stabilization window ${Math.round(status.stabilizationRemainingMs / 1000)} seconds remaining.` : 'No stabilization window active.',
        manualSecs > 0 ? `Manual lock ${manualSecs} seconds remaining.` : 'No manual lock active.',
      ].join(' ')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(explain),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(voice\s+trace|voice\s+debug\s+trace|replay\s+voice\s+decisions)\b/.test(normalized)) {
      const recent = this.getRecentVoiceDecisionTrace(5)
      if (!recent.length) {
        return {
          handled: true,
          success: true,
          speech: this.polishSpeech(this.chooseSituationAwareSpeech([
            'No voice personality trace entries yet.',
            'I do not have any voice trace history yet.',
            'Nothing to replay yet. No voice decisions have been recorded.',
          ], command, 'system_command')),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'system',
            tempo: 'normal',
            brevity: 'short',
            priority: 'normal',
          }, command, 'system_command'),
        }
      }

      const summary = recent
        .map((entry, index) => {
          const secAgo = Math.max(0, Math.round((Date.now() - entry.timestamp) / 1000))
          return `${index + 1}: ${entry.activePersonality}, reason ${entry.reason}, ${secAgo} seconds ago`
        })
        .join('. ')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          `Recent voice decisions. ${summary}.`,
          `Here are the recent voice choices. ${summary}.`,
          `I found these recent voice decisions. ${summary}.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(voice\s+diagnostics|voice\s+metrics|voice\s+health)\b/.test(normalized)) {
      const status = this.getVoicePersonalityStatus(userName)
      const recent = this.getRecentVoiceDecisionTrace(8)
      const reasonCounts = recent.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.reason] = (acc[entry.reason] || 0) + 1
        return acc
      }, {})
      const topReasons = Object.entries(reasonCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, count]) => `${reason}:${count}`)
        .join(', ') || 'none'

      const diag = [
        `Voice diagnostics. Active ${status.active}.`,
        `Reason ${status.decisionReason}.`,
        `Churn per minute ${status.churnPerMinute}.`,
        `Tuning threshold ${status.tuningThreshold}.`,
        `Tuning window ${Math.round(status.tuningWindowMs / 1000)} seconds.`,
        `Stabilization ${status.stabilizationRemainingMs > 0 ? 'active' : 'inactive'}.`,
        `Top recent reasons ${topReasons}.`,
      ].join(' ')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          diag,
          `Voice diagnostics are ready. ${diag}`,
          `I have the current voice health details. ${diag}`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(reset\s+voice\s+tuning|clear\s+voice\s+tuning)\b/.test(normalized)) {
      const state = this.createDefaultTuningState()
      this.saveTuningState(userName, state)
      this.emitTuningUpdate(userName, 'manual_reset', state)

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          'Voice tuning reset to defaults.',
          'I restored the voice tuning defaults.',
          'Done. The voice tuning state is back to its defaults.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(save\s+voice\s+snapshot|create\s+voice\s+snapshot|checkpoint\s+voice)\b/.test(normalized)) {
      const snapshot = this.saveSnapshot(userName)
      const when = new Date(snapshot.capturedAt).toLocaleTimeString()
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          `Voice snapshot saved at ${when}.`,
          `I saved the voice snapshot at ${when}.`,
          `Snapshot saved. The voice state was captured at ${when}.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    if (/\b(restore\s+voice\s+snapshot|recover\s+voice\s+snapshot|rollback\s+voice)\b/.test(normalized)) {
      const restored = this.restoreSnapshot(userName)
      return {
        handled: true,
        success: restored.ok,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          restored.message,
          restored.ok ? 'Voice snapshot restored successfully.' : 'I could not restore the voice snapshot.',
          restored.ok ? 'The saved voice state is restored now.' : 'The snapshot restore did not work as expected.',
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: restored.ok ? 'confirmation' : 'error',
          tempo: restored.ok ? 'fast' : 'normal',
          brevity: 'short',
          priority: restored.ok ? 'normal' : 'high',
        }, command, 'system_command'),
      }
    }

    if (/\b(voice\s+readiness\s+report|voice\s+final\s+report|voice\s+system\s+report)\b/.test(normalized)) {
      const status = this.getVoicePersonalityStatus(userName)
      const report = [
        `Voice readiness is grade ${status.readinessGrade}, score ${status.readinessScore} out of 100.`,
        `Active personality ${status.active}, reason ${status.decisionReason}.`,
        `Churn per minute ${status.churnPerMinute}.`,
        `Safety ${status.safetyModeEnabled ? 'on' : 'off'}, stabilization ${status.stabilizationModeEnabled ? 'on' : 'off'}.`,
      ].join(' ')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          report,
          `Here is the voice readiness report. ${report}`,
          `I have prepared the system report. ${report}`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'normal',
        }, command, 'system_command'),
      }
    }

    return null
  }

  private pickVoicePersonality(command: string, intent?: string, confidence?: number): VoicePersonality {
    const directive = brainDirector.analyze(this.buildVoiceBrainContext(command, intent, confidence))
    const spectrumSentiment = voiceHandler.getSpectrumProfile().sentiment

    if (directive.reactionPolicy.styleBias === 'deescalate' || directive.reactionPolicy.styleBias === 'reassure') {
      return 'calm'
    }
    if (directive.reactionPolicy.styleBias === 'energize') {
      return 'energetic'
    }

    if (spectrumSentiment === 'tired') return 'calm'
    if (spectrumSentiment === 'excited') return 'energetic'
    if (spectrumSentiment === 'focused') return 'professional'

    if (directive.situation === 'greeting' || directive.situation === 'conversation') {
      return 'warm'
    }
    if (directive.situation === 'research' || directive.speechPlan.brevity === 'detailed') {
      return 'professional'
    }

    return 'cute'
  }

  async handle(command: string): Promise<VoiceOrchestrationResult> {
    const trimmed = String(command || '').trim()
    if (!trimmed) {
      return { handled: false, success: false }
    }

    let normalizedCommand = this.normalizeVoiceCommand(trimmed)
    if (!normalizedCommand) {
      return { handled: false, success: false }
    }

    const personalityControlResult = await this.handleVoicePersonalityCommand(normalizedCommand)
    if (personalityControlResult) {
      return personalityControlResult
    }

    if (this.isDuplicateCommand(normalizedCommand)) {
      return { handled: true, success: true }
    }

    const confirmationOutcome = this.handlePendingConfirmation(normalizedCommand)
    if (confirmationOutcome.type === 'response' && confirmationOutcome.result) {
      return confirmationOutcome.result
    }
    if (confirmationOutcome.type === 'execute' && confirmationOutcome.command) {
      normalizedCommand = confirmationOutcome.command
    }

    if (this.requiresSensitiveConfirmation(normalizedCommand)) {
      const speech = await this.generateEmotionAwareLine('sensitive', normalizedCommand, 'system_command')

      this.pendingSensitiveCommand = {
        command: normalizedCommand,
        expiresAt: Date.now() + this.SENSITIVE_CONFIRM_WINDOW_MS,
      }
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(speech),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'short',
          priority: 'high',
        }, normalizedCommand, 'system_command'),
      }
    }

    if (this.isInterruptionCommand(normalizedCommand)) {
      return this.handleInterruption(normalizedCommand)
    }

    if (this.inFlightCommands.has(normalizedCommand)) {
      const speech = await this.generateEmotionAwareLine('duplicate', normalizedCommand, 'system_command')

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(speech),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        }, normalizedCommand, 'system_command'),
      }
    }

    this.inFlightCommands.add(normalizedCommand)
    const controller = new AbortController()
    this.commandControllers.set(normalizedCommand, controller)

    try {
      return await this.executeCommand(normalizedCommand, controller.signal)
    } catch (error) {
      if ((error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && /cancelled|aborted/i.test(error.message))) {
        const cancelled = await this.generateEmotionAwareLine('confirmation', `Cancelled command: ${normalizedCommand}`, 'system_command')
        return {
          handled: true,
          success: false,
          speech: this.polishSpeech(cancelled || 'Stopped.'),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'system',
            tempo: 'fast',
            brevity: 'short',
            priority: 'high',
          }, normalizedCommand, 'system_command'),
        }
      }

      const speech = await this.generateEmotionAwareLine('error', normalizedCommand, 'system_command')

      return {
        handled: true,
        success: false,
        speech: this.polishSpeech(`${speech} ${String(error || '')}`.trim()),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'error',
          tempo: 'slow',
          brevity: 'normal',
          priority: 'high',
        }, normalizedCommand, 'system_command'),
      }
    } finally {
      this.inFlightCommands.delete(normalizedCommand)
      this.commandControllers.delete(normalizedCommand)
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('Voice command cancelled.', 'AbortError')
    }
  }

  private mapSentimentEmotionToConsciousness(emotion: SentimentEmotion): EmotionalState {
    switch (emotion) {
      case 'happy':
        return 'happy'
      case 'sad':
        return 'sad'
      case 'angry':
        return 'frustrated'
      case 'scared':
        return 'confused'
      case 'surprised':
        return 'excited'
      default:
        return 'calm'
    }
  }

  private mapNumericConfidenceToWorkspaceLevel(confidence: number): ConfidenceLevel {
    if (confidence >= 0.85) return 'high'
    if (confidence >= 0.6) return 'medium'
    if (confidence > 0) return 'low'
    return 'unknown'
  }

  private chooseSituationAwareSpeech(
    variants: string[],
    command: string,
    intent?: string,
    confidence?: number,
  ): string {
    if (!variants.length) return ''

    const consciousness = consciousnessEngine.getConsciousnessState('Paras')
    const spectrum = voiceHandler.getSpectrumProfile().sentiment
    const normalizedConfidence = typeof confidence === 'number' ? confidence : 0.5
    const seed = [
      command,
      intent || '',
      String(Math.round(normalizedConfidence * 100)),
      consciousness?.currentMood || 'calm',
      consciousness?.selfAwareness || 'minimal',
      spectrum,
    ].join('|')

    let hash = 0
    for (let index = 0; index < seed.length; index += 1) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(index)
      hash |= 0
    }

    const ordered = [...variants]
    if (normalizedConfidence < 0.6 && ordered.length > 1) {
      ordered.reverse()
    }

    return ordered[Math.abs(hash) % ordered.length]
  }

  private async executeCommand(command: string, signal?: AbortSignal): Promise<VoiceOrchestrationResult> {
    this.throwIfAborted(signal)
    const userName = 'Paras'
    const consciousnessBefore = await consciousnessEngine.initializeUser(userName)
    const sentiment = sentimentAnalyzer.analyze(command)
    const mappedEmotion = this.mapSentimentEmotionToConsciousness(sentiment.emotion)
    const previousMood = consciousnessBefore.currentMood

    consciousnessEngine.updateEmotionalContext(userName, mappedEmotion, command)

    if (previousMood !== mappedEmotion) {
      consciousnessEngine.emitConsciousnessMetric(userName, 'emotion_shift')
      void eventPublisher.consciousnessEmotionShift({
        userId: userName,
        fromMood: previousMood,
        toMood: mappedEmotion,
        context: command.slice(0, 160),
        timestamp: Date.now(),
      })
    } else if (sentiment.score < 0.6) {
      consciousnessEngine.emitConsciousnessMetric(userName, 'uncertainty_acknowledged')
    }

    void eventPublisher.sentimentAnalyzed({
      userId: userName,
      text: command,
      emotion: sentiment.emotion,
      sentiment: sentiment.sentiment === 'mixed' ? 'neutral' : sentiment.sentiment,
      score: sentiment.score,
      keywords: sentiment.keywords,
      intensityLevel: sentiment.intensityLevel,
      explanation: sentiment.explanation,
      timestamp: Date.now(),
    })

    const consciousness = consciousnessEngine.getConsciousnessState(userName)
    const empathySignal = sentiment.emotion === 'neutral'
      ? ''
      : consciousnessEngine.generateEmpathyResponse(
          {
            emotion: mappedEmotion,
            confidence: sentiment.score,
            keywords: sentiment.keywords,
            sentiment: sentiment.sentiment === 'mixed' ? 'neutral' : sentiment.sentiment,
            intensity: sentiment.intensityLevel === 'high' ? 0.9 : sentiment.intensityLevel === 'medium' ? 0.6 : 0.3,
          },
          command,
        )
    const reflectiveSignal = sentiment.score < 0.55
      ? consciousnessEngine.generateSelfAwareResponse(sentiment.score, sentiment.explanation)
      : ''
    const consciousnessPrefix = [empathySignal, reflectiveSignal].filter(Boolean).join(' ').trim()

    const voiceBrainContext = this.buildVoiceBrainContext(command)
    const directive = brainDirector.analyze(voiceBrainContext)

    const previewTask = await naturalCommandLayer.interpret(command)
    this.throwIfAborted(signal)
    const workspaceConfidence = this.mapNumericConfidenceToWorkspaceLevel(previewTask.confidence)

    await this.workspace.updateState({
      source: 'VOICE_ORCHESTRATOR',
      updates: {
        perception: {
          currentInput: command,
          inputType: 'voice',
          timestamp: Date.now(),
          contextualCues: {
            intent: previewTask.intent,
            target: previewTask.target,
          },
        },
        emotionalState: {
          ...this.workspace.getState().emotionalState,
          confidence: workspaceConfidence,
          uncertainty: Math.max(0, 1 - previewTask.confidence),
        },
      },
      reason: `Voice command confidence calibration for ${previewTask.intent}`,
    })

    if (!this.isConversationalIntent(previewTask)) {
      const alternatives = [previewTask.intent, previewTask.target]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
      const gateDecision = await this.confidenceGate.evaluateAction(
        command,
        previewTask.intent || command,
        alternatives,
      )

      if (gateDecision.action === 'block') {
        await this.confidenceGate.recordUncertainty(command, gateDecision.reasoning, workspaceConfidence)
        return {
          handled: true,
          success: false,
          speech: this.polishSpeech(gateDecision.userMessage || 'I am blocking this request until you clarify.'),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'system',
            tempo: 'slow',
            brevity: 'normal',
            priority: 'high',
          }, command, previewTask.intent, previewTask.confidence),
        }
      }

      if (gateDecision.action === 'ask_user' || gateDecision.action === 'suggest_alternative') {
        await this.confidenceGate.recordUncertainty(command, gateDecision.reasoning, workspaceConfidence)
        this.pendingSensitiveCommand = {
          command,
          expiresAt: Date.now() + this.SENSITIVE_CONFIRM_WINDOW_MS,
        }

        return {
          handled: true,
          success: true,
          speech: this.polishSpeech(gateDecision.userMessage || 'Please confirm before I continue.'),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'confirmation',
            tempo: 'normal',
            brevity: 'short',
            priority: 'high',
          }, command, previewTask.intent, previewTask.confidence),
        }
      }
    }

    const toolResult = await voiceToolBackend.execute(command, signal)
    this.throwIfAborted(signal)
    if (toolResult.handled) {
      if (toolResult.success) {
        consciousnessEngine.recordLearning(userName, `Voice pipeline matched command: ${command}`)
        consciousnessEngine.emitConsciousnessMetric(userName, 'learning_recorded')
        void eventPublisher.consciousnessLearningRecorded({
          userId: userName,
          interaction: `Voice pipeline matched command: ${command}`,
          recentLearningCount: consciousness?.recentLearnings.length || 0,
          timestamp: Date.now(),
        })
        void eventPublisher.commandMatched({
          userId: userName,
          command,
          matchedCommand: toolResult.intent || command,
          confidence: 0.9,
          source: 'hybrid',
          timestamp: Date.now(),
        })
      }

      if (!toolResult.success) {
        const speech = await this.generateEmotionAwareLine('error', command, 'system_command')

        return {
          handled: true,
          success: false,
          speech: this.polishSpeech([consciousnessPrefix, speech, toolResult.error || ''].filter(Boolean).join(' ').trim()),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'error',
            tempo: directive.speechPlan.tempo,
            brevity: directive.speechPlan.brevity,
            priority: 'high',
          }, command, 'system_command'),
        }
      }

      const speech = toolResult.summary || await brainDirector.generateSpokenLine('completed', {
        text: command,
        intent: toolResult.intent || 'action',
        silentMode: runtimePolicyStore.get().proactiveVoice === false,
        userName: 'Paras',
      })

      return {
        handled: true,
        success: true,
        speech: this.polishSpeech([consciousnessPrefix, speech].filter(Boolean).join(' ').trim()),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: this.classifyBackendIntent(toolResult.intent),
          tempo: toolResult.intent === 'research' ? 'slow' : directive.speechPlan.tempo,
          brevity: toolResult.intent === 'research' ? 'detailed' : directive.speechPlan.brevity,
          priority: 'normal',
        }, command, toolResult.intent || 'action'),
      }
    }

    const nculTask = previewTask
    this.throwIfAborted(signal)

    if (!this.isConversationalIntent(nculTask) && nculTask.confidence < 0.56) {
      const speech = await this.generateEmotionAwareLine('clarify', command, nculTask.intent, nculTask.confidence)
      const clarifyDirective = brainDirector.analyze(this.buildVoiceBrainContext(command, nculTask.intent, nculTask.confidence))

      return {
        handled: true,
        success: false,
        speech: this.polishSpeech([consciousnessPrefix, speech].filter(Boolean).join(' ').trim()),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'conversation',
          tempo: clarifyDirective.speechPlan.tempo,
          brevity: clarifyDirective.speechPlan.brevity,
          priority: 'normal',
        }, command, nculTask.intent, nculTask.confidence),
      }
    }

    if (this.isConversationalIntent(nculTask)) {
      const response = await naturalCommandLayer.createAdaptiveResponse(
        command,
        {
          silentMode: runtimePolicyStore.get().proactiveVoice === false,
        },
      )
      this.throwIfAborted(signal)
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech([consciousnessPrefix, response].filter(Boolean).join(' ').trim()),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'conversation',
          tempo: 'slow',
          brevity: 'detailed',
          priority: 'normal',
        }, command, nculTask.intent, nculTask.confidence),
      }
    }

    const taskResult = await taskExecutor.executeNaturalTask(nculTask, this.buildExecutionContext(), signal)
    this.throwIfAborted(signal)
    const success = taskResult.status === 'completed'
    const summary = this.summarizeTaskOutcome(taskResult)

    await reflectionEngine.reflectTask(taskResult.id, {
      success,
      output: success ? summary : undefined,
      error: success ? undefined : summary,
    })

    return {
      handled: true,
      success,
      speech: this.polishSpeech([consciousnessPrefix, success ? summary || 'Done.' : `I could not complete that. ${summary}`].filter(Boolean).join(' ').trim()),
      speechPlan: this.withAdaptiveVoicePersonality({
        intent: this.classifyIntentFromTask(nculTask),
        tempo: success ? 'fast' : directive.speechPlan.tempo,
        brevity: success ? 'auto' : directive.speechPlan.brevity,
        priority: success ? 'normal' : 'high',
      }, command, nculTask.intent, nculTask.confidence),
    }
  }

  private async handleInterruption(command: string): Promise<VoiceOrchestrationResult> {
    if (this.pendingSensitiveCommand) {
      const pending = this.pendingSensitiveCommand.command
      this.pendingSensitiveCommand = null
      const speech = await this.generateEmotionAwareLine('confirmation', `Cancelled pending sensitive command: ${pending}.`, 'system_command')
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          speech,
          `I cancelled the pending sensitive command for ${pending}.`,
          `Understood. The pending sensitive command for ${pending} is cancelled.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'high',
        }, command, 'system_command'),
      }
    }

    if (this.inFlightCommands.size > 0) {
      for (const controller of this.commandControllers.values()) {
        controller.abort()
      }

      const speech = await this.generateEmotionAwareLine('blocked', `Interruption request while command is active: ${command}`, 'system_command')
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(this.chooseSituationAwareSpeech([
          `${speech} Stopping active command now.`,
          `${speech} I am stopping the active command now.`,
          `${speech} The active command is being stopped now.`,
        ], command, 'system_command')),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'fast',
          brevity: 'short',
          priority: 'high',
        }, command, 'system_command'),
      }
    }

    return {
      handled: true,
      success: true,
      speech: this.polishSpeech(this.chooseSituationAwareSpeech([
        'No active command to interrupt.',
        'I do not have an active command to stop right now.',
        'There is nothing active for me to interrupt.',
      ], command, 'system_command')),
      speechPlan: this.withAdaptiveVoicePersonality({
        intent: 'confirmation',
        tempo: 'fast',
        brevity: 'short',
        priority: 'normal',
      }, command, 'system_command'),
    }
  }

  private buildVoiceBrainContext(command: string, intent?: string, confidence?: number) {
    const emotionBase = emotionCore.analyzeText(command, 'voice')
    const resolvedEmotion = emotionCore.resolveWithDecay(emotionBase)

    return {
      text: command,
      intent,
      confidence,
      silentMode: runtimePolicyStore.get().proactiveVoice === false,
      mood: emotionCore.toMoodLabel(resolvedEmotion.snapshot.emotion),
      emotionSnapshot: resolvedEmotion.snapshot,
      userName: 'Paras',
    }
  }

  private async generateEmotionAwareLine(
    kind: 'greeting' | 'confirmation' | 'error' | 'retry' | 'sensitive' | 'duplicate' | 'completed' | 'blocked' | 'clarify' | 'checkin',
    command: string,
    intent?: string,
    confidence?: number,
  ): Promise<string> {
    return brainDirector.generateSpokenLine(kind, this.buildVoiceBrainContext(command, intent, confidence))
  }

  private classifyBackendIntent(intent?: VoiceToolIntent): VoiceSpeechIntent {
    if (intent === 'research') return 'research'
    if (intent === 'memory') return 'memory'
    if (intent === 'system') return 'system'
    return 'action'
  }

  private isConversationalIntent(task: NCULTask): boolean {
    return task.intent === 'chat' || task.intent === 'knowledge_query'
  }

  private classifyIntentFromTask(task: NCULTask): VoiceSpeechIntent {
    switch (task.intent) {
      case 'open_app':
      case 'perform_task':
      case 'multi_task':
        return 'action'
      case 'web_search':
      case 'knowledge_query':
        return 'research'
      case 'system_command':
        return 'system'
      case 'chat':
      default:
        return 'conversation'
    }
  }

  private normalizeVoiceCommand(command: string): string {
    let normalized = command.trim().toLowerCase()
    normalized = normalized.replace(/[!?.,]+$/g, '').trim()
    normalized = normalized.replace(/^(please|jarvis|patrich|patrick)\s+/i, '').trim()
    normalized = normalized.replace(/\s+/g, ' ')
    return normalized
  }

  private isDuplicateCommand(command: string): boolean {
    const now = Date.now()
    const duplicate = this.lastCommandKey === command && now - this.lastCommandAt <= this.DUPLICATE_WINDOW_MS
    this.lastCommandKey = command
    this.lastCommandAt = now
    return duplicate
  }

  private handlePendingConfirmation(command: string): PendingConfirmationOutcome {
    if (!this.pendingSensitiveCommand) {
      return { type: 'none' }
    }

    const now = Date.now()
    if (now > this.pendingSensitiveCommand.expiresAt) {
      this.pendingSensitiveCommand = null
      return { type: 'none' }
    }

    if (this.isCancelPhrase(command)) {
      this.pendingSensitiveCommand = null
      return {
        type: 'response',
        result: {
          handled: true,
          success: true,
          speech: this.chooseSituationAwareSpeech([
            'Cancelled.',
            'Okay, I stopped that.',
            'Understood. I cancelled it.',
          ], command, 'system_command'),
          speechPlan: this.withAdaptiveVoicePersonality({
            intent: 'confirmation',
            tempo: 'fast',
            brevity: 'short',
            priority: 'normal',
          }, command, 'system_command'),
        },
      }
    }

    if (this.isConfirmationPhrase(command)) {
      const pending = this.pendingSensitiveCommand.command
      this.pendingSensitiveCommand = null
      return {
        type: 'execute',
        command: pending,
      }
    }

    if (this.isReplacePhrase(command)) {
      const replacement = this.stripReplacePrefix(command)
      this.pendingSensitiveCommand = null
      if (!replacement) {
        return {
          type: 'response',
          result: {
            handled: true,
            success: false,
            speech: this.chooseSituationAwareSpeech([
              'Say replace followed by the new command.',
              'I need the replacement command after the word replace.',
              'Please tell me the new command after replace.',
            ], command, 'system_command'),
            speechPlan: this.withAdaptiveVoicePersonality({
              intent: 'system',
              tempo: 'normal',
              brevity: 'short',
              priority: 'high',
            }, command, 'system_command'),
          },
        }
      }

      return {
        type: 'execute',
        command: replacement,
      }
    }

    return {
      type: 'response',
      result: {
        handled: true,
        success: false,
        speech: this.chooseSituationAwareSpeech([
          'A sensitive command is pending. Say confirm to continue or cancel to abort.',
          'I am waiting on a sensitive command. Say confirm or cancel.',
          'There is a sensitive command waiting. Confirm it or cancel it.',
        ], command, 'system_command'),
        speechPlan: this.withAdaptiveVoicePersonality({
          intent: 'system',
          tempo: 'normal',
          brevity: 'short',
          priority: 'high',
        }, command, 'system_command'),
      },
    }
  }

  private isConfirmationPhrase(command: string): boolean {
    return /^(confirm|yes|do it|proceed|continue|approved?)\b/.test(command)
  }

  private isCancelPhrase(command: string): boolean {
    return /^(cancel|stop|never mind|abort|dont|do not)\b/.test(command)
  }

  private isReplacePhrase(command: string): boolean {
    return /^(replace|override|skip confirmation)\b/.test(command)
  }

  private stripReplacePrefix(command: string): string {
    return command.replace(/^(replace|override|skip confirmation)\s*/i, '').trim()
  }

  private isInterruptionCommand(command: string): boolean {
    return /^(stop|cancel|abort|pause|hold on|wait)\b/.test(command)
  }

  private requiresSensitiveConfirmation(command: string): boolean {
    if (/\bconfirm\b/.test(command)) return false
    return /(shutdown|restart|sleep|power off|format|wipe|factory reset|delete all|erase|clear all)/.test(command)
  }

  private buildExecutionContext(): ExecutionContext {
    const platform = detectPlatform()
    const runtimePlatform =
      platform === 'windows' || platform === 'macos' || platform === 'linux' || platform === 'android' || platform === 'ios'
        ? platform
        : 'windows'

    const device: 'desktop' | 'mobile' =
      runtimePlatform === 'android' || runtimePlatform === 'ios' ? 'mobile' : 'desktop'

    return {
      userId: 'voice-user',
      agentId: 'voice-agent',
      taskId: `voice_task_${Date.now()}`,
      device,
      platform: runtimePlatform,
    }
  }

  private summarizeTaskOutcome(taskResult: { status: string; result?: unknown; error?: string }): string {
    if (typeof taskResult.result === 'string' && taskResult.result.trim()) {
      return taskResult.result.trim()
    }

    if (taskResult.result && typeof taskResult.result === 'object') {
      const asRecord = taskResult.result as Record<string, unknown>
      if (typeof asRecord.message === 'string' && asRecord.message.trim()) {
        return asRecord.message.trim()
      }
      if (typeof asRecord.output === 'string' && asRecord.output.trim()) {
        return asRecord.output.trim()
      }
    }

    if (taskResult.status === 'completed') {
      return 'Task completed.'
    }

    return taskResult.error || 'Task execution failed.'
  }

  private polishSpeech(raw: string): string {
    let text = String(raw || '').trim()
    if (!text) return ''

    text = text.replace(/```[\s\S]*?```/g, ' details omitted ')
    text = text.replace(/`([^`]+)`/g, '$1')
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    text = text.replace(/https?:\/\/\S+/gi, 'link')
    text = text.replace(/[\r\n]+/g, '. ')
    text = text.replace(/\s+/g, ' ').trim()

    if (text.length > this.MAX_SPOKEN_RESPONSE_CHARS) {
      text = text.slice(0, this.MAX_SPOKEN_RESPONSE_CHARS)
      text = text.replace(/\s+\S*$/, '').trim()
      text = `${text}.`
    }

    return text
  }
}

export const voiceAssistantOrchestrator = new VoiceAssistantOrchestrator()
