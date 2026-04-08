export interface MetacognitionFeedbackEntry {
  id: string
  timestamp: number
  category: 'evaluation' | 'strategy' | 'failure' | 'calibration'
  message: string
  payload?: Record<string, unknown>
}

export class FeedbackLogger {
  private entries: MetacognitionFeedbackEntry[] = []
  private readonly maxEntries = 800

  log(
    category: MetacognitionFeedbackEntry['category'],
    message: string,
    payload?: Record<string, unknown>,
  ): void {
    this.entries.push({
      id: `meta_feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      category,
      message,
      payload,
    })

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  recent(limit = 100): MetacognitionFeedbackEntry[] {
    return this.entries.slice(-Math.max(1, limit))
  }
}

export const feedbackLogger = new FeedbackLogger()
