import {
  LaunchExecution,
  LaunchProvider,
  LaunchRequest,
  LaunchStrategy,
  PlatformId,
} from '../types'
import { auditLog } from '../audit-log'
import { androidSelectorLibrary, selectorKey } from '../android-selector-library'
import { automationTelemetry } from '../automation-telemetry'
import { automationSafety } from '../automation-safety'
import { runAndroidAutomationStateMachine } from '../android-automation-state-machine'

type CapacitorPlugins = {
  AppLauncher?: {
    openUrl: (input: { url: string }) => Promise<{ completed?: boolean }>
    canOpenUrl?: (input: { url: string }) => Promise<{ value?: boolean }>
  }
  DeviceAutomationPermission?: {
    getState?: () => Promise<{ uiAutomation?: boolean }>
    requestUiAutomation?: () => Promise<{ granted?: boolean }>
  }
}

function getCapacitorPlugins(): CapacitorPlugins | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: CapacitorPlugins } }).Capacitor
  return cap?.Plugins || null
}

export class AndroidCapacitorProvider implements LaunchProvider {
  canHandle(platform: PlatformId, strategy: LaunchStrategy): boolean {
    return (
      platform === 'android' &&
      ['package_name', 'deep_link', 'web_search', 'ui_automation'].includes(strategy)
    )
  }

