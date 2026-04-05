import { LaunchRequest, LaunchStrategy, PermissionState, PlatformId } from './types'

class CapabilityChecker {
  buildStrategyOrder(
    platform: PlatformId,
    request: LaunchRequest,
    permissions: PermissionState
  ): LaunchStrategy[] {
    if (request.fallbackPolicy?.launchability === 'blocked') {
      return []
    }

    const order: LaunchStrategy[] = []

    if (
      permissions.uiAutomation &&
      request.fallbackPolicy?.allowScreenAutomation !== false &&
      ['windows', 'macos', 'linux', 'android'].includes(platform)
    ) {
      order.push('ui_automation')
    }

    if (permissions.nativeLaunch) {
      if (request.executablePath) {
        order.push('native_path')
      }
      if (request.executableName) {
        order.push('native_name')
      }
      if (request.packageName) {
        order.push('package_name')
      }
    }

    if (request.deepLinks && request.deepLinks.length > 0) {
      order.push('deep_link')
    }

    order.push('web_search')
    return Array.from(new Set(order))
  }
}

export const capabilityChecker = new CapabilityChecker()
