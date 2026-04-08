/**
 * App Registry
 * Tracks available applications across devices and platforms
 * Phase 3: Comprehensive app support for all device types
 */

export interface AppDefinition {
  id: string // Unique identifier
  name: string // Display name
  aliases: string[] // Alternative names ("spotify", "music player", etc.)
  platforms: {
    windows?: string // Launch command/path
    macos?: string
    linux?: string
    android?: string // Package name (com.spotify.music) or intent
    ios?: string // Bundle ID or URL scheme
    webos?: string // Smart TV app ID
    tizen?: string // Samsung Tizen app ID
  }
  category: 'social' | 'media' | 'productivity' | 'entertainment' | 'utility' | 'system' | 'communication'
  deviceTypes: Array<'desktop' | 'mobile' | 'tablet' | 'watch' | 'smart-home' | 'tv'>
  nativeOnly?: boolean // True if requires native APIs
}

class AppRegistry {
  private apps: Map<string, AppDefinition> = new Map()

  private normalize(value: string): string {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '')
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length
    const n = b.length
    if (m === 0) return n
    if (n === 0) return m

    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        )
      }
    }

    return dp[m][n]
  }

  constructor() {
    this.initializeDefaultApps()
  }

  /**
   * Initialize registry with common cross-platform apps
   */
  private initializeDefaultApps(): void {
    // Media & Streaming
    this.registerApp({
      id: 'spotify',
      name: 'Spotify',
      aliases: ['spotify', 'music', 'player'],
      platforms: {
        windows: 'spotify',
        macos: '/Applications/Spotify.app',
        linux: 'spotify',
        android: 'com.spotify.music',
        ios: 'spotify://play',
        webos: 'com.webos-service.music',
        tizen: 'music.gmusic',
      },
      category: 'media',
      deviceTypes: ['desktop', 'mobile', 'tablet', 'smart-home', 'tv'],
    })

    this.registerApp({
      id: 'youtube',
      name: 'YouTube',
      aliases: ['youtube', 'video', 'videos'],
      platforms: {
        windows: 'https://youtube.com',
        macos: 'https://youtube.com',
        linux: 'https://youtube.com',
        android: 'com.google.android.youtube',
        ios: 'youtubeapp://',
        webos: 'youtube',
        tizen: 'youtube.leanback',
      },
      category: 'entertainment',
      deviceTypes: ['desktop', 'mobile', 'tablet', 'tv'],
    })

    // Communication
    this.registerApp({
      id: 'telegram',
      name: 'Telegram',
      aliases: ['telegram', 'messenger', 'chat'],
      platforms: {
        windows: 'telegram',
        macos: '/Applications/Telegram.app',
        linux: 'telegram-desktop',
        android: 'org.telegram.messenger',
        ios: 'tg://',
      },
      category: 'communication',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    this.registerApp({
      id: 'whatsapp',
      name: 'WhatsApp',
      aliases: ['whatsapp', 'wa', 'messaging', 'watsapp', 'whats app', 'whtsapp'],
      platforms: {
        windows: 'whatsapp',
        macos: '/Applications/WhatsApp.app',
        linux: 'whatsapp',
        android: 'com.whatsapp',
        ios: 'whatsapp://send?phone=',
      },
      category: 'communication',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    this.registerApp({
      id: 'canva',
      name: 'Canva',
      aliases: ['canva', 'kanva', 'design app'],
      platforms: {
        windows: 'https://www.canva.com',
        macos: 'https://www.canva.com',
        linux: 'https://www.canva.com',
        android: 'com.canva.editor',
        ios: 'canva://',
      },
      category: 'productivity',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    // Browsers
    this.registerApp({
      id: 'chrome',
      name: 'Chrome',
      aliases: ['chrome', 'browser', 'google chrome', 'google'],
      platforms: {
        windows: 'chrome',
        macos: '/Applications/Google Chrome.app',
        linux: 'google-chrome',
        android: 'com.android.chrome',
        ios: 'googlechrome://',
      },
      category: 'utility',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    this.registerApp({
      id: 'firefox',
      name: 'Firefox',
      aliases: ['firefox', 'mozilla'],
      platforms: {
        windows: 'firefox',
        macos: '/Applications/Firefox.app',
        linux: 'firefox',
        android: 'org.mozilla.firefox',
        ios: 'firefox://',
      },
      category: 'utility',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    // Productivity
    this.registerApp({
      id: 'slack',
      name: 'Slack',
      aliases: ['slack', 'messaging', 'work chat'],
      platforms: {
        windows: 'slack',
        macos: '/Applications/Slack.app',
        linux: 'slack',
        android: 'com.Slack',
        ios: 'slack://',
      },
      category: 'productivity',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    this.registerApp({
      id: 'vscode',
      name: 'Visual Studio Code',
      aliases: ['vscode', 'vs code', 'code editor'],
      platforms: {
        windows: 'code',
        macos: '/Applications/Visual Studio Code.app',
        linux: 'code',
      },
      category: 'productivity',
      deviceTypes: ['desktop'],
    })

    // System
    this.registerApp({
      id: 'settings',
      name: 'Settings',
      aliases: ['settings', 'preferences', 'system settings'],
      platforms: {
        windows: 'ms-settings:',
        macos: 'open -a System\\ Preferences',
        linux: 'gnome-control-center',
        android: 'com.android.settings',
        ios: 'prefs:', // Requires restricted access
      },
      category: 'system',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    // Built-in utilities
    this.registerApp({
      id: 'calculator',
      name: 'Calculator',
      aliases: ['calculator', 'calc', 'math'],
      platforms: {
        windows: 'calc',
        macos: '/Applications/Calculator.app',
        linux: 'gnome-calculator',
        android: 'com.google.android.calculator',
      },
      category: 'utility',
      deviceTypes: ['desktop', 'mobile', 'tablet'],
    })

    this.registerApp({
      id: 'phone',
      name: 'Phone',
      aliases: ['phone', 'dialer', 'call app'],
      platforms: {
        android: 'com.google.android.dialer',
        ios: 'tel://',
      },
      category: 'communication',
      deviceTypes: ['mobile', 'tablet'],
    })

    this.registerApp({
      id: 'voice-recorder',
      name: 'Voice Recorder',
      aliases: ['voice recorder', 'recorder', 'microphone', 'record app'],
      platforms: {
        android: 'com.google.android.soundrecorder',
        ios: 'voice-memos://',
        windows: 'ms-call-recording:',
      },
      category: 'utility',
      deviceTypes: ['mobile', 'tablet', 'desktop'],
    })

    // Smart home
    this.registerApp({
      id: 'home-assistant',
      name: 'Home Assistant',
      aliases: ['home', 'home-assistant', 'automation'],
      platforms: {
        webos: 'homeassistant',
        tizen: 'homeassistant',
      },
      category: 'system',
      deviceTypes: ['smart-home', 'tv'],
      nativeOnly: true,
    })
  }

  /**
   * Register a new app
   */
  registerApp(app: AppDefinition): void {
    this.apps.set(app.id, app)
    
    // Index by aliases for quick lookup
    app.aliases.forEach(alias => {
      this.apps.set(alias.toLowerCase(), app)
    })
  }

  /**
   * Find app by name or alias
   */
  findApp(query: string): AppDefinition | undefined {
    const normalized = this.normalize(query)
    const direct = this.apps.get(normalized)
    if (direct) return direct

    const all = this.getAllApps()
    let best: AppDefinition | undefined
    let bestScore = Number.POSITIVE_INFINITY

    for (const app of all) {
      const candidates = [app.name, ...app.aliases].map((value) => this.normalize(value)).filter(Boolean)
      for (const candidate of candidates) {
        if (candidate.includes(normalized) || normalized.includes(candidate)) {
          return app
        }

        const score = this.levenshtein(normalized, candidate)
        if (score < bestScore) {
          bestScore = score
          best = app
        }
      }
    }

    const tolerance = normalized.length >= 8 ? 2 : 1
    return best && bestScore <= tolerance ? best : undefined
  }

  /**
   * Get launch command for app on specific platform
   */
  getLaunchCommand(appId: string, platform: string): string | undefined {
    const app = this.apps.get(appId)
    if (!app) return undefined

    const platformKey = platform.toLowerCase() as keyof typeof app.platforms
    return app.platforms[platformKey]
  }

  /**
   * Check if app is available on device type
   */
  isAvailableOnDevice(appId: string, deviceType: string): boolean {
    const app = this.apps.get(appId)
    if (!app) return false

    return app.deviceTypes.includes(deviceType as any)
  }

  /**
   * Get all apps supporting a device type
   */
  getAppsForDevice(deviceType: string): AppDefinition[] {
    const matching: AppDefinition[] = []
    const seen = new Set<string>()

    this.apps.forEach(app => {
      if (!seen.has(app.id) && app.deviceTypes.includes(deviceType as any)) {
        matching.push(app)
        seen.add(app.id)
      }
    })

    return matching
  }

  /**
   * Get all registered apps
   */
  getAllApps(): AppDefinition[] {
    const seen = new Set<string>()
    const all: AppDefinition[] = []

    this.apps.forEach(app => {
      if (!seen.has(app.id)) {
        all.push(app)
        seen.add(app.id)
      }
    })

    return all
  }

  /**
   * Check if app requires native APIs
   */
  requiresNativeAPI(appId: string): boolean {
    const app = this.apps.get(appId)
    return app?.nativeOnly ?? false
  }
}

// Singleton instance
let registryInstance: AppRegistry | null = null

/**
 * Get the singleton app registry instance
 */
export function getAppRegistry(): AppRegistry {
  if (!registryInstance) {
    registryInstance = new AppRegistry()
  }
  return registryInstance
}

export default AppRegistry
