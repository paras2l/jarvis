// Layer 7 - Audit Logger
// Logs all alignment decisions for transparency and learning

import { AlignmentCheckResult, AuditLogEntry } from './types'

/**
 * AuditLogger
 *
 * Maintains comprehensive logs of all alignment evaluations and decisions.
 * Provides:
 * - Full traceability of why actions were approved/blocked
 * - Historical data for learning and improvement
 * - Search and analysis capabilities for debugging
 * - Explainability for user queries
 */
export class AuditLogger {
  private logs: Map<string, AuditLogEntry> = new Map()
  private decisionStats = {
    approved: 0,
    modified: 0,
    blocked: 0,
  }

  /**
   * Log an alignment evaluation
   */
  async logEvaluation(result: AlignmentCheckResult): Promise<void> {
    const entry: AuditLogEntry = {
      auditId: result.auditId,
      actionId: result.actionId,
      description: result.actionId,
      decision: result.decision,
      violatedPolicies: result.violatedPolicies,
      riskLevel: result.riskLevel,
      approvedBy: 'alignment-layer',
      timestamp: result.timestamp,
      explanation: result.explanation,
    }

    // Store in memory
    this.logs.set(result.auditId, entry)

    // Update statistics
    this.decisionStats[result.decision]++

    // TODO: Persist to database or file system for long-term storage
    // TODO: Publish audit event to event system
  }

  /**
   * Get audit log entry
   */
  getLogEntry(auditId: string): AuditLogEntry | undefined {
    return this.logs.get(auditId)
  }

  /**
   * Get all logs for an action
   */
  getActionLogs(actionId: string): AuditLogEntry[] {
    return Array.from(this.logs.values()).filter((log) => log.actionId === actionId)
  }

  /**
   * Get recent logs
   */
  getRecentLogs(count: number = 50): AuditLogEntry[] {
    const allLogs = Array.from(this.logs.values())
    return allLogs.sort((a, b) => b.timestamp - a.timestamp).slice(0, count)
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalEvaluations: number
    approved: number
    modified: number
    blocked: number
    approvalRate: number
    blockRate: number
  } {
    const total =
      this.decisionStats.approved + this.decisionStats.modified + this.decisionStats.blocked

    return {
      totalEvaluations: total,
      approved: this.decisionStats.approved,
      modified: this.decisionStats.modified,
      blocked: this.decisionStats.blocked,
      approvalRate: total > 0 ? this.decisionStats.approved / total : 0,
      blockRate: total > 0 ? this.decisionStats.blocked / total : 0,
    }
  }

  /**
   * Get decision distribution
   */
  getDecisionDistribution(): {
    approved: number
    modified: number
    blocked: number
  } {
    return { ...this.decisionStats }
  }

  /**
   * Search logs by decision
   */
  searchByDecision(decision: 'approved' | 'modified' | 'blocked'): AuditLogEntry[] {
    return Array.from(this.logs.values()).filter((log) => log.decision === decision)
  }

  /**
   * Search logs by risk level
   */
  searchByRiskLevel(riskLevel: string): AuditLogEntry[] {
    return Array.from(this.logs.values()).filter((log) => log.riskLevel === riskLevel)
  }

  /**
   * Search logs by policy violation
   */
  searchByPolicy(policyId: string): AuditLogEntry[] {
    return Array.from(this.logs.values()).filter((log) =>
      log.violatedPolicies.includes(policyId),
    )
  }

  /**
   * Get logs in time range
   */
  getLogsInRange(startTime: number, endTime: number): AuditLogEntry[] {
    return Array.from(this.logs.values()).filter(
      (log) => log.timestamp >= startTime && log.timestamp <= endTime,
    )
  }

  /**
   * Export audit trail for external analysis
   */
  exportAuditTrail(format: 'json' | 'csv' = 'json'): string {
    const logs = Array.from(this.logs.values()).sort((a, b) => a.timestamp - b.timestamp)

    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    }

    // CSV format
    const headers = [
      'auditId',
      'actionId',
      'decision',
      'riskLevel',
      'violatedPolicies',
      'timestamp',
      'explanation',
    ]
    const rows = logs.map((log) => [
      log.auditId,
      log.actionId,
      log.decision,
      log.riskLevel,
      log.violatedPolicies.join('|'),
      log.timestamp,
      `"${log.explanation.replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n')
    return csvContent
  }

  /**
   * Clear logs (with caution!)
   */
  clearLogs(olderThanMs?: number): number {
    if (!olderThanMs) {
      const count = this.logs.size
      this.logs.clear()
      this.decisionStats = { approved: 0, modified: 0, blocked: 0 }
      return count
    }

    const now = Date.now()
    const threshold = now - olderThanMs
    const idsToDelete: string[] = []

    for (const [id, log] of this.logs) {
      if (log.timestamp < threshold) {
        idsToDelete.push(id)
      }
    }

    for (const id of idsToDelete) {
      this.logs.delete(id)
    }

    return idsToDelete.length
  }

  /**
   * Get summary of blocked actions
   */
  getBlockedActionsSummary(limit: number = 10): AuditLogEntry[] {
    return Array.from(this.logs.values())
      .filter((log) => log.decision === 'blocked')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Get explanation for an action
   */
  getExplanation(auditId: string): string | undefined {
    return this.logs.get(auditId)?.explanation
  }
}
