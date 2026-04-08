import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import { reflectiveLearningCore } from '@/layers/reflective_learning/reflective_learning_core'
import { memoryManager } from '@/layers/memory/memory_manager'
import { aliasNormalizer } from './alias_normalizer'
import { confidenceVerifier } from './confidence_verifier'
import { screenState } from './screen_state'
import { sensorMonitor } from './sensor_monitor'
import { voicePerception } from './voice_perception'
import { NormalizedCommand, PerceptionCycleResult, PerceptionHealth, SensorSignal } from './types'

class PerceptionManager {
  private started = false
  private unsubs: Array<() => void> = []
  private totalCycles = 0
  private verificationCount = 0
  private voiceConfidence = 0.5
  private screenConfidence = 0.5
  private sensorConfidence = 0.5
  private lastCycleAt = 0

  start(): void {
    if (this.started) {
      return
    }

    this.unsubs.push(
      eventBus.subscribe('task_completed', (envelope) => {
        const payload = envelope.payload as { taskId?: string; summary?: string }
        void this.logActionFeedback(String(payload.taskId ?? 'unknown-task'), true, String(payload.summary ?? 'task completed'))
      }),
      eventBus.subscribe('task_failed', (envelope) => {
        const payload = envelope.payload as { taskId?: string; error?: string }
        void this.logActionFeedback(String(payload.taskId ?? 'unknown-task'), false, String(payload.error ?? 'task failed'))
      }),
    )

    this.started = true
  }

  stop(): void {
    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []
    this.started = false
  }

  async perceiveVoice(rawText: string, source: 'microphone' | 'text' | 'system' = 'text'): Promise<{ command: NormalizedCommand; clarificationPrompt?: string }> {
    const parsed = voicePerception.parse({
      rawText,
      source,
      timestamp: Date.now(),
    })

    this.voiceConfidence = parsed.command.confidence
    if (parsed.clarificationPrompt) {
      this.verificationCount += 1
    }

    await eventPublisher.commandParsed({
      commandId: parsed.command.commandId,
      originalText: parsed.command.originalText,
      intent: parsed.command.intent,
      confidence: parsed.command.confidence,
      requiresConfirmation: parsed.command.requiresVerification,
      metadata: {
        aliasesApplied: parsed.command.aliasesApplied,
        entities: parsed.command.entities,
      },
    }, 'perception-layer')

    return parsed
  }

  async updateScreen(input: {
    focusedWindowTitle?: string
    windows: Array<{ title: string; appName: string; executable?: string; isFocused?: boolean; isMinimized?: boolean }>
  }): Promise<void> {
    const result = await screenState.updateSnapshot(input)
    this.screenConfidence = result.snapshot.confidence
    if (result.clarificationPrompt) {
      this.verificationCount += 1
    }
  }

  async ingestSensor(signal: Omit<SensorSignal, 'signalId'>): Promise<void> {
    const saved = await sensorMonitor.ingestSignal(signal)
    this.sensorConfidence = saved.confidence
  }

  async executePerceptionCycle(input: {
    voiceText?: string
    voiceSource?: 'microphone' | 'text' | 'system'
    screen?: {
      focusedWindowTitle?: string
      windows: Array<{ title: string; appName: string; executable?: string; isFocused?: boolean; isMinimized?: boolean }>
    }
    signals?: Array<Omit<SensorSignal, 'signalId'>>
  }): Promise<PerceptionCycleResult> {
    const cycleId = `pc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const timestamp = Date.now()
    const signals: SensorSignal[] = []
    let voice: NormalizedCommand | undefined

    if (input.voiceText) {
      const voiceResult = await this.perceiveVoice(input.voiceText, input.voiceSource ?? 'text')
      voice = voiceResult.command
    }

    if (input.screen) {
      await this.updateScreen(input.screen)
    }

    for (const signal of input.signals ?? []) {
      await this.ingestSensor(signal)
      const latest = sensorMonitor.listRecent(1)[0]
      if (latest) {
        signals.push(latest)
      }
    }

    const blended = this.voiceConfidence * 0.4 + this.screenConfidence * 0.35 + this.sensorConfidence * 0.25
    const crossModal = confidenceVerifier.evaluateCrossModal(this.voiceConfidence, this.screenConfidence)
    const requiresVerification = Boolean(crossModal.clarificationPrompt)

    if (requiresVerification) {
      this.verificationCount += 1
    }

    this.totalCycles += 1
    this.lastCycleAt = timestamp

    const result: PerceptionCycleResult = {
      cycleId,
      timestamp,
      voice,
      screen: screenState.getLatest() ?? undefined,
      signals,
      aggregateConfidence: blended,
      requiresVerification,
    }

    memoryManager.putWorking('perception_cycle', {
      cycleId,
      aggregateConfidence: result.aggregateConfidence,
      requiresVerification,
      voiceIntent: voice?.intent,
    }, {
      confidence: result.aggregateConfidence,
      tags: ['perception', 'cycle'],
      ttlMs: 1000 * 60 * 10,
    })

    memoryManager.recordEpisode('perception_cycle_completed', {
      cycleId,
      aggregateConfidence: result.aggregateConfidence,
      requiresVerification,
      voiceIntent: voice?.intent,
      signalCount: signals.length,
    }, {
      tags: ['perception', 'cycle'],
      importance: Math.max(0.5, result.aggregateConfidence),
      success: !requiresVerification,
      summary: requiresVerification ? 'cycle requires clarification' : 'cycle accepted',
    })

    await eventPublisher.perceptionVerified({
      cycleId,
      aggregateConfidence: result.aggregateConfidence,
      requiresVerification,
      channels: {
        voice: this.voiceConfidence,
        screen: this.screenConfidence,
        sensor: this.sensorConfidence,
      },
    })

    return result
  }

  learnAlias(alias: string, canonical: string, confidence = 0.82): void {
    aliasNormalizer.learnAlias(alias, canonical, confidence)
  }

  async logActionFeedback(actionId: string, success: boolean, summary: string): Promise<void> {
    memoryManager.recordEpisode('perception_action_feedback', {
      actionId,
      success,
      summary,
    }, {
      actionId,
      tags: ['perception', 'action-feedback'],
      importance: success ? 0.7 : 0.85,
      success,
      summary,
    })

    reflectiveLearningCore.recordActionOutcome(actionId, 'reactive', success)

    await eventPublisher.actionFeedbackLogged({
      actionId,
      success,
      summary,
      source: 'perception-layer',
    })
  }

  getHealth(): PerceptionHealth {
    return {
      lastCycleAt: this.lastCycleAt,
      voiceConfidence: this.voiceConfidence,
      screenConfidence: this.screenConfidence,
      sensorConfidence: this.sensorConfidence,
      verificationRate: this.totalCycles > 0 ? this.verificationCount / this.totalCycles : 0,
      totalCycles: this.totalCycles,
    }
  }
}

export const perceptionManager = new PerceptionManager()
