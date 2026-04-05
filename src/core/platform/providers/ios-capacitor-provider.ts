import {
  LaunchExecution,
  LaunchProvider,
  LaunchRequest,
  LaunchStrategy,
  PlatformId,
} from '../types'
import { appIndexer } from '../app-indexer'

function normalizeScheme(target: string): string {
  const match = target.trim().toLowerCase().match(/^([a-z][a-z0-9+.-]*):/)
  return match?.[1] || ''
}

const GENERIC_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'sms', 'about'])

type IosPlugins = {
  AppLauncher?: {
    openUrl: (input: { url: string }) => Promise<{ completed?: boolean }>
    canOpenUrl?: (input: { url: string }) => Promise<{ value?: boolean }>
  }
}

function getIosPlugins(): IosPlugins | null {
  const cap = (window as unknown as { Capacitor?: { Plugins?: IosPlugins } }).Capacitor
  return cap?.Plugins || null
}

async function openFirstReachable(
  launcher: NonNullable<IosPlugins['AppLauncher']>,
  targets: string[],
  allowedSchemes: string[]
): Promise<LaunchExecution> {
  let sawUnreachable = false
  const allowList = new Set(allowedSchemes.map((scheme) => scheme.toLowerCase()))

  for (const target of targets) {
    if (!target) {
      continue
    }

    const scheme = normalizeScheme(target)
    if (scheme && !GENERIC_SCHEMES.has(scheme) && allowList.size > 0 && !allowList.has(scheme)) {
      return {
        success: false,
        message: `iOS scheme ${scheme} is not allow-listed for this app.`,
        reasonCode: 'permission_denied',
      }
    }

    try {
      if (launcher.canOpenUrl) {
        const canOpen = await launcher.canOpenUrl({ url: target })
        if (!canOpen.value) {
          sawUnreachable = true
          continue
        }
      }

      await launcher.openUrl({ url: target })
      return { success: true, message: `Opened ${target}`, reasonCode: 'ok' }
    } catch {
      sawUnreachable = true
    }
  }

  return sawUnreachable
    ? { success: false, message: 'No iOS target could be opened.', reasonCode: 'launch_failed' }
    : { success: false, message: 'No iOS targets were provided.', reasonCode: 'no_target' }
}

export class IosCapacitorProvider implements LaunchProvider {
  canHandle(platform: PlatformId, strategy: LaunchStrategy): boolean {
    return (
      platform === 'ios' &&
      ['package_name', 'deep_link', 'web_search'].includes(strategy)
    )
  }

  async launch(
    _platform: PlatformId,
    strategy: LaunchStrategy,
    request: LaunchRequest
  ): Promise<LaunchExecution> {
    const allowedSchemes = appIndexer.getIosAllowedSchemes(request.appName)
    const plugins = getIosPlugins()
    if (!plugins?.AppLauncher) {
      return {
        success: false,
        message: 'Capacitor AppLauncher plugin unavailable on iOS runtime.',
        reasonCode: 'plugin_unavailable',
      }
    }

    if (strategy === 'package_name') {
      if (!request.packageName) {
        return { success: false, message: 'No iOS package/scheme provided.', reasonCode: 'no_target' }
      }
      return openFirstReachable(plugins.AppLauncher, [request.packageName], allowedSchemes)
    }

    if (strategy === 'deep_link') {
      return openFirstReachable(plugins.AppLauncher, request.deepLinks || [], allowedSchemes)
    }

    if (strategy === 'web_search') {
      const fallback =
        request.webFallback ||
        `https://www.google.com/search?q=${encodeURIComponent(`open ${request.appName}`)}`
      return openFirstReachable(plugins.AppLauncher, [fallback], allowedSchemes)
    }

    return {
      success: false,
      message: `Unsupported strategy: ${strategy}`,
      reasonCode: 'unsupported_strategy',
    }
  }
}
