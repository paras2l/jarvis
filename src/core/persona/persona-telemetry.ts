export interface PersonaTelemetry {
  greetingScore: number
  interruptionScore: number
  helpfulnessScore: number
  trustScoreTrend: number[]
  updatedAt: number
}

class PersonaTelemetryService {
  private telemetry: PersonaTelemetry = {
    greetingScore: 0.5,
    interruptionScore: 0.2,
    helpfulnessScore: 0.5,
    trustScoreTrend: [0.5],
    updatedAt: Date.now(),
  }

  recordFeedback(up: boolean): void {
    const delta = up ? 0.04 : -0.06
    this.telemetry.helpfulnessScore = this.clamp(this.telemetry.helpfulnessScore + delta)
    this.telemetry.greetingScore = this.clamp(this.telemetry.greetingScore + (up ? 0.03 : -0.04))
    this.telemetry.trustScoreTrend.push(this.clamp(this.currentTrust() + delta))
    if (this.telemetry.trustScoreTrend.length > 40) {
      this.telemetry.trustScoreTrend.shift()
    }
    this.telemetry.updatedAt = Date.now()
  }

  recordInterruption(interruptedBusyUser: boolean): void {
    if (interruptedBusyUser) {
      this.telemetry.interruptionScore = this.clamp(this.telemetry.interruptionScore + 0.08)
    } else {
      this.telemetry.interruptionScore = this.clamp(this.telemetry.interruptionScore - 0.02)
    }
    this.telemetry.updatedAt = Date.now()
  }

  get(): PersonaTelemetry {
    return {
      ...this.telemetry,
      trustScoreTrend: [...this.telemetry.trustScoreTrend],
    }
  }

  private currentTrust(): number {
    const trend = this.telemetry.trustScoreTrend
    return trend[trend.length - 1] ?? 0.5
  }

  private clamp(v: number): number {
    return Math.max(0, Math.min(1, v))
  }
}

export const personaTelemetryService = new PersonaTelemetryService()
