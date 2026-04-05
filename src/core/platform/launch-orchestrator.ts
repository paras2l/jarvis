import { appIndexer } from './app-indexer'
import { auditLog } from './audit-log'
import { capabilityChecker } from './capability-checker'
import { detectPlatform } from './platform-detection'
import { permissionCenter } from './permission-center'
import { automationSafety } from './automation-safety'
import { AndroidCapacitorProvider } from './providers/android-capacitor-provider'
import { IosCapacitorProvider } from './providers/ios-capacitor-provider'
import { MacLinuxElectronProvider } from './providers/macos-linux-electron-provider'
import { WebFallbackProvider } from './providers/web-fallback-provider'
import { WindowsElectronProvider } from './providers/windows-electron-provider'
import { LaunchReasonCode, LaunchResult, LaunchStrategy } from './types'

type LaunchOptions = {
  sensitiveOperation?: boolean
  emergencyPassphrase?: string
  requireManualAuthHandoff?: boolean
}

class LaunchOrchestrator {
  private providers = [
    new WindowsElectronProvider(),
    new MacLinuxElectronProvider(),
    new AndroidCapacitorProvider(),
    new IosCapacitorProvider(),
    new WebFallbackProvider(),
  ]

  async launchApp(appName: string, options: LaunchOptions = {}): Promise<LaunchResult> {
    const platform = detectPlatform()
    const request = {
      ...appIndexer.findCandidate(appName, platform),
      ...options,
    }
    const permissions = permissionCenter.getState()

    if (
      request.sensitiveOperation &&
      !permissionCenter.isEmergencyOverrideActive(request.emergencyPassphrase)
    ) {
      return {
        success: false,
        strategy: 'ui_automation',
        message:
          'Sensitive auth step detected. Say: "emergency this is password <your passphrase>" and then manually complete the secure screen.',
        reasonCode: 'emergency_override_required',
        launchabilityState: 'blocked',
        platform,
        attempted: [],
      }
    }

    const strategyOrder = capabilityChecker.buildStrategyOrder(platform, request, permissions)
    if (strategyOrder.length === 0) {
      return {
        success: false,
        strategy: 'web_search',
        message:
          request.fallbackPolicy?.blockedReason ||
          `Launch is blocked by fallback policy for ${appName} on ${platform}.`,
        reasonCode: 'permission_denied',
        launchabilityState: 'blocked',
        platform,
        attempted: [],
      }
    }
    const attempted: LaunchStrategy[] = []
    let lastFailureMessage = `Could not launch ${appName}.`
    let lastFailureReason: LaunchReasonCode = 'unknown'

    for (const strategy of strategyOrder) {
      attempted.push(strategy)
      const provider = this.providers.find((candidate) => candidate.canHandle(platform, strategy))

      if (!provider) {
        lastFailureMessage = `No provider available for strategy ${strategy} on ${platform}.`
        lastFailureReason = 'no_provider'
        continue
      }

      const result = await provider.launch(platform, strategy, request)
      if (!result.success) {
        lastFailureMessage = result.message
        lastFailureReason = result.reasonCode
      }

      auditLog.append({
        appName,
        platform,
        strategy,
        success: result.success,
        message: result.message,
        reasonCode: result.reasonCode,
        selectorUsed: result.selectorUsed,
        launchabilityState: result.launchabilityState,
      })

      if (result.success) {
        return {
          success: true,
          strategy,
          message: result.message,
          reasonCode: result.reasonCode,
          launchabilityState: result.launchabilityState || 'launchable_by_intent',
          platform,
          attempted,
          selectorUsed: result.selectorUsed,
        }
      }
    }

    return {
      success: false,
      strategy: attempted[attempted.length - 1] || 'web_search',
      message: lastFailureMessage,
      reasonCode: lastFailureReason,
      launchabilityState: 'blocked',
      platform,
      attempted,
    }
  }

  async setUiAutomationPermission(enabled: boolean): Promise<{ success: boolean; message: string }> {
    await permissionCenter.setUiAutomation(enabled)
    return {
      success: true,
      message: enabled
        ? 'UI automation permission enabled.'
        : 'UI automation permission disabled.',
    }
  }

  setNativeLaunchPermission(enabled: boolean): { success: boolean; message: string } {
    permissionCenter.setNativeLaunch(enabled)
    return {
      success: true,
      message: enabled
        ? 'Native launch permission enabled.'
        : 'Native launch permission disabled.',
    }
  }

  setStealthMode(enabled: boolean): void {
    permissionCenter.setStealthMode(enabled)
  }

  getPermissionState() {
    return permissionCenter.getState()
  }

  armEmergencyOverride(passphrase: string): { success: boolean; message: string } {
    return permissionCenter.armEmergencyOverride(passphrase)
  }

  clearEmergencyOverride(): void {
    permissionCenter.clearEmergencyOverride()
  }

  isEmergencyOverrideActive(passphrase?: string): boolean {
    return permissionCenter.isEmergencyOverrideActive(passphrase)
  }

  triggerEmergencyStop(): { success: boolean; message: string } {
    automationSafety.triggerEmergencyStop()
    window.nativeBridge?.emergencyStopAutomation?.()
    return {
      success: true,
      message: 'Emergency stop activated. Automation halted immediately.',
    }
  }

  clearEmergencyStop(): { success: boolean; message: string } {
    automationSafety.clearEmergencyStop()
    return {
      success: true,
      message: 'Emergency stop cleared. Automation can run again.',
    }
  }

  setAutomationOverlayEnabled(enabled: boolean): { success: boolean; message: string } {
    automationSafety.setOverlayEnabled(enabled)
    return {
      success: true,
      message: enabled
        ? 'Automation overlay indicator enabled.'
        : 'Automation overlay indicator disabled.',
    }
  }

  getAuditEntries(limit = 50) {
    return auditLog.getRecent(limit)
  }
}

export const launchOrchestrator = new LaunchOrchestrator()
