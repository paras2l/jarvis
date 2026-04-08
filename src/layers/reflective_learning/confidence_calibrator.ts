/**
 * Layer 8: Confidence Calibrator
 * Adjusts confidence scores for modules and actions based on historical accuracy
 */

import { ConfidenceCalibration, ConfidenceUpdate } from './types'

export class ConfidenceCalibrator {
  private calibrations: Map<string, ConfidenceCalibration> = new Map()
  private moduleConfidence: Map<string, number> = new Map()
  private actionTypeConfidence: Map<'reactive' | 'proactive' | 'exploratory', number> = new Map([
    ['reactive', 0.7],
    ['proactive', 0.6],
    ['exploratory', 0.5],
  ])

  private accuracyHistory: Map<string, number[]> = new Map()
  private MIN_SAMPLE_SIZE = 5
  private CALIBRATION_SMOOTHING = 0.2 // How much new data influences calibration

  constructor() {
    this.initializeCalibration()
  }

  private initializeCalibration(): void {
    // Initialize default confidence levels
    this.moduleConfidence.set('action_evaluator', 0.7)
    this.moduleConfidence.set('planning_module', 0.65)
    this.moduleConfidence.set('world_model', 0.6)
    this.moduleConfidence.set('value_alignment', 0.85)
    this.moduleConfidence.set('memory_system', 0.75)
  }

  /**
   * Record accuracy results for a module
   */
  recordAccuracy(
    moduleId: string,
    actionType: 'reactive' | 'proactive' | 'exploratory' | undefined,
    accuracy: number,
  ): void {
    const key = actionType ? `${moduleId}:${actionType}` : moduleId

    if (!this.accuracyHistory.has(key)) {
      this.accuracyHistory.set(key, [])
    }

    this.accuracyHistory.get(key)!.push(accuracy)

    // Keep only last 100 readings
    const history = this.accuracyHistory.get(key)!
    if (history.length > 100) {
      history.shift()
    }

    // Auto-calibrate if we have enough samples
    if (history.length >= this.MIN_SAMPLE_SIZE) {
      this.calibrateModule(moduleId, actionType)
    }
  }

  /**
   * Calculate weighted average accuracy
   */
  private calculateAverageAccuracy(history: number[]): number {
    if (history.length === 0) return 0.5

    // Weight recent results more heavily
    let weightedSum = 0
    let weightTotal = 0

    for (let i = 0; i < history.length; i++) {
      const age = history.length - i // older = higher number
      const weight = 1 / age // recent = higher weight
      weightedSum += history[i] * weight
      weightTotal += weight
    }

    return weightedSum / weightTotal
  }

