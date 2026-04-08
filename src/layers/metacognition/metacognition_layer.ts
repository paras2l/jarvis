import { eventBus } from '@/event_system/event_bus'
import { eventPublisher } from '@/event_system/event_publisher'
import type { EventEnvelope, EventPayloadMap, SystemEventName } from '@/event_system/event_types'
import { detectPlatform } from '@/core/platform/platform-detection'
import { globalWorkspaceLayer } from '@/layers/global_workspace/global_workspace_layer'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { confidenceEngine } from './confidence_engine'
import { evaluationMetrics, type EvaluationScore } from './evaluation_metrics'
import { feedbackLogger } from './feedback_logger'
import { strategyOptimizer, type StrategySnapshot } from './strategy_optimizer'
import { contextManager } from '@/layers/identity_continuity/context_manager'

export interface MetacognitionReport {
  timestamp: number
  metrics: EvaluationScore
  strategy: StrategySnapshot
  calibratedConfidence?: number
}

class MetacognitionLayer {
  private started = false
  private unsubs: Array<() => void> = []
  private intervalId: number | null = null
  private lastReport: MetacognitionReport | null = null

  start(): void {
    if (this.started) return

    this.unsubs.push(
      eventBus.subscribe('task_completed', (envelope) => {
        void this.onOutcomeEvent(envelope)
      }),
      eventBus.subscribe('task_failed', (envelope) => {
        void this.onOutcomeEvent(envelope)
      }),
      eventBus.subscribe('command_parsed', (envelope) => {
        void this.onCommandParsed(envelope)
      }),
    )

    this.intervalId = window.setInterval(() => {
      void this.runEvaluationCycle('interval')
    }, 20_000)

    this.started = true
    feedbackLogger.log('evaluation', 'Metacognition layer started')
  }

  stop(): void {
    this.unsubs.forEach((unsub) => unsub())
    this.unsubs = []
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.started = false
    feedbackLogger.log('evaluation', 'Metacognition layer stopped')
  }

  getExecutionThreshold(): number {
    return strategyOptimizer.getStrategy().executionThreshold
  }

  getReport(): MetacognitionReport | null {
    return this.lastReport
  }

  async calibrateCommandConfidence(input: string, rawConfidence: number): Promise<number> {
    const platform = detectPlatform()
    const calibrated = await confidenceEngine.calibrateCommandConfidence(input, rawConfidence, platform)
    feedbackLogger.log('calibration', 'Command confidence calibrated', {
      input,
      rawConfidence,
      calibrated,
    })
    return calibrated
  }

  private async onCommandParsed<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
  ): Promise<void> {
    const payload = envelope.payload as unknown as Record<string, unknown>
    const text = String(payload.originalText || '')
    const confidence = Number(payload.confidence || 0.6)

    const calibrated = await this.calibrateCommandConfidence(text, confidence)
    if (confidenceEngine.shouldClarify(calibrated, this.getExecutionThreshold())) {
      feedbackLogger.log('failure', 'Low calibrated confidence requires clarification', {
        text,
        calibrated,
        threshold: this.getExecutionThreshold(),
      })
    }
  }

  private async onOutcomeEvent<TName extends SystemEventName>(
    envelope: EventEnvelope<EventPayloadMap[TName]>,
  ): Promise<void> {
    await this.runEvaluationCycle(String(envelope.name))
  }

  private async runEvaluationCycle(reason: string): Promise<void> {
    const workspace = globalWorkspaceLayer.getState()
    const selfState = selfModelLayer.getSelfState()

    const metrics = evaluationMetrics.evaluate(workspace, selfState)
    const strategy = strategyOptimizer.applyEvaluation(metrics)

    const calibrated = confidenceEngine.calibrate(
      selfState.confidenceCurrent,
      metrics.utilityScore,
      metrics.taskCompletionRate,
    )

    if (Math.abs(calibrated - selfState.confidenceCurrent) > 0.18) {
      await selfModelLayer.onSystemEvent('metacognition_confidence_mismatch', {
        calibrated,
        current: selfState.confidenceCurrent,
        reason,
      })
    }

    const continuity = await contextManager.buildContinuityContext(reason)
    const trustMatch = continuity.relationshipContext.match(/Trust score:\s*([0-9.]+)/i)
    const trustScore = trustMatch ? Number(trustMatch[1]) : 0.5
    const openPromiseCount = continuity.openPromises.length

    if (openPromiseCount > 0 && metrics.taskCompletionRate < 0.4) {
      await selfModelLayer.onSystemEvent('identity_promise_pressure', {
        openPromiseCount,
        completionRate: metrics.taskCompletionRate,
        reason,
      })
      feedbackLogger.log('failure', 'Identity continuity pressure detected from open promises', {
        openPromiseCount,
        completionRate: metrics.taskCompletionRate,
      })
    }

    if (trustScore > 0.75 && calibrated < 0.35) {
      await selfModelLayer.onSystemEvent('identity_trust_confidence_mismatch', {
        trustScore,
        calibrated,
        reason,
      })
    }

    if (strategy.explorationMode) {
      await eventPublisher.notificationEmitted(
        {
          source: 'metacognition',
          title: 'Exploration mode enabled after repeated failures',
          importance: 'high',
        },
        'metacognition',
      )
    }

    this.lastReport = {
      timestamp: Date.now(),
      metrics,
      strategy,
      calibratedConfidence: calibrated,
    }

    feedbackLogger.log('strategy', 'Evaluation cycle completed', {
      reason,
      metrics,
      strategy,
      calibrated,
      trustScore,
      openPromiseCount,
    })
  }
}

export const metacognitionLayer = new MetacognitionLayer()
