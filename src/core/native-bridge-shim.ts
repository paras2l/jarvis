type InstalledAppMetadata = {
  appName: string
  packageName?: string
  bundleId?: string
  executableName?: string
  deepLinks?: string[]
  categories?: string[]
  sensitive?: boolean
}

const AUTOMATION_PERMISSION_KEY = 'paxion_automation_permission'
const SIM_APPS_KEY = 'paxion_simulated_installed_apps_v1'
const SIM_FOREGROUND_KEY = 'paxion_simulated_foreground_app_v1'

function detectHostPlatform(): 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web' {
  if (typeof navigator === 'undefined') {
    return 'web'
  }

  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'web'
}

function defaultInstalledAppsFor(platform: string): InstalledAppMetadata[] {
  if (platform === 'android') {
    return [
      {
        appName: 'WhatsApp',
        packageName: 'com.whatsapp',
        deepLinks: ['whatsapp://send'],
        categories: ['social', 'messaging'],
      },
      {
        appName: 'Instagram',
        packageName: 'com.instagram.android',
        deepLinks: ['instagram://app'],
        categories: ['social'],
      },
      {
        appName: 'PhonePe',
        packageName: 'com.phonepe.app',
        deepLinks: ['phonepe://'],
        categories: ['finance', 'payment'],
        sensitive: true,
      },
      {
        appName: 'Settings',
        packageName: 'com.android.settings',
        deepLinks: ['android.settings.SETTINGS'],
        categories: ['system'],
        sensitive: true,
      },
    ]
  }

  if (platform === 'ios') {
    return [
      {
        appName: 'WhatsApp',
        bundleId: 'net.whatsapp.WhatsApp',
        deepLinks: ['whatsapp://'],
        categories: ['social', 'messaging'],
      },
      {
        appName: 'Instagram',
        bundleId: 'com.burbn.instagram',
        deepLinks: ['instagram://app'],
        categories: ['social'],
      },
      {
        appName: 'Settings',
        bundleId: 'com.apple.Preferences',
        deepLinks: ['app-settings:'],
        categories: ['system'],
        sensitive: true,
      },
    ]
  }

  return [
    {
      appName: 'Chrome',
      executableName: 'chrome',
      deepLinks: ['https://www.google.com/chrome/'],
      categories: ['browser'],
    },
    {
      appName: 'Spotify',
      executableName: 'spotify',
      deepLinks: ['spotify://'],
      categories: ['music'],
    },
    {
      appName: 'Settings',
      executableName: 'settings',
      deepLinks: ['ms-settings:'],
      categories: ['system'],
      sensitive: true,
    },
  ]
}

