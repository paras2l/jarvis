/**
 * Layer 8: Learning Logger
 * Maintains auditable logs of all learning activities and system evolution
 */

import { LearningLogEntry, PolicyUpdate, ConfidenceCalibration, OutcomeEvaluation } from './types'

export class LearningLogger {
  private logEntries: Map<string, LearningLogEntry> = new Map()
  private logIndex: {
    byType: Map<string, string[]>
    bySource: Map<string, string[]>
    byTime: LearningLogEntry[]
  } = {
    byType: new Map(),
    bySource: new Map(),
    byTime: [],
  }

  constructor() {
    this.initializeLogger()
  }

  private initializeLogger(): void {
    // Initialize indices
    ;['outcome_evaluation', 'feedback_integration', 'policy_update', 'confidence_adjustment', 'metric_calculation'].forEach(
      (type) => {
        this.logIndex.byType.set(type, [])
      },
    )
  }

  /**
   * Log an outcome evaluation
   */
  logOutcomeEvaluation(
    evaluation: OutcomeEvaluation,
    source: string = 'outcome_evaluator',
  ): LearningLogEntry {
    return this.addEntry({
      type: 'outcome_evaluation',
      subject: evaluation.actionId,
      description: `${evaluation.actualOutcome ? 'Successful' : 'Failed'} outcome: ${evaluation.actualOutcome}`,
      dataSnapshot: {
        evaluationId: evaluation.evaluationId,
        accuracy: evaluation.predictionAccuracy,
        deviation: evaluation.deviationScore,
        successRate: evaluation.successRate,
        efficiency: evaluation.efficiency,
      },
      source,
    })
  }

  /**
   * Log feedback integration
   */
  logFeedbackIntegration(
    actionId: string,
    feedbackType: string,
    feedbackScore: number,
    source: string = 'feedback_collector',
  ): LearningLogEntry {
    return this.addEntry({
      type: 'feedback_integration',
      subject: actionId,
      description: `Integrated ${feedbackType} feedback (score: ${feedbackScore.toFixed(2)})`,
      dataSnapshot: {
        actionId,
        feedbackType,
        feedbackScore,
        timestamp: Date.now(),
      },
      source,
    })
  }

  /**
   * Log a policy update
   */
  logPolicyUpdate(update: PolicyUpdate, source: string = 'policy_refiner'): LearningLogEntry {
    return this.addEntry({
      type: 'policy_update',
      subject: update.policyName,
      description: `${update.updateType}: ${update.policyName} from ${update.currentValue} to ${update.suggestedValue}`,
      dataSnapshot: {
        updateId: update.updateId,
        updateType: update.updateType,
        currentValue: update.currentValue,
        suggestedValue: update.suggestedValue,
        confidence: update.confidence,
        status: update.status,
        estimatedImpact: update.estimatedImpact,
      },
      source,
      isRollbackable: true,
    })
  }

  /**
   * Log a confidence calibration
   */
  logConfidenceAdjustment(calibration: ConfidenceCalibration, source: string = 'confidence_calibrator'): LearningLogEntry {
    return this.addEntry({
      type: 'confidence_adjustment',
      subject: calibration.moduleId,
      description: `Calibrated ${calibration.moduleId} from ${calibration.previousConfidenceLevel.toFixed(2)} to ${calibration.adjustedConfidenceLevel.toFixed(2)}`,
      dataSnapshot: {
        calibrationId: calibration.calibrationId,
        moduleId: calibration.moduleId,
        actionType: calibration.actionType,
        historicalAccuracy: calibration.historicalAccuracy,
        previousConfidence: calibration.previousConfidenceLevel,
        adjustedConfidence: calibration.adjustedConfidenceLevel,
        sampleSize: calibration.sampleSize,
        reason: calibration.calibrationReason,
      },
      source,
      isRollbackable: true,
    })
  }

  /**
   * Log metric calculation
   */
  logMetricCalculation(metricName: string, values: Record<string, unknown>, source: string = 'learning_system'): LearningLogEntry {
    return this.addEntry({
      type: 'metric_calculation',
      subject: metricName,
      description: `Calculated metrics for ${metricName}`,
      dataSnapshot: values,
      source,
    })
  }

  /**
   * Internal method to add log entry
   */
  private addEntry(
    partial: Omit<LearningLogEntry, 'entryId' | 'timestamp' | 'isRollbackable'> & { isRollbackable?: boolean },
  ): LearningLogEntry {
    const entry: LearningLogEntry = {
      entryId: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      isRollbackable: false,
      ...partial,
    }

    this.logEntries.set(entry.entryId, entry)

    // Update indices
    const typeList = this.logIndex.byType.get(entry.type) || []
    typeList.push(entry.entryId)
    this.logIndex.byType.set(entry.type, typeList)

    const sourceList = this.logIndex.bySource.get(entry.source) || []
    sourceList.push(entry.entryId)
    this.logIndex.bySource.set(entry.source, sourceList)

    this.logIndex.byTime.push(entry)

    return entry
  }

  /**
   * Get entries by type
   */
  getEntriesByType(
    type: 'outcome_evaluation' | 'feedback_integration' | 'policy_update' | 'confidence_adjustment' | 'metric_calculation',
    limit: number = 100,
  ): LearningLogEntry[] {
    const ids = this.logIndex.byType.get(type) || []
    return ids
      .slice(-limit)
      .reverse()
      .map((id) => this.logEntries.get(id)!)
  }

