import { SelectorTelemetryEntry } from './types'

const STORAGE_KEY = 'test-model.selector-telemetry'
const MAX_ENTRIES = 1000

class AutomationTelemetry {
  private entries: SelectorTelemetryEntry[] = []

  constructor() {
    this.entries = this.load()
  }

  private load(): SelectorTelemetryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(-MAX_ENTRIES)))
  }

  record(entry: SelectorTelemetryEntry): void {
    this.entries.push(entry)
    this.save()
  }

  rankSelectors(
    appName: string,
    selectors: string[],
    deviceModel: string,
    androidVersion: string
  ): string[] {
    const score = new Map<string, number>()
    selectors.forEach((selector) => score.set(selector, 0))

    for (const entry of this.entries) {
      if (
        entry.appName === appName &&
        entry.deviceModel === deviceModel &&
        entry.androidVersion === androidVersion &&
        score.has(entry.selectorKey)
      ) {
        const delta = entry.success ? 2 : -1
        score.set(entry.selectorKey, (score.get(entry.selectorKey) || 0) + delta)
      }
    }

    return selectors
      .slice()
      .sort((a, b) => (score.get(b) || 0) - (score.get(a) || 0))
  }
}

export const automationTelemetry = new AutomationTelemetry()