function readInstalledApps(platform: string): InstalledAppMetadata[] {
  try {
    const raw = localStorage.getItem(SIM_APPS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as InstalledAppMetadata[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {
    // Ignore malformed local storage.
  }

  const defaults = defaultInstalledAppsFor(platform)
  localStorage.setItem(SIM_APPS_KEY, JSON.stringify(defaults))
  return defaults
}

function writeForegroundApp(app: InstalledAppMetadata): void {
  try {
    localStorage.setItem(SIM_FOREGROUND_KEY, JSON.stringify(app))
  } catch {
    // Ignore local storage failures.
  }
}

function readForegroundApp(platform: string): InstalledAppMetadata {
  try {
    const raw = localStorage.getItem(SIM_FOREGROUND_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as InstalledAppMetadata
      if (parsed && parsed.appName) {
        return parsed
      }
    }
  } catch {
    // Ignore malformed local storage.
  }

  const first = readInstalledApps(platform)[0]
  return first || { appName: 'Settings', categories: ['system'], sensitive: true }
}

function inferAppFromTarget(target: string): InstalledAppMetadata {
  const normalized = target.trim()
  if (!normalized) {
    return { appName: 'Unknown App' }
  }

  const lower = normalized.toLowerCase()
  if (lower.includes('whatsapp')) {
    return {
      appName: 'WhatsApp',
      packageName: 'com.whatsapp',
      deepLinks: ['whatsapp://send'],
      categories: ['social', 'messaging'],
    }
  }

  if (lower.includes('instagram')) {
    return {
      appName: 'Instagram',
      packageName: 'com.instagram.android',
      deepLinks: ['instagram://app'],
      categories: ['social'],
    }
  }

  if (lower.includes('settings')) {
    return {
      appName: 'Settings',
      packageName: 'com.android.settings',
      deepLinks: ['android.settings.SETTINGS'],
      categories: ['system'],
      sensitive: true,
    }
  }

  if (/^https?:\/\//i.test(normalized)) {
    const host = new URL(normalized).hostname.replace(/^www\./, '')
    const appLabel = host.split('.')[0] || 'Browser'
    return {
      appName: appLabel.charAt(0).toUpperCase() + appLabel.slice(1),
      deepLinks: [normalized],
      categories: ['web'],
    }
  }

  return {
    appName: normalized,
    executableName: normalized,
    categories: ['general'],
  }
}

export function installNativeBridgeShim(): void {
  if (typeof window === 'undefined') {
    return
  }

  const existingBridge = window.nativeBridge

  // In Electron, contextBridge objects are often non-extensible proxies.
  // Attempting to add shim methods to them can crash the renderer.
  if (existingBridge && !Object.isExtensible(existingBridge)) {
    return
  }

  const bridge = (existingBridge || {}) as NonNullable<typeof window.nativeBridge>

  if (!bridge.launchApp) {
    bridge.launchApp = async (appName: string) => {
      const foreground = inferAppFromTarget(appName)
      writeForegroundApp(foreground)
      return {
        success: true,
        message: `Simulated launch for ${foreground.appName}.`,
      }
    }
  }

  if (!bridge.openExternal) {
    bridge.openExternal = async (target: string) => {
      const foreground = inferAppFromTarget(target)
      writeForegroundApp(foreground)

      if (typeof window !== 'undefined') {
        window.open(target, '_blank', 'noopener,noreferrer')
      }

      return {
        success: true,
        message: `Opened ${target}.`,
      }
    }
  }

  if (!bridge.openAppAssistive) {
    bridge.openAppAssistive = async (appName: string) => {
      const foreground = inferAppFromTarget(appName)
      writeForegroundApp(foreground)
      return {
        success: true,
        message: `Simulated assistive open for ${foreground.appName}.`,
      }
    }
  }

  if (!bridge.setAutomationPermission) {
    bridge.setAutomationPermission = async (enabled: boolean) => {
      localStorage.setItem(AUTOMATION_PERMISSION_KEY, enabled ? '1' : '0')
      return {
        success: true,
        enabled,
        message: enabled ? 'Automation permission enabled.' : 'Automation permission disabled.',
      }
    }
  }

  if (!bridge.getAutomationPermission) {
    bridge.getAutomationPermission = async () => {
      const enabled = localStorage.getItem(AUTOMATION_PERMISSION_KEY) === '1'
      return {
        success: true,
        enabled,
        message: enabled ? 'Automation permission enabled.' : 'Automation permission disabled.',
      }
    }
  }

  if (!bridge.getHostPlatform) {
    bridge.getHostPlatform = async () => {
      return detectHostPlatform()
    }
  }

  if (!bridge.getInstalledAppsMetadata) {
    bridge.getInstalledAppsMetadata = async (platformHint?: string) => {
      const platform = platformHint || detectHostPlatform()
      const apps = readInstalledApps(platform)
      return {
        success: true,
        apps,
        message: `Loaded ${apps.length} installed app metadata entries.`,
      }
    }
  }

  if (!bridge.getForegroundAppMetadata) {
    bridge.getForegroundAppMetadata = async (platformHint?: string) => {
      const platform = platformHint || detectHostPlatform()
      const app = readForegroundApp(platform)
      return {
        success: true,
        app,
        message: `Foreground app detected as ${app.appName}.`,
      }
    }
  }

  if (!bridge.performInAppAction) {
    bridge.performInAppAction = async (request: {
      app: string
      action: string
      payload?: Record<string, unknown>
    }) => {
      const appName = request.app || 'app'
      return {
        success: true,
        action: request.action,
        message: `Simulated in-app action "${request.action}" for ${appName}.`,
      }
    }
  }

  if (!existingBridge) {
    window.nativeBridge = bridge
  }
}
