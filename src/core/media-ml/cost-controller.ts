/**
 * Cost Controller & Budget Management (Phase 5)
 *
 * Tracks and limits cloud generation costs:
 * - Per-job cost estimation
 * - Cumulative budget tracking
 * - Daily/monthly quota limits
 * - Cost breakdown by stage and model
 *
 * Prices in "credits" (1 credit = $0.001 by default, configurable)
 */

export interface CostConfig {
  creditUSD: number // How much each credit costs in USD
  dailyBudget: number // Daily credits budget
  monthlyBudget: number // Monthly credits budget
  maxJobCost: number // Max credits per single job
  enforceQuota: boolean // If true, reject jobs that exceed quota
}

export interface CostEstimate {
  jobId: string
  stageType: string
  model: string
  estimatedCredits: number
  estimatedUSD: number
  latencyMs: number
}

export interface CostUsage {
  jobId: string
  stage: string
  creditsUsed: number
  usdUsed: number
  completedAt: string
}

const DEFAULT_CONFIG: CostConfig = {
  creditUSD: 0.001, // $0.001 per credit
  dailyBudget: 50000, // $50/day default
  monthlyBudget: 500000, // $500/month default
  maxJobCost: 5000, // $5 max per job
  enforceQuota: false, // Allow overages with warning by default
}

const STAGE_COSTS: Record<string, number> = {
  // Local stages: 0 credits (free)
  'local-script': 0,
  'local-voice': 0,
  'local-image': 0,
  'local-video': 0,

  // Cloud stages: pricing based on model complexity
  'cloud-image-sdxl': 100, // $0.10
  'cloud-image-flux': 150, // $0.15
  'cloud-video-cog': 500, // $0.50
  'cloud-video-opensora': 400, // $0.40
  'cloud-avatar-liveportrait': 200, // $0.20
  'cloud-avatar-hallo': 250, // $0.25
  'cloud-voice-xtts': 50, // $0.05
}

class CostController {
  private config: CostConfig = { ...DEFAULT_CONFIG }
  private dailyUsage: CostUsage[] = []
  private monthlyUsage: CostUsage[] = []
  private allUsage: CostUsage[] = []

  /**
   * Initialize or update cost configuration
   */
  configure(config: Partial<CostConfig>): void {
    this.config = { ...this.config, ...config }
    this.loadUsageHistory()
  }

  /**
   * Estimate cost for a job stage
   */
  estimateStageCost(stageType: string, model: string, latencyMs: number = 0): CostEstimate {
    const jobId = `job-${Date.now()}`
    const costKey = `${stageType.includes('local') ? 'local' : 'cloud'}-${stageType.split('-')[1] || stageType}-${model}`
    const credits = STAGE_COSTS[costKey] || (stageType.includes('cloud') ? 100 : 0)

    return {
      jobId,
      stageType,
      model,
      estimatedCredits: credits,
      estimatedUSD: credits * this.config.creditUSD,
      latencyMs,
    }
  }

  /**
   * Check if job can proceed based on budget
   */
  canAffordJob(estimatedCredits: number): {
    canAfford: boolean
    reason?: string
    dailyRemaining?: number
    monthlyRemaining?: number
  } {
    const dailyUsed = this.getDailyUsage()
    const monthlyUsed = this.getMonthlyUsage()

    const dailyRemaining = this.config.dailyBudget - dailyUsed
    const monthlyRemaining = this.config.monthlyBudget - monthlyUsed

    // Check hard limits
    if (estimatedCredits > this.config.maxJobCost) {
      return {
        canAfford: false,
        reason: `Job exceeds max cost (${(estimatedCredits * this.config.creditUSD).toFixed(2)} USD > ${(this.config.maxJobCost * this.config.creditUSD).toFixed(2)} USD limit)`,
      }
    }

    // Check daily quota
    if (estimatedCredits > dailyRemaining) {
      return {
        canAfford: !this.config.enforceQuota,
        reason: `Daily quota exceeded (need ${(estimatedCredits * this.config.creditUSD).toFixed(2)} USD, have ${(dailyRemaining * this.config.creditUSD).toFixed(2)} USD remaining)`,
        dailyRemaining,
        monthlyRemaining,
      }
    }

    // Check monthly quota
    if (estimatedCredits > monthlyRemaining) {
      return {
        canAfford: !this.config.enforceQuota,
        reason: `Monthly quota exceeded (need ${(estimatedCredits * this.config.creditUSD).toFixed(2)} USD, have ${(monthlyRemaining * this.config.creditUSD).toFixed(2)} USD remaining)`,
        dailyRemaining,
        monthlyRemaining,
      }
    }

    return {
      canAfford: true,
      dailyRemaining,
      monthlyRemaining,
    }
  }

