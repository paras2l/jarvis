class MutationCanaryManager {
  private canaryTrafficPercent = 5

  setPercent(percent: number): void {
    this.canaryTrafficPercent = Math.max(0, Math.min(100, percent))
  }

  getPercent(): number {
    return this.canaryTrafficPercent
  }

  shouldRouteToCanary(seed: number = Date.now()): boolean {
    return (seed % 100) < this.canaryTrafficPercent
  }
}

export const mutationCanaryManager = new MutationCanaryManager()
