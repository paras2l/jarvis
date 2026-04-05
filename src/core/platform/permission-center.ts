import { PermissionState } from './types'

const STORAGE_KEY = 'test-model.permissions'

const DEFAULT_PERMISSIONS: PermissionState = {
  nativeLaunch: true,
  uiAutomation: false,
  stealthMode: false,
  emergencyOverrideUntil: 0,
  emergencyPassphrase: '',
}

class PermissionCenter {
  private state: PermissionState

  constructor() {
    this.state = this.load()
  }

  private load(): PermissionState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return DEFAULT_PERMISSIONS
      const parsed = JSON.parse(raw)
      return {
        nativeLaunch:
          typeof parsed.nativeLaunch === 'boolean'
            ? parsed.nativeLaunch
            : DEFAULT_PERMISSIONS.nativeLaunch,
        uiAutomation:
          typeof parsed.uiAutomation === 'boolean'
            ? parsed.uiAutomation
            : DEFAULT_PERMISSIONS.uiAutomation,
        stealthMode:
          typeof parsed.stealthMode === 'boolean'
            ? parsed.stealthMode
            : DEFAULT_PERMISSIONS.stealthMode,
        emergencyOverrideUntil:
          typeof parsed.emergencyOverrideUntil === 'number'
            ? parsed.emergencyOverrideUntil
            : DEFAULT_PERMISSIONS.emergencyOverrideUntil,
        emergencyPassphrase:
          typeof parsed.emergencyPassphrase === 'string'
            ? parsed.emergencyPassphrase
            : DEFAULT_PERMISSIONS.emergencyPassphrase,
      }
    } catch {
      return DEFAULT_PERMISSIONS
    }
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }

  getState(): PermissionState {
    return { ...this.state }
  }

  async setUiAutomation(enabled: boolean): Promise<void> {
    this.state.uiAutomation = enabled

    if (window.nativeBridge?.setAutomationPermission) {
      await window.nativeBridge.setAutomationPermission(enabled)
    }

    if (enabled) {
      const cap = (window as unknown as {
        Capacitor?: {
          Plugins?: {
            DeviceAutomationPermission?: {
              requestUiAutomation?: () => Promise<{ granted?: boolean }>
            }
          }
        }
      }).Capacitor

      await cap?.Plugins?.DeviceAutomationPermission?.requestUiAutomation?.()
    }

    this.save()
  }

  setNativeLaunch(enabled: boolean): void {
    this.state.nativeLaunch = enabled
    this.save()
  }
  
  setStealthMode(enabled: boolean): void {
    this.state.stealthMode = enabled
    this.save()
  }

  armEmergencyOverride(passphrase: string, ttlMs = 120000): { success: boolean; message: string } {
    const trimmed = passphrase.trim()
    if (!trimmed) {
      return { success: false, message: 'Emergency passphrase is required.' }
    }

    this.state.emergencyPassphrase = trimmed
    this.state.emergencyOverrideUntil = Date.now() + ttlMs
    this.save()

    return {
      success: true,
      message: 'Emergency override is active for 2 minutes. Sensitive auth steps will require your manual confirmation.',
    }
  }

  clearEmergencyOverride(): void {
    this.state.emergencyPassphrase = ''
    this.state.emergencyOverrideUntil = 0
    this.save()
  }

  isEmergencyOverrideActive(passphrase?: string): boolean {
    const now = Date.now()
    if (!this.state.emergencyOverrideUntil || this.state.emergencyOverrideUntil < now) {
      return false
    }

    if (!passphrase) {
      return true
    }

    return this.state.emergencyPassphrase === passphrase.trim()
  }
}

export const permissionCenter = new PermissionCenter()