  /**
   * Record actual cost of completed job
   */
  recordUsage(jobId: string, stage: string, creditsUsed: number): void {
    const usage: CostUsage = {
      jobId,
      stage,
      creditsUsed,
      usdUsed: creditsUsed * this.config.creditUSD,
      completedAt: new Date().toISOString(),
    }

    this.allUsage.push(usage)
    this.dailyUsage.push(usage)
    this.monthlyUsage.push(usage)

    this.saveUsageHistory()
  }

  /**
   * Get total credits used today
   */
  getDailyUsage(): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return this.dailyUsage
      .filter((u) => new Date(u.completedAt) >= today)
      .reduce((sum, u) => sum + u.creditsUsed, 0)
  }

  /**
   * Get total credits used this month
   */
  getMonthlyUsage(): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return this.monthlyUsage
      .filter((u) => new Date(u.completedAt) >= monthStart)
      .reduce((sum, u) => sum + u.creditsUsed, 0)
  }

  /**
   * Get cost summary
   */
  getSummary(): {
    dailyUsedUSD: number
    dailyBudgetUSD: number
    dailyRemaining: number
    monthlyUsedUSD: number
    monthlyBudgetUSD: number
    monthlyRemaining: number
  } {
    const dailyUsed = this.getDailyUsage()
    const monthlyUsed = this.getMonthlyUsage()

    return {
      dailyUsedUSD: dailyUsed * this.config.creditUSD,
      dailyBudgetUSD: this.config.dailyBudget * this.config.creditUSD,
      dailyRemaining: (this.config.dailyBudget - dailyUsed) * this.config.creditUSD,
      monthlyUsedUSD: monthlyUsed * this.config.creditUSD,
      monthlyBudgetUSD: this.config.monthlyBudget * this.config.creditUSD,
      monthlyRemaining: (this.config.monthlyBudget - monthlyUsed) * this.config.creditUSD,
    }
  }

  /**
   * Reset daily usage (called automatically at midnight)
   */
  resetDaily(): void {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    this.dailyUsage = this.dailyUsage.filter((u) => new Date(u.completedAt) < today)
    this.saveUsageHistory()
  }

  /**
   * Load usage history from localStorage
   */
  private loadUsageHistory(): void {
    try {
      if (typeof window === 'undefined') return

      const raw = localStorage.getItem('antigravity.cost-history')
      if (!raw) return

      this.allUsage = JSON.parse(raw)

      // Split into daily/monthly
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

      this.dailyUsage = this.allUsage.filter((u) => new Date(u.completedAt) >= today)
      this.monthlyUsage = this.allUsage.filter((u) => new Date(u.completedAt) >= monthStart)
    } catch {
      // Ignore parsing errors
    }
  }

  /**
   * Save usage history to localStorage
   */
  private saveUsageHistory(): void {
    try {
      if (typeof window === 'undefined') return

      localStorage.setItem('antigravity.cost-history', JSON.stringify(this.allUsage))
    } catch {
      // Quota exceeded or other error
    }
  }
}

export const costController = new CostController()