  /**
   * Calibrate confidence for a module based on accuracy history
   */
  private calibrateModule(moduleId: string, actionType?: 'reactive' | 'proactive' | 'exploratory'): ConfidenceCalibration {
    const key = actionType ? `${moduleId}:${actionType}` : moduleId
    const history = this.accuracyHistory.get(key) || []

    if (history.length < this.MIN_SAMPLE_SIZE) {
      const dummy: ConfidenceCalibration = {
        calibrationId: `cal_${Date.now()}`,
        moduleId,
        actionType,
        historicalAccuracy: 0.5,
        previousConfidenceLevel: 0.5,
        adjustedConfidenceLevel: 0.5,
        calibrationReason: 'Insufficient data',
        sampleSize: history.length,
        timestamp: Date.now(),
      }
      return dummy
    }

    const accuracy = this.calculateAverageAccuracy(history)
    const previousConfidence = actionType
      ? this.actionTypeConfidence.get(actionType) || 0.6
      : this.moduleConfidence.get(moduleId) || 0.65

    // Adjust confidence towards accuracy
    const adjustedConfidence = previousConfidence * (1 - this.CALIBRATION_SMOOTHING) + accuracy * this.CALIBRATION_SMOOTHING

    // Determine calibration reason
    let calibrationReason = ''
    if (accuracy > previousConfidence + 0.1) {
      calibrationReason = 'Above expectations - increasing confidence'
    } else if (accuracy < previousConfidence - 0.1) {
      calibrationReason = 'Below expectations - decreasing confidence'
    } else {
      calibrationReason = 'In line with expectations - minor adjustment'
    }

    // Store calibration
    const calibration: ConfidenceCalibration = {
      calibrationId: `cal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      moduleId,
      actionType,
      historicalAccuracy: accuracy,
      previousConfidenceLevel: previousConfidence,
      adjustedConfidenceLevel: adjustedConfidence,
      calibrationReason,
      sampleSize: history.length,
      timestamp: Date.now(),
    }

    this.calibrations.set(calibration.calibrationId, calibration)

    // Update stored confidence
    if (actionType) {
      this.actionTypeConfidence.set(actionType, adjustedConfidence)
    } else {
      this.moduleConfidence.set(moduleId, adjustedConfidence)
    }

    return calibration
  }

  /**
   * Get current confidence level for a module
   */
  getModuleConfidence(moduleId: string): number {
    return this.moduleConfidence.get(moduleId) || 0.65
  }

  /**
   * Get current confidence level for an action type
   */
  getActionTypeConfidence(actionType: 'reactive' | 'proactive' | 'exploratory'): number {
    return this.actionTypeConfidence.get(actionType) || 0.6
  }

  /**
   * Get confidence for a specific module-action combination
   */
  getCombinedConfidence(
    moduleId: string,
    actionType: 'reactive' | 'proactive' | 'exploratory',
  ): number {
    const moduleConf = this.getModuleConfidence(moduleId)
    const actionConf = this.getActionTypeConfidence(actionType)

    // Average with slight weight towards module-specific
    return moduleConf * 0.6 + actionConf * 0.4
  }

  /**
   * Adjust confidence directly (e.g., after user override)
   */
  adjustConfidence(moduleId: string, actionType: 'reactive' | 'proactive' | 'exploratory' | undefined, delta: number): ConfidenceUpdate {
    const current = actionType ? this.getActionTypeConfidence(actionType) : this.getModuleConfidence(moduleId)
    const newConfidence = Math.max(0.1, Math.min(1, current + delta))

    if (actionType) {
      this.actionTypeConfidence.set(actionType, newConfidence)
    } else {
      this.moduleConfidence.set(moduleId, newConfidence)
    }

    return {
      moduleId,
      actionType,
      newConfidence,
      reason: `Manual adjustment: ${delta > 0 ? 'increase' : 'decrease'} by ${Math.abs(delta).toFixed(2)}`,
      effectiveAt: Date.now(),
    }
  }

  /**
   * Get confidence statistics
   */
  getConfidenceStatistics(): {
    averageModuleConfidence: number
    averageActionTypeConfidence: number
    highConfidenceModules: string[]
    lowConfidenceModules: string[]
    recentCalibrations: number
  } {
    const moduleConfidences = Array.from(this.moduleConfidence.values())
    const actionConfidences = Array.from(this.actionTypeConfidence.values())

    const avgModule = moduleConfidences.length > 0 ? moduleConfidences.reduce((a, b) => a + b) / moduleConfidences.length : 0.65
    const avgAction = actionConfidences.length > 0 ? actionConfidences.reduce((a, b) => a + b) / actionConfidences.length : 0.6

    const highConfidence = Array.from(this.moduleConfidence.entries())
      .filter(([_, conf]) => conf > 0.8)
      .map(([module, _]) => module)

    const lowConfidence = Array.from(this.moduleConfidence.entries())
      .filter(([_, conf]) => conf < 0.5)
      .map(([module, _]) => module)

    const recentTime = Date.now() - 3600000 // Last hour
    const recentCals = Array.from(this.calibrations.values()).filter((c) => c.timestamp > recentTime).length

    return {
      averageModuleConfidence: avgModule,
      averageActionTypeConfidence: avgAction,
      highConfidenceModules: highConfidence,
      lowConfidenceModules: lowConfidence,
      recentCalibrations: recentCals,
    }
  }

  /**
   * Get calibration history for a module
   */
  getCalibrationHistory(moduleId: string): ConfidenceCalibration[] {
    return Array.from(this.calibrations.values())
      .filter((c) => c.moduleId === moduleId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get worst-performing modules (lowest confidence)
   */
  getWorstPerformingModules(limit: number = 5): Array<[string, number]> {
    return Array.from(this.moduleConfidence.entries()).sort((a, b) => a[1] - b[1]).slice(0, limit)
  }

  /**
   * Detect confidence drift (increasing or decreasing trends)
   */
  detectConfidenceDrift(
    moduleId: string,
  ): { trend: 'increasing' | 'decreasing' | 'stable'; magnitude: number } {
    const history = Array.from(this.calibrations.values())
      .filter((c: ConfidenceCalibration) => c.moduleId === moduleId)
      .sort((a: ConfidenceCalibration, b: ConfidenceCalibration) => a.timestamp - b.timestamp)

    if (history.length < 2) {
      return { trend: 'stable', magnitude: 0 }
    }

    const recent = history.slice(-5)
    const older = history.slice(Math.max(0, history.length - 10), history.length - 5)

    if (older.length === 0) {
      return { trend: 'stable', magnitude: 0 }
    }

    const recentAvg =
      recent.reduce((sum: number, c: ConfidenceCalibration) => sum + c.adjustedConfidenceLevel, 0) /
      recent.length
    const olderAvg =
      older.reduce((sum: number, c: ConfidenceCalibration) => sum + c.adjustedConfidenceLevel, 0) /
      older.length

    const drift = recentAvg - olderAvg
    const magnitude = Math.abs(drift)

    return {
      trend: drift > 0.05 ? 'increasing' : drift < -0.05 ? 'decreasing' : 'stable',
      magnitude,
    }
  }

  /**
   * Get all calibration records
   */
  getAllCalibrations(): ConfidenceCalibration[] {
    return Array.from(this.calibrations.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Reset confidence for a module to initial state
   */
  resetModuleConfidence(moduleId: string): void {
    this.moduleConfidence.set(moduleId, 0.65)
    const key = `${moduleId}:`
    Array.from(this.accuracyHistory.keys())
      .filter((k) => k.startsWith(key))
      .forEach((k) => this.accuracyHistory.delete(k))
  }

  /**
   * Clear old calibration records (keep last N)
   */
  pruneOldCalibrations(keepCount: number = 500): void {
    if (this.calibrations.size > keepCount) {
      const sorted = Array.from(this.calibrations.entries()).sort((a, b) => b[1].timestamp - a[1].timestamp)
      const toKeep = new Map(sorted.slice(0, keepCount))
      this.calibrations = toKeep
    }
  }
}

// Export singleton instance
export const confidenceCalibrator = new ConfidenceCalibrator()
