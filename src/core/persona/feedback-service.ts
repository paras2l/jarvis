import { personaTelemetryService } from './persona-telemetry'
export type PersonaFeedback = 'up' | 'down'

class FeedbackService {
  private history: Array<{ feedback: PersonaFeedback; timestamp: number; note?: string }> = []

  submit(feedback: PersonaFeedback, note?: string): void {
    this.history.push({ feedback, timestamp: Date.now(), note })
    personaTelemetryService.recordFeedback(feedback === 'up')
  }

  score(): number {
    if (this.history.length === 0) return 0.5
    const up = this.history.filter((h) => h.feedback === 'up').length
    return up / this.history.length
  }

  recent(limit = 10) {
    return this.history.slice(-limit)
  }
}

export const feedbackService = new FeedbackService()
