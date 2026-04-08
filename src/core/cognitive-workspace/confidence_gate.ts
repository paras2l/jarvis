/**
 * Confidence Gate
 * 
 * Before Action Execution
 * 
 * If confidence < threshold:
 *   - Ask user for confirmation
 *   - Present alternatives
 *   - Log uncertainty
 * 
 * Prevents mistakes and maintains user trust
 */

import { getCognitiveWorkspace } from './workspace_controller.ts'
import { getWorkspaceListener } from './workspace_subscribers.ts'
import type { ConfidenceLevel } from './workspace_state.ts'

export type ConfidenceThreshold = 'high' | 'medium' | 'low'
export type GateAction = 'allow' | 'ask_user' | 'suggest_alternative' | 'block'

/**
 * Confidence threshold mapping
 */
const CONFIDENCE_NUMERIC: Record<ConfidenceLevel, number> = {
  high: 0.85,
  medium: 0.6,
  low: 0.3,
  unknown: 0.0,
}

/**
 * Gate decision result
 */
export interface GateDecision {
  action: GateAction
  confidence: number
  reasoning: string
  alternatives?: {
    description: string
    confidence: number
  }[]
  userConfirmationNeeded?: boolean
  userMessage?: string
}

/**
 * Gate configuration
 */
export interface ConfidenceGateConfig {
  threshold: ConfidenceThreshold // If below this, ask user
  criticalActionsThreshold: ConfidenceThreshold // Stricter threshold for dangerous ops
  criticalActions?: string[] // Commands that need higher confidence
  autoAllowAbove: ConfidenceThreshold // Auto-allow if confidence above this
  showAlternatives: boolean
  logUncertainty: boolean
}

/**
 * Confidence Gate Manager
 * 
 * Validates decisions before execution
 */
export class ConfidenceGateManager {
  private workspace = getCognitiveWorkspace()
  private listener = getWorkspaceListener()
  private config: ConfidenceGateConfig = {
    threshold: 'medium',
    criticalActionsThreshold: 'high',
    criticalActions: [
      'delete_files',
      'modify_system',
      'install_software',
      'run_script',
      'factory_reset',
    ],
    autoAllowAbove: 'high',
    showAlternatives: true,
    logUncertainty: true,
  }

  constructor(config?: Partial<ConfidenceGateConfig>) {
    this.config = { ...this.config, ...config }
  }

  /**
   * Evaluate action confidence
   * 
   * Returns gate decision
   */
  public async evaluateAction(
    command: string,
    intent: string,
    alternatives?: string[],
  ): Promise<GateDecision> {
    const state = this.listener.getState()
    const confidence = state.emotionalState.confidence
    const confidenceValue = CONFIDENCE_NUMERIC[confidence] ?? 0

    // Check if critical action
    const isCritical = this.isCriticalAction(command)
    const threshold = isCritical
      ? CONFIDENCE_NUMERIC[this.config.criticalActionsThreshold]
      : CONFIDENCE_NUMERIC[this.config.threshold]

    // Auto-allow if confidence very high
    if (confidenceValue >= CONFIDENCE_NUMERIC[this.config.autoAllowAbove]) {
      return {
        action: 'allow',
        confidence: confidenceValue,
        reasoning: `High confidence (${confidence}) - proceeding`,
      }
    }

    // Block if critical and low confidence
    if (isCritical && confidenceValue < CONFIDENCE_NUMERIC.medium) {
      return {
        action: 'block',
        confidence: confidenceValue,
        reasoning: `Critical action requires higher confidence. Current: ${confidence}, required: medium`,
        userMessage: `⚠️ I'm not confident about this critical action. Can you clarify: "${intent}"?`,
      }
    }

    // Ask user if below threshold
    if (confidenceValue < threshold) {
      return {
        action: 'ask_user',
        confidence: confidenceValue,
        reasoning: `Confidence (${confidence}) is below threshold (${this.config.threshold})`,
        alternatives: alternatives?.map((alt) => ({
          description: alt,
          confidence: 0.5,
        })),
        userConfirmationNeeded: true,
        userMessage: this.buildUserMessage(command, intent, confidence, alternatives),
      }
    }

    // Suggest alternatives if matching is uncertain
    if (confidenceValue === CONFIDENCE_NUMERIC.medium && alternatives) {
      return {
        action: 'suggest_alternative',
        confidence: confidenceValue,
        reasoning: `Medium confidence - suggesting alternatives`,
        alternatives: alternatives.map((alt) => ({
          description: alt,
          confidence: 0.5,
        })),
        userMessage: this.buildAlternativesMessage(command, alternatives),
      }
    }

    // Allow if above threshold
    return {
      action: 'allow',
      confidence: confidenceValue,
      reasoning: `Confidence (${confidence}) meets threshold (${this.config.threshold})`,
    }
  }

  /**
   * Check if action is marked as critical
   */
  private isCriticalAction(command: string): boolean {
    const normalized = command.toLowerCase()
    return (
      this.config.criticalActions?.some((critical) =>
        normalized.includes(critical.toLowerCase()),
      ) || false
    )
  }

  /**
   * Build user confirmation message
   */
  private buildUserMessage(
    command: string,
    intent: string,
    confidence: ConfidenceLevel,
    alternatives?: string[],
  ): string {
    let message = `I'm ${confidence} confident about this:\n`
    message += `Command: "${command}"\n`
    message += `Intent: "${intent}"\n`

    if (alternatives && alternatives.length > 0) {
      message += `\nDid you mean:\n`
      alternatives.forEach((alt, i) => {
        message += `${i + 1}. ${alt}\n`
      })
      message += `Or confirm the original: "${command}"`
    } else {
      message += `\nShould I proceed?`
    }

    return message
  }

  /**
   * Build alternatives suggestion message
   */
  private buildAlternativesMessage(command: string, alternatives: string[]): string {
    let message = `Did you mean:\n`
    alternatives.forEach((alt, i) => {
      message += `${i + 1}. ${alt}\n`
    })
    message += `\nOr confirm: "${command}"`
    return message
  }

  /**
   * Record uncertainty event
   */
  public async recordUncertainty(
    command: string,
    reason: string,
    confidence: ConfidenceLevel,
  ): Promise<void> {
    if (!this.config.logUncertainty) return

    this.workspace.recordDecision(
      `Uncertainty gate triggered`,
      `Command: "${command}", Reason: "${reason}", Confidence: ${confidence}`,
      confidence,
      ['emotionalState', 'activeTask'],
    )

    // Emit event for logging
    console.warn(`[ConfidenceGate] Uncertainty recorded: ${reason}`)
  }

  /**
   * Get gate statistics
   */
  public getStatistics() {
    return {
      config: this.config,
      recentDecisions: this.workspace.getRecentDecisions(20).filter((d) =>
        d.decision.includes('gate') || d.decision.includes('uncertainty'),
      ),
    }
  }

  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<ConfidenceGateConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}

/**
 * Singleton gate instance
 */
let globalConfidenceGate: ConfidenceGateManager | null = null

export function getConfidenceGate(config?: Partial<ConfidenceGateConfig>): ConfidenceGateManager {
  if (!globalConfidenceGate) {
    globalConfidenceGate = new ConfidenceGateManager(config)
  }
  return globalConfidenceGate
}

export function resetConfidenceGate(config?: Partial<ConfidenceGateConfig>): ConfidenceGateManager {
  globalConfidenceGate = new ConfidenceGateManager(config)
  return globalConfidenceGate
}

export default ConfidenceGateManager
