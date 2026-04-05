import {
  LaunchExecution,
  LaunchProvider,
  LaunchRequest,
  LaunchStrategy,
  PlatformId,
} from '../types'

export class MacLinuxElectronProvider implements LaunchProvider {
  canHandle(platform: PlatformId, strategy: LaunchStrategy): boolean {
    const isSupportedDesktop = platform === 'macos' || platform === 'linux'
    return (
      isSupportedDesktop &&
      ['native_name', 'native_path', 'deep_link', 'web_search'].includes(strategy)
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

    if (strategy === 'native_path' && request.executablePath) {
      const result = await window.nativeBridge.launchApp(request.executablePath)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : { success: false, message: result.message, reasonCode: 'launch_failed' }
    }

    if (strategy === 'native_name' && request.executableName) {
      const result = await window.nativeBridge.launchApp(request.executableName)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : { success: false, message: result.message, reasonCode: 'launch_failed' }
    }

    if (strategy === 'deep_link' && request.deepLinks?.length) {
      for (const link of request.deepLinks) {
        const result = await window.nativeBridge.openExternal(link)
        if (result.success) {
          return { success: true, message: result.message, reasonCode: 'ok' }
        }
      }
      return {
        success: false,
        message: 'No deep link could be opened.',
        reasonCode: 'launch_failed',
      }
    }

    if (strategy === 'web_search' && request.webFallback) {
      const result = await window.nativeBridge.openExternal(request.webFallback)
      return result.success
        ? { success: true, message: result.message, reasonCode: 'ok' }
        : { success: false, message: result.message, reasonCode: 'open_blocked' }
    }

    return {
      success: false,
      message: `Unsupported strategy: ${strategy}`,
      reasonCode: 'unsupported_strategy',
    }
  }
}