  /**
   * Get entries by source
   */
  getEntriesBySource(source: string, limit: number = 50): LearningLogEntry[] {
    const ids = this.logIndex.bySource.get(source) || []
    return ids
      .slice(-limit)
      .reverse()
      .map((id) => this.logEntries.get(id)!)
  }

  /**
   * Get entries for a subject (e.g., all logs for an action)
   */
  getEntriesBySubject(subject: string, limit: number = 50): LearningLogEntry[] {
    return Array.from(this.logEntries.values())
      .filter((entry) => entry.subject === subject)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Get recent entries
   */
  getRecentEntries(limit: number = 50): LearningLogEntry[] {
    return this.logIndex.byTime.slice(-limit).reverse()
  }

  /**
   * Get entries within time range
   */
  getEntriesByTimeRange(startTime: number, endTime: number): LearningLogEntry[] {
    return this.logIndex.byTime.filter((entry) => entry.timestamp >= startTime && entry.timestamp <= endTime)
  }

  /**
   * Search log entries by text
   */
  searchEntries(query: string, limit: number = 50): LearningLogEntry[] {
    const lowerQuery = query.toLowerCase()
    return Array.from(this.logEntries.values())
      .filter(
        (entry) =>
          entry.description.toLowerCase().includes(lowerQuery) ||
          entry.subject.toLowerCase().includes(lowerQuery) ||
          entry.source.toLowerCase().includes(lowerQuery),
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Get rollback-capable entries
   */
  getRollbackableEntries(limit: number = 50): LearningLogEntry[] {
    return this.logIndex.byTime
      .filter((entry) => entry.isRollbackable)
      .slice(-limit)
      .reverse()
  }

  /**
   * Get statistics about logging
   */
  getLogStatistics(): {
    totalEntries: number
    entriesByType: Record<string, number>
    entriesBySource: Record<string, number>
    oldestEntry: number
    newestEntry: number
    avgEntriesPerDay: number
  } {
    const entriesByType: Record<string, number> = {}
    const entriesBySource: Record<string, number> = {}

    for (const [type, ids] of this.logIndex.byType) {
      entriesByType[type] = ids.length
    }

    for (const [source, ids] of this.logIndex.bySource) {
      entriesBySource[source] = ids.length
    }

    const entries = Array.from(this.logEntries.values())
    const oldestEntry = entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : Date.now()
    const newestEntry = entries.length > 0 ? Math.max(...entries.map((e) => e.timestamp)) : Date.now()
    const daysDifference = Math.max(1, (newestEntry - oldestEntry) / (1000 * 60 * 60 * 24))
    const avgEntriesPerDay = entries.length / daysDifference

    return {
      totalEntries: entries.length,
      entriesByType,
      entriesBySource,
      oldestEntry,
      newestEntry,
      avgEntriesPerDay,
    }
  }

  /**
   * Export logs as JSON
   */
  exportAsJSON(filter?: { type?: string; source?: string; limit?: number }): string {
    let entries = Array.from(this.logEntries.values())

    if (filter?.type) {
      entries = entries.filter((e) => e.type === filter.type)
    }

    if (filter?.source) {
      entries = entries.filter((e) => e.source === filter.source)
    }

    if (filter?.limit) {
      entries = entries.slice(-filter.limit)
    }

    return JSON.stringify(entries, null, 2)
  }

  /**
   * Export logs as CSV
   */
  exportAsCSV(filter?: { type?: string; source?: string; limit?: number }): string {
    let entries = Array.from(this.logEntries.values())

    if (filter?.type) {
      entries = entries.filter((e) => e.type === filter.type)
    }

    if (filter?.source) {
      entries = entries.filter((e) => e.source === filter.source)
    }

    if (filter?.limit) {
      entries = entries.slice(-filter.limit)
    }

    const headers = ['Entry ID', 'Timestamp', 'Type', 'Subject', 'Description', 'Source']
    const rows = entries.map((e) => [
      e.entryId,
      new Date(e.timestamp).toISOString(),
      e.type,
      e.subject,
      e.description,
      e.source,
    ])

    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')

    return csv
  }

  /**
   * Get a specific entry
   */
  getEntry(entryId: string): LearningLogEntry | undefined {
    return this.logEntries.get(entryId)
  }

  /**
   * Clear old logs (keep last N)
   */
  pruneOldLogs(keepCount: number = 5000): void {
    if (this.logEntries.size > keepCount) {
      const sorted = Array.from(this.logEntries.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp)
      const toKeep = new Map(sorted.slice(0, keepCount))

      this.logEntries = toKeep

      // Rebuild indices
      this.logIndex = {
        byType: new Map(),
        bySource: new Map(),
        byTime: [],
      }

      for (const entry of toKeep.values()) {
        const typeList = this.logIndex.byType.get(entry.type) || []
        typeList.push(entry.entryId)
        this.logIndex.byType.set(entry.type, typeList)

        const sourceList = this.logIndex.bySource.get(entry.source) || []
        sourceList.push(entry.entryId)
        this.logIndex.bySource.set(entry.source, sourceList)

        this.logIndex.byTime.push(entry)
      }
    }
  }

  /**
   * Clear all logs
   */
  clearAllLogs(): void {
    this.logEntries.clear()
    this.logIndex = {
      byType: new Map(),
      bySource: new Map(),
      byTime: [],
    }
  }
}

// Export singleton instance
export const learningLogger = new LearningLogger()
