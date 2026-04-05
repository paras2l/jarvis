import {
  LaunchExecution,
  LaunchProvider,
  LaunchRequest,
  LaunchStrategy,
  PlatformId,
} from '../types'

export class WebFallbackProvider implements LaunchProvider {
  canHandle(_platform: PlatformId, strategy: LaunchStrategy): boolean {
    return ['deep_link', 'web_search', 'package_name'].includes(strategy)
  }

  async launch(
    platform: PlatformId,
    strategy: LaunchStrategy,
    request: LaunchRequest
  ): Promise<LaunchExecution> {
    if (typeof window === 'undefined') {
      return {
        success: false,
        message: 'Window context is unavailable.',
        reasonCode: 'platform_not_supported',
      }
    }

    let target = ''

    if (strategy === 'deep_link') {
      target = request.deepLinks?.[0] || ''
    }

    if (strategy === 'web_search') {
      target =
        request.webFallback ||
        `https://www.google.com/search?q=${encodeURIComponent(`open ${request.appName}`)}`
    }

    if (strategy === 'package_name' && request.packageName) {
      if (platform === 'android') {
        target = `intent://#Intent;package=${request.packageName};end`
      } else if (platform === 'ios') {
        target = request.packageName
      }
    }

    if (!target) {
      return {
        success: false,
        message: 'No target available for web fallback launch.',
        reasonCode: 'no_target',
      }
    }

    const opened = window.open(target, '_blank', 'noopener,noreferrer')
    return opened
      ? { success: true, message: `Opened ${target}`, reasonCode: 'ok' }
      : { success: false, message: `Browser blocked opening ${target}`, reasonCode: 'open_blocked' }
  }
}
