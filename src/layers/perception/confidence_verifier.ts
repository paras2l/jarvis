import { PerceptionDecision } from './types'

export class ConfidenceVerifier {
  private readonly lowThreshold = 0.62
  private readonly hardBlockThreshold = 0.4
  private verifications = 0
  private cycles = 0

  evaluate(
    confidence: number,
    reasonHint: string,
    promptHint = 'I am not fully sure about this request. Can you confirm what you want?',
  ): PerceptionDecision {
    this.cycles += 1

    if (confidence < this.hardBlockThreshold) {
      this.verifications += 1
      return {
        accepted: false,
        confidence,
        reason: `${reasonHint}: confidence below hard threshold`,
        clarificationPrompt: promptHint,
      }
    }

    if (confidence < this.lowThreshold) {
      this.verifications += 1
      return {
        accepted: true,
        confidence,
        reason: `${reasonHint}: accepted with clarification`,
        clarificationPrompt: promptHint,
      }
    }

    return {
      accepted: true,
      confidence,
      reason: `${reasonHint}: high confidence`,
    }
  }

  evaluateCrossModal(voiceConfidence: number, screenConfidence: number): PerceptionDecision {
    const blended = voiceConfidence * 0.6 + screenConfidence * 0.4
    return this.evaluate(
      blended,
      'cross-modal verification',
      'I heard the command, but the current screen state may not match. Should I continue?',
    )
  }

  getVerificationRate(): number {
    if (this.cycles === 0) {
      return 0
    }
    return this.verifications / this.cycles
  }
}

export const confidenceVerifier = new ConfidenceVerifier()