  async launch(
    _platform: PlatformId,
    strategy: LaunchStrategy,
    request: LaunchRequest
  ): Promise<LaunchExecution> {
    if (automationSafety.isEmergencyStopActive()) {
      return {
        success: false,
        message: 'Automation is stopped by emergency command. Say resume/clear emergency stop to continue.',
        reasonCode: 'permission_denied',
        launchabilityState: 'blocked',
      }
    }

    if (request.sensitiveOperation) {
      return {
        success: false,
        message: 'Sensitive screen automation is blocked. Please complete password/OTP manually.',
        reasonCode: 'sensitive_action_blocked',
        launchabilityState: 'blocked',
      }
    }

    const plugins = getCapacitorPlugins()
    if (!plugins?.AppLauncher) {
      return {
        success: false,
        message: 'Capacitor AppLauncher plugin unavailable.',
        reasonCode: 'plugin_unavailable',
      }
    }

    if (strategy === 'ui_automation') {
      const permissionPlugin = plugins.DeviceAutomationPermission
      if (!permissionPlugin?.requestUiAutomation) {
        return {
          success: false,
          message: 'Android UI automation permission plugin unavailable.',
          reasonCode: 'plugin_unavailable',
        }
      }

      const result = await permissionPlugin.requestUiAutomation()

      if (request.sensitiveOperation && request.requireManualAuthHandoff) {
        auditLog.append({
          appName: request.appName,
          platform: 'android',
          strategy: 'ui_automation',
          success: !!result.granted,
          message:
            'Sensitive auth handoff required: user must complete password/OTP manually on-screen.',
          reasonCode: result.granted ? 'ok' : 'permission_denied',
        })

        return result.granted
          ? {
              success: true,
              message:
                'Automation permission granted. Sensitive step detected: please complete password/OTP manually, then confirm to continue.',
              reasonCode: 'ok',
            }
          : {
              success: false,
              message: 'Android UI automation permission denied.',
              reasonCode: 'permission_denied',
            }
      }

      return result.granted
        ? { success: true, message: 'Android UI automation permission granted.', reasonCode: 'ok' }
        : { success: false, message: 'Android UI automation permission denied.', reasonCode: 'permission_denied' }
    }

    if (strategy === 'package_name' && request.packageName) {
      const intentUrl = `intent://#Intent;package=${request.packageName};end`
      try {
        await plugins.AppLauncher.openUrl({ url: intentUrl })
        return {
          success: true,
          message: `Launched package ${request.packageName}.`,
          reasonCode: 'ok',
          launchabilityState: 'launchable_by_intent',
        }
      } catch (error) {
        // Fall through to assistive automation fallback if policy allows
        if (request.fallbackPolicy?.allowScreenAutomation && window.nativeBridge) {
          if (automationSafety.isOverlayEnabled()) {
            await window.nativeBridge.setAutomationOverlay?.(
              true,
              `Automating ${request.appName}...`
            )
          }

          const ctx = (await window.nativeBridge.getAutomationDeviceContext?.()) || {
            model: 'unknown-model',
            androidVersion: 'unknown-version',
            locale: 'en-US',
            oem: 'unknown-oem',
          }

          const selectors = androidSelectorLibrary.getPrioritizedSelectors(request.appName, {
            deviceModel: ctx.model,
            androidVersion: ctx.androidVersion,
            locale: ctx.locale,
            oem: ctx.oem,
          })

          const stateMachineResult = await runAndroidAutomationStateMachine({
            appName: request.appName,
            packageName: request.packageName,
            selectors,
            timeoutMs: 6000,
            retryCount: 1,
          })

          const automationResult = stateMachineResult.success
            ? {
                success: true,
                message: stateMachineResult.reason,
                reasonCode: 'ok',
                selectorUsed: stateMachineResult.selectorUsed,
              }
            : window.nativeBridge.openAppAssistiveV2
              ? await window.nativeBridge.openAppAssistiveV2({
                  appName: request.appName,
                  packageName: request.packageName,
                  deepLinks: request.deepLinks,
                  selectors,
                  timeoutMs: 15000,
                  retryCount: 1,
                  showOverlay: automationSafety.isOverlayEnabled(),
                })
              : {
                  success: false,
                  message: stateMachineResult.reason,
                  reasonCode: 'launch_failed',
                }

          if (automationSafety.isOverlayEnabled()) {
            await window.nativeBridge.setAutomationOverlay?.(false)
          }

          for (const selector of selectors) {
            automationTelemetry.record({
              appName: request.appName,
              selectorKey: selectorKey(selector),
              deviceModel: ctx.model,
              androidVersion: ctx.androidVersion,
              success: selectorKey(selector) === automationResult.selectorUsed && !!automationResult.success,
              timestamp: new Date().toISOString(),
            })
          }

          return {
            success: automationResult.success,
            message: automationResult.message,
            reasonCode: automationResult.reasonCode === 'ok' ? 'ok' : 'launch_failed',
            launchabilityState: automationResult.success
              ? 'launchable_by_screen_automation'
              : 'blocked',
            selectorUsed: automationResult.selectorUsed,
          }
        }

        const message = error instanceof Error ? error.message : 'Failed to launch package intent.'
        return {
          success: false,
          message,
          reasonCode: 'launch_failed',
          launchabilityState: 'blocked',
        }
      }
    }

    if (strategy === 'deep_link' && request.deepLinks?.length) {
      for (const url of request.deepLinks) {
        try {
          await plugins.AppLauncher.openUrl({ url })
          return {
            success: true,
            message: `Opened ${url}`,
            reasonCode: 'ok',
            launchabilityState: 'launchable_by_intent',
          }
        } catch {
          // try next deep link
        }
      }
      return {
        success: false,
        message: 'No deep link could be opened.',
        reasonCode: 'launch_failed',
        launchabilityState: request.fallbackPolicy?.allowScreenAutomation
          ? 'launchable_by_screen_automation'
          : 'blocked',
      }
    }

    if (strategy === 'web_search') {
      const url =
        request.webFallback ||
        `https://www.google.com/search?q=${encodeURIComponent(`open ${request.appName}`)}`
      try {
        await plugins.AppLauncher.openUrl({ url })
        return {
          success: true,
          message: `Opened ${url}`,
          reasonCode: 'ok',
          launchabilityState: 'launchable_by_intent',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to open ${url}`
        return {
          success: false,
          message,
          reasonCode: 'open_blocked',
          launchabilityState: 'blocked',
        }
      }
    }

    return {
      success: false,
      message: `Unsupported strategy: ${strategy}`,
      reasonCode: 'unsupported_strategy',
      launchabilityState: 'blocked',
    }
  }
}
