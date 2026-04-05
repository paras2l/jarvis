import {
  LaunchExecution,
  LaunchProvider,
  LaunchRequest,
  LaunchStrategy,
  PlatformId,
} from '../types'
import { humanoidAutomation } from '../../humanoid-automation'
import { permissionCenter } from '../permission-center'

function mapNativeFailure(message: string): LaunchExecution {
  const normalized = message.toLowerCase()
  if (normalized.includes('permission') || normalized.includes('disabled')) {
    return { success: false, message, reasonCode: 'permission_denied' }
  }

  return { success: false, message, reasonCode: 'launch_failed' }
}

export class WindowsElectronProvider implements LaunchProvider {
  canHandle(platform: PlatformId, strategy: LaunchStrategy): boolean {
    return (
      platform === 'windows' &&
      ['ui_automation', 'native_name', 'native_path', 'package_name', 'deep_link', 'web_search'].includes(
        strategy
      )
    )
  }

  async launch(
    _platform: PlatformId,
    strategy: LaunchStrategy,
    request: LaunchRequest
  ): Promise<LaunchExecution> {
    if (!window.nativeBridge) {
      return {
        success: false,
        message: 'Electron native bridge unavailable.',
        reasonCode: 'bridge_unavailable',
      }
    }

    if (strategy === 'ui_automation') {
      const isStealth = permissionCenter.getState().stealthMode
      if (isStealth) {
        return this.launchStealth(request.appName)
      }

      const result = await window.nativeBridge.openAppAssistive(request.appName)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : mapNativeFailure(result.message)
    }

    if (strategy === 'native_path' && request.executablePath) {
      const result = await window.nativeBridge.launchApp(request.executablePath)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : mapNativeFailure(result.message)
    }

    if (strategy === 'native_name' && request.executableName) {
      const result = await window.nativeBridge.launchApp(request.executableName)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : mapNativeFailure(result.message)
    }

    if (strategy === 'package_name' && request.packageName) {
      const result = await window.nativeBridge.launchApp(request.packageName)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : mapNativeFailure(result.message)
    }

    if (strategy === 'deep_link' && request.deepLinks?.length) {
      let lastFailure: LaunchExecution = {
        success: false,
        message: 'No deep link could be opened.',
        reasonCode: 'launch_failed',
      }

      for (const link of request.deepLinks) {
        const result = await window.nativeBridge.openExternal(link)
        if (result.success) {
          return { success: true, message: result.message, reasonCode: 'ok' }
        }
        lastFailure = mapNativeFailure(result.message)
      }
      return lastFailure
    }

    if (strategy === 'web_search' && request.webFallback) {
      const result = await window.nativeBridge.openExternal(request.webFallback)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : mapNativeFailure(result.message)
    }

    return {
      success: false,
      message: `Unsupported strategy: ${strategy}`,
      reasonCode: 'unsupported_strategy',
    }
  }

  private async launchStealth(appName: string): Promise<LaunchExecution> {
    if (!window.nativeBridge?.mouseMove || !window.nativeBridge?.mouseClick || !window.nativeBridge?.keyboardType) {
      return { success: false, message: 'Stealth bridge primitives unavailable.', reasonCode: 'bridge_unavailable' }
    }

    try {
      // 1. Simulate "Human-like" Start Menu access
      // Opening Start menu via Win key (Ctrl+Esc)
      await window.nativeBridge.keyboardType('^{ESC}')
      await new Promise(resolve => setTimeout(resolve, 600))

      // 2. Type app name with humanoid cadence
      await humanoidAutomation.typeHumanoid(appName, async (char) => {
        await window.nativeBridge!.keyboardType(char)
      })
      
      await new Promise(resolve => setTimeout(resolve, 800))

      // 3. Move mouse to a realistic "result" position (simulated)
      // Usually the first result in Windows search is around center-ish left
      const path = humanoidAutomation.generateBezierPath(
        { x: 100, y: 1000 }, // Start bottom left
        { x: 300, y: 300 },   // Target first search result
        30
      )

      for (const point of path) {
        await window.nativeBridge.mouseMove(point.x, point.y)
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      // 4. Click the result
      await humanoidAutomation.clickHumanoid(async () => {
        await window.nativeBridge!.mouseClick('left')
      })

      return {
        success: true,
        message: `Stealth launch sequence completed for ${appName} (Humanoid behavior).`,
        reasonCode: 'ok',
        launchabilityState: 'launchable_by_screen_automation'
      }
    } catch (error) {
      return {
        success: false,
        message: `Stealth launch failed: ${error instanceof Error ? error.message : String(error)}`,
        reasonCode: 'launch_failed'
      }
    }
  }
}
