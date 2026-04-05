const STORAGE_KEY = 'test-model.automation-safety'

type SafetyState = {
  emergencyStop: boolean
  overlayEnabled: boolean
}

const DEFAULT_STATE: SafetyState = {
  emergencyStop: false,
  overlayEnabled: true,
}

class AutomationSafety {
  private state: SafetyState

  constructor() {
    this.state = this.load()
  }

  private load(): SafetyState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return DEFAULT_STATE
      const parsed = JSON.parse(raw)
      return {
        emergencyStop: !!parsed.emergencyStop,
        overlayEnabled:
          typeof parsed.overlayEnabled === 'boolean'
            ? parsed.overlayEnabled
            : DEFAULT_STATE.overlayEnabled,
      }
    } catch {
      return DEFAULT_STATE
    }
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }

  triggerEmergencyStop(): void {
    this.state.emergencyStop = true
    this.save()
  }

  clearEmergencyStop(): void {
    this.state.emergencyStop = false
    this.save()
  }

  isEmergencyStopActive(): boolean {
    return this.state.emergencyStop
  }

  setOverlayEnabled(enabled: boolean): void {
    this.state.overlayEnabled = enabled
    this.save()
  }

  isOverlayEnabled(): boolean {
    return this.state.overlayEnabled
  }
}

export const automationSafety = new AutomationSafety()
