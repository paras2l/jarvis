import { AppFallbackPolicy, AppSelectorVariant, LaunchRequest, PlatformId } from './types'

type AppProfile = {
  names: string[]
  executableName?: string
  packageName?: Partial<Record<PlatformId, string>>
  deepLinks?: Partial<Record<PlatformId, string[]>>
  webFallback?: string
  iosAllowedSchemes?: string[]
  fallbackPolicy?: Partial<Record<PlatformId, AppFallbackPolicy>>
  appSelectors?: Partial<Record<PlatformId, AppSelectorVariant[]>>
  sensitiveByDefault?: boolean
  source?: 'static' | 'learned'
}

type InstalledAppMetadata = {
  appName: string
  packageName?: string
  bundleId?: string
  executableName?: string
  deepLinks?: string[]
  categories?: string[]
  sensitive?: boolean
  aliases?: string[]
}

const LEARNED_APP_PROFILES_KEY = 'paxion_learned_app_profiles_v1'

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeAppKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
}

function levenshtein(a: string, b: string): number {
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

function findStaticProfile(appName: string): AppProfile | undefined {
  const normalized = normalizeAppKey(appName)
  const direct = APP_PROFILES.find((profile) =>
    profile.names.some((name) => normalizeAppKey(name) === normalized)
  )
  if (direct) return direct

  let best: AppProfile | undefined
  let bestScore = Number.POSITIVE_INFINITY

  for (const profile of APP_PROFILES) {
    for (const name of profile.names) {
      const candidate = normalizeAppKey(name)
      if (!candidate) continue
      if (candidate.includes(normalized) || normalized.includes(candidate)) {
        return profile
      }

      const score = levenshtein(normalized, candidate)
      if (score < bestScore) {
        bestScore = score
        best = profile
      }
    }
  }

  const tolerance = normalized.length >= 8 ? 2 : 1
  return best && bestScore <= tolerance ? best : undefined
}

function isSensitiveCategory(categories: string[] = []): boolean {
  return categories.some((category) =>
    ['bank', 'finance', 'payment', 'wallet', 'auth', 'security'].some((token) =>
      category.toLowerCase().includes(token)
    )
  )
}

function defaultPolicyFor(platform: PlatformId, profile?: AppProfile): AppFallbackPolicy {
  const custom = profile?.fallbackPolicy?.[platform]
  if (custom) {
    return custom
  }

  const hasIntent = !!profile?.packageName?.[platform] || !!profile?.deepLinks?.[platform]?.length
  if (hasIntent) {
    return {
      launchability: 'launchable_by_intent',
      allowScreenAutomation: platform === 'android',
      requiresManualAuthHandoff: false,
      sensitiveByDefault: false,
    }
  }

  if (platform === 'android') {
    return {
      launchability: 'launchable_by_screen_automation',
      allowScreenAutomation: true,
      requiresManualAuthHandoff: false,
      sensitiveByDefault: false,
    }
  }

  return {
    launchability: platform === 'windows' || platform === 'macos' || platform === 'linux'
      ? 'launchable_by_intent'
      : 'blocked',
    blockedReason: platform === 'windows' || platform === 'macos' || platform === 'linux'
      ? undefined
      : `No supported launch target metadata for ${platform}.`,
    allowScreenAutomation: platform === 'windows' || platform === 'macos' || platform === 'linux',
    requiresManualAuthHandoff: false,
    sensitiveByDefault: false,
  }
}

const APP_PROFILES: AppProfile[] = [
  {
    names: ['instagram', 'insta'],
    packageName: {
      android: 'com.instagram.android',
      ios: 'instagram://app',
    },
    iosAllowedSchemes: ['instagram'],
    deepLinks: {
      ios: ['instagram://app'],
      android: ['intent://instagram.com/#Intent;package=com.instagram.android;scheme=https;end'],
      windows: ['https://www.instagram.com'],
      web: ['https://www.instagram.com'],
    },
    appSelectors: {
      android: [
        { resourceId: 'com.instagram.android:id/tab_avatar', visibleText: 'Instagram' },
        { contentDesc: 'Instagram' },
        { visibleText: 'Instagram' },
      ],
    },
    webFallback: 'https://www.instagram.com',
  },
  {
    names: ['whatsapp', 'whats app', 'watsapp', 'whtsapp', 'wa'],
    executableName: 'whatsapp.exe',
    packageName: {
      android: 'com.whatsapp',
      ios: 'whatsapp://',
    },
    iosAllowedSchemes: ['whatsapp'],
    deepLinks: {
      android: ['whatsapp://send'],
      ios: ['whatsapp://'],
      windows: ['https://web.whatsapp.com'],
      web: ['https://web.whatsapp.com'],
    },
    appSelectors: {
      android: [
        { resourceId: 'com.whatsapp:id/home_tab_layout', visibleText: 'WhatsApp' },
        { contentDesc: 'WhatsApp' },
        { visibleText: 'WhatsApp' },
      ],
    },
    webFallback: 'https://web.whatsapp.com',
  },
  {
    names: ['spotify'],
    executableName: 'spotify.exe',
    packageName: {
      android: 'com.spotify.music',
      ios: 'spotify://',
    },
    iosAllowedSchemes: ['spotify'],
    deepLinks: {
      windows: ['spotify://'],
      android: ['spotify://'],
      ios: ['spotify://'],
      web: ['https://open.spotify.com'],
    },
    webFallback: 'https://open.spotify.com',
  },
  {
    names: ['youtube', 'yt'],
    executableName: 'chrome.exe',
    packageName: {
      android: 'com.google.android.youtube',
      ios: 'youtube://',
    },
    iosAllowedSchemes: ['youtube'],
    deepLinks: {
      android: ['vnd.youtube://', 'youtube://'],
      ios: ['youtube://'],
      windows: ['https://www.youtube.com'],
      web: ['https://www.youtube.com'],
    },
    webFallback: 'https://www.youtube.com',
  },
  {
    names: ['gmail', 'mail'],
    executableName: 'outlook.exe',
    packageName: {
      android: 'com.google.android.gm',
      ios: 'googlegmail://',
    },
    iosAllowedSchemes: ['googlegmail', 'mailto'],
    deepLinks: {
      android: ['googlegmail://'],
      ios: ['googlegmail://', 'mailto:'],
      windows: ['mailto:'],
      web: ['mailto:'],
    },
    webFallback: 'mailto:',
  },
  {
    names: ['maps', 'google maps'],
    executableName: 'msedge.exe',
    packageName: {
      android: 'com.google.android.apps.maps',
      ios: 'comgooglemaps://',
    },
    iosAllowedSchemes: ['comgooglemaps'],
    deepLinks: {
      android: ['geo:0,0?q='],
      ios: ['comgooglemaps://'],
      windows: ['https://maps.google.com'],
      web: ['https://maps.google.com'],
    },
    webFallback: 'https://maps.google.com',
  },
  {
    names: ['facebook', 'fb'],
    executableName: 'chrome.exe',
    packageName: {
      android: 'com.facebook.katana',
      ios: 'fb://',
    },
    iosAllowedSchemes: ['fb'],
    deepLinks: {
      android: ['fb://'],
      ios: ['fb://'],
      windows: ['https://www.facebook.com'],
      web: ['https://www.facebook.com'],
    },
    webFallback: 'https://www.facebook.com',
  },
  {
    names: ['tiktok'],
    executableName: 'chrome.exe',
    packageName: {
      android: 'com.zhiliaoapp.musically',
      ios: 'snssdk1233://',
    },
    iosAllowedSchemes: ['snssdk1233'],
    deepLinks: {
      android: ['snssdk1233://'],
      ios: ['snssdk1233://'],
      windows: ['https://www.tiktok.com'],
      web: ['https://www.tiktok.com'],
    },
    webFallback: 'https://www.tiktok.com',
  },
  {
    names: ['settings', 'system settings'],
    executableName: 'ms-settings:',
    packageName: {
      android: 'android.settings.SETTINGS',
      ios: 'app-settings:',
    },
    iosAllowedSchemes: ['app-settings'],
    deepLinks: {
      android: ['android.settings.SETTINGS'],
      ios: ['app-settings:'],
      windows: ['ms-settings:'],
      web: ['about:blank'],
    },
    fallbackPolicy: {
      android: {
        launchability: 'launchable_by_intent',
        allowScreenAutomation: true,
        requiresManualAuthHandoff: true,
        sensitiveByDefault: true,
      },
    },
    appSelectors: {
      android: [
        { resourceId: 'com.android.settings:id/search_action_bar', visibleText: 'Settings' },
        { contentDesc: 'Settings' },
        { visibleText: 'Settings' },
      ],
    },
    webFallback: 'about:blank',
  },
  {
    names: ['discord'],
    executableName: 'Discord.exe',
    packageName: {
      android: 'com.discord',
      ios: 'discord://',
    },
    iosAllowedSchemes: ['discord'],
    deepLinks: {
      android: ['discord://'],
      ios: ['discord://'],
      windows: ['https://discord.com/app'],
      web: ['https://discord.com/app'],
    },
    webFallback: 'https://discord.com/app',
  },
  {
    names: ['telegram'],
    executableName: 'Telegram.exe',
    packageName: {
      android: 'org.telegram.messenger',
      ios: 'tg://',
    },
    iosAllowedSchemes: ['tg'],
    deepLinks: {
      android: ['tg://'],
      ios: ['tg://'],
      windows: ['https://web.telegram.org'],
      web: ['https://web.telegram.org'],
    },
    webFallback: 'https://web.telegram.org',
  },
  {
    names: ['zoom'],
    executableName: 'Zoom.exe',
    packageName: {
      android: 'us.zoom.videomeetings',
      ios: 'zoomus://',
    },
    iosAllowedSchemes: ['zoomus'],
    deepLinks: {
      android: ['zoomus://'],
      ios: ['zoomus://'],
      windows: ['https://zoom.us'],
      web: ['https://zoom.us'],
    },
    webFallback: 'https://zoom.us',
  },
  {
    names: ['chrome', 'google chrome'],
    executableName: 'chrome.exe',
    packageName: {
      android: 'com.android.chrome',
      ios: 'googlechrome://',
    },
    iosAllowedSchemes: ['googlechrome'],
    deepLinks: {
      android: ['googlechrome://'],
      ios: ['googlechrome://'],
      windows: ['https://www.google.com/chrome/'],
      web: ['https://www.google.com/chrome/'],
    },
    webFallback: 'https://www.google.com/chrome/',
  },
  {
    names: ['edge', 'microsoft edge'],
    executableName: 'msedge.exe',
    packageName: {
      android: 'com.microsoft.emmx',
      ios: 'microsoft-edge://',
    },
    iosAllowedSchemes: ['microsoft-edge'],
    deepLinks: {
      android: ['microsoft-edge://'],
      ios: ['microsoft-edge://'],
      windows: ['https://www.microsoft.com/edge'],
      web: ['https://www.microsoft.com/edge'],
    },
    webFallback: 'https://www.microsoft.com/edge',
  },
  {
    names: ['visual studio code', 'vs code', 'vscode', 'code'],
    executableName: 'code.exe',
    deepLinks: {
      windows: ['vscode://'],
      macos: ['vscode://'],
      linux: ['vscode://'],
      web: ['https://code.visualstudio.com'],
    },
    webFallback: 'https://code.visualstudio.com',
  },
  {
    names: ['canva', 'kanva'],
    executableName: 'canva.exe',
    packageName: {
      android: 'com.canva.editor',
      ios: 'canva://',
    },
    iosAllowedSchemes: ['canva'],
    deepLinks: {
      android: ['canva://'],
      ios: ['canva://'],
      windows: ['https://www.canva.com'],
      web: ['https://www.canva.com'],
    },
    webFallback: 'https://www.canva.com',
  },
  {
    names: ['slack'],
    executableName: 'slack.exe',
    packageName: {
      android: 'com.Slack',
      ios: 'slack://',
    },
    iosAllowedSchemes: ['slack'],
    deepLinks: {
      android: ['slack://'],
      ios: ['slack://'],
      windows: ['https://slack.com/app'],
      web: ['https://slack.com/app'],
    },
    webFallback: 'https://slack.com/app',
  },
  {
    names: ['notion'],
    executableName: 'notion.exe',
    packageName: {
      android: 'notion.id',
      ios: 'notion://',
    },
    iosAllowedSchemes: ['notion'],
    deepLinks: {
      android: ['notion://'],
      ios: ['notion://'],
      windows: ['https://www.notion.so'],
      web: ['https://www.notion.so'],
    },
    webFallback: 'https://www.notion.so',
  },
  {
    names: ['zoom meeting'],
    executableName: 'Zoom.exe',
    packageName: {
      android: 'us.zoom.videomeetings',
      ios: 'zoomus://',
    },
    iosAllowedSchemes: ['zoomus'],
    deepLinks: {
      android: ['zoomus://'],
      ios: ['zoomus://'],
      windows: ['https://zoom.us/join'],
      web: ['https://zoom.us/join'],
    },
    webFallback: 'https://zoom.us/join',
  },
]

class AppIndexer {
  private learnedProfiles: AppProfile[] = []

  constructor() {
    this.loadLearnedProfiles()
  }

  private loadLearnedProfiles(): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    try {
      const raw = localStorage.getItem(LEARNED_APP_PROFILES_KEY)
      if (!raw) {
        return
      }

      const parsed = JSON.parse(raw) as AppProfile[]
      this.learnedProfiles = Array.isArray(parsed)
        ? parsed
            .filter((profile) => Array.isArray(profile.names) && profile.names.length > 0)
            .map((profile) => ({ ...profile, source: 'learned' }))
        : []
    } catch (error) {
      console.warn('[AppIndexer] Failed to load learned app profiles:', error)
      this.learnedProfiles = []
    }
  }

  private saveLearnedProfiles(): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    try {
      localStorage.setItem(LEARNED_APP_PROFILES_KEY, JSON.stringify(this.learnedProfiles))
    } catch (error) {
      console.warn('[AppIndexer] Failed to save learned app profiles:', error)
    }
  }

  private findProfile(appName: string): AppProfile | undefined {
    const normalized = normalizeAppKey(appName)

    const learned = this.learnedProfiles.find((profile) =>
      profile.names.some((name) => normalizeAppKey(name) === normalized)
    )

    if (learned) {
      return learned
    }

    let bestLearned: AppProfile | undefined
    let bestLearnedScore = Number.POSITIVE_INFINITY
    for (const profile of this.learnedProfiles) {
      for (const name of profile.names) {
        const candidate = normalizeAppKey(name)
        if (!candidate) continue
        if (candidate.includes(normalized) || normalized.includes(candidate)) {
          return profile
        }
        const score = levenshtein(normalized, candidate)
        if (score < bestLearnedScore) {
          bestLearnedScore = score
          bestLearned = profile
        }
      }
    }

    const learnedTolerance = normalized.length >= 8 ? 2 : 1
    if (bestLearned && bestLearnedScore <= learnedTolerance) {
      return bestLearned
    }

    return findStaticProfile(appName)
  }

  private inferPolicy(
    platform: PlatformId,
    metadata: InstalledAppMetadata
  ): AppFallbackPolicy {
    const sensitive = Boolean(metadata.sensitive) || isSensitiveCategory(metadata.categories)
    const hasLaunchTarget =
      !!metadata.packageName ||
      !!metadata.bundleId ||
      !!metadata.executableName ||
      !!metadata.deepLinks?.length

    if (hasLaunchTarget) {
      return {
        launchability: 'launchable_by_intent',
        allowScreenAutomation: platform === 'android',
        requiresManualAuthHandoff: sensitive,
        sensitiveByDefault: sensitive,
      }
    }

    if (platform === 'android') {
      return {
        launchability: 'launchable_by_screen_automation',
        allowScreenAutomation: true,
        requiresManualAuthHandoff: sensitive,
        sensitiveByDefault: sensitive,
      }
    }

    return {
      launchability: 'blocked',
      blockedReason: `Insufficient metadata to launch ${metadata.appName} on ${platform}.`,
      allowScreenAutomation: false,
      requiresManualAuthHandoff: sensitive,
      sensitiveByDefault: sensitive,
    }
  }

  private upsertLearnedProfile(platform: PlatformId, metadata: InstalledAppMetadata): AppProfile {
    const primaryName = metadata.appName.trim()
    const normalizedNames = dedupe([
      primaryName,
      ...(metadata.aliases || []),
      metadata.packageName || '',
      metadata.bundleId || '',
      metadata.executableName || '',
    ]).filter(Boolean)

    const existingIndex = this.learnedProfiles.findIndex((profile) =>
      profile.names.some(
        (name) =>
          normalizedNames.some((candidate) => normalizeAppKey(candidate) === normalizeAppKey(name))
      )
    )

    const policy = this.inferPolicy(platform, metadata)
    const baseProfile: AppProfile = {
      names: normalizedNames,
      executableName: metadata.executableName,
      packageName: {},
      deepLinks: {},
      fallbackPolicy: {},
      appSelectors: {},
      sensitiveByDefault: policy.sensitiveByDefault,
      source: 'learned',
    }

    baseProfile.fallbackPolicy![platform] = policy

    if (metadata.packageName) {
      baseProfile.packageName![platform] = metadata.packageName
    }

    if (metadata.bundleId) {
      baseProfile.packageName![platform] = metadata.bundleId
    }

    if (metadata.deepLinks?.length) {
      baseProfile.deepLinks![platform] = dedupe(metadata.deepLinks)
    }

    if (existingIndex === -1) {
      this.learnedProfiles.push(baseProfile)
      this.saveLearnedProfiles()
      return baseProfile
    }

    const existing = this.learnedProfiles[existingIndex]
    existing.names = dedupe([...existing.names, ...baseProfile.names])
    existing.executableName = existing.executableName || baseProfile.executableName
    existing.packageName = {
      ...(existing.packageName || {}),
      ...(baseProfile.packageName || {}),
    }
    existing.deepLinks = {
      ...(existing.deepLinks || {}),
      ...(baseProfile.deepLinks || {}),
    }
    existing.fallbackPolicy = {
      ...(existing.fallbackPolicy || {}),
      ...(baseProfile.fallbackPolicy || {}),
    }
    existing.sensitiveByDefault =
      Boolean(existing.sensitiveByDefault) || Boolean(baseProfile.sensitiveByDefault)
    existing.source = 'learned'
    this.saveLearnedProfiles()
    return existing
  }

  async syncInstalledApps(platform: PlatformId): Promise<{
    success: boolean
    message: string
    learnedCount: number
  }> {
    if (typeof window === 'undefined' || !window.nativeBridge?.getInstalledAppsMetadata) {
      return {
        success: false,
        message: 'Installed app sync is unavailable in this runtime.',
        learnedCount: 0,
      }
    }

    const result = await window.nativeBridge.getInstalledAppsMetadata(platform)
    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Failed to fetch installed app metadata.',
        learnedCount: 0,
      }
    }

    const learnedCount = this.ingestInstalledApps(platform, result.apps || [])

    return {
      success: true,
      message: `Synced ${learnedCount} installed app${learnedCount === 1 ? '' : 's'} from device metadata.`,
      learnedCount,
    }
  }

  ingestInstalledApps(platform: PlatformId, apps: Array<Record<string, unknown>>): number {
    let learnedCount = 0

    for (const item of apps) {
      const appName = String(item.appName || '').trim()
      if (!appName) {
        continue
      }

      const deepLinks = Array.isArray(item.deepLinks)
        ? item.deepLinks.map((entry) => String(entry)).filter(Boolean)
        : undefined

      const categories = Array.isArray(item.categories)
        ? item.categories.map((entry) => String(entry)).filter(Boolean)
        : undefined

      const aliases = Array.isArray(item.aliases)
        ? item.aliases.map((entry) => String(entry)).filter(Boolean)
        : undefined

      this.upsertLearnedProfile(platform, {
        appName,
        packageName: item.packageName ? String(item.packageName) : undefined,
        bundleId: item.bundleId ? String(item.bundleId) : undefined,
        executableName: item.executableName ? String(item.executableName) : undefined,
        deepLinks,
        categories,
        sensitive: Boolean(item.sensitive),
        aliases,
      })
      learnedCount += 1
    }

    return learnedCount
  }

  async learnCurrentForegroundApp(platform: PlatformId, alias?: string): Promise<{
    success: boolean
    message: string
    learnedAppName?: string
  }> {
    if (typeof window === 'undefined' || !window.nativeBridge?.getForegroundAppMetadata) {
      return {
        success: false,
        message: 'Foreground app learning is unavailable in this runtime.',
      }
    }

    const result = await window.nativeBridge.getForegroundAppMetadata(platform)
    if (!result.success || !result.app) {
      return {
        success: false,
        message: result.message || 'Could not read current foreground app.',
      }
    }

    const foregroundName = String(result.app.appName || '').trim()
    const normalizedForeground = normalizeAppKey(foregroundName)
    const normalizedAlias = normalizeAppKey(String(alias || ''))

    // Avoid poisoning aliases when foreground app does not match the requested alias.
    const shouldAttachAlias =
      !!normalizedAlias &&
      (normalizedForeground.includes(normalizedAlias) ||
        normalizedAlias.includes(normalizedForeground) ||
        normalizeAppKey(String(result.app.executableName || '')).includes(normalizedAlias))

    const learned = this.upsertLearnedProfile(platform, {
      ...result.app,
      aliases: shouldAttachAlias ? [String(alias)] : undefined,
    })

    return {
      success: true,
      message: shouldAttachAlias
        ? `Learned app profile for ${result.app.appName}.`
        : `Learned foreground profile for ${result.app.appName} without alias mapping (mismatch guard).`,
      learnedAppName: learned.names[0],
    }
  }

  findCandidate(appName: string, platform: PlatformId): LaunchRequest {
    const normalized = normalizeAppKey(appName)
    const profile = this.findProfile(appName)

    if (!profile) {
      return {
        appName,
        executableName: normalized || appName,
        deepLinks: [
          `${normalized || appName.toLowerCase().trim()}://`,
          `https://www.google.com/search?q=${encodeURIComponent(`open ${appName}`)}`,
        ],
        webFallback: `https://www.google.com/search?q=${encodeURIComponent(`open ${appName}`)}`,
        fallbackPolicy: defaultPolicyFor(platform),
        appSelectors: [],
      }
    }

    return {
      appName,
      executableName: profile.executableName || normalized,
      packageName: profile.packageName?.[platform],
      deepLinks: dedupe(profile.deepLinks?.[platform] || profile.deepLinks?.web || []),
      webFallback: profile.webFallback,
      fallbackPolicy: defaultPolicyFor(platform, profile),
      appSelectors: profile.appSelectors?.[platform] || [],
    }
  }

  getIosAllowedSchemes(appName: string): string[] {
    const profile = this.findProfile(appName)

    if (!profile) {
      return []
    }

    return dedupe(profile.iosAllowedSchemes || [])
  }

  listKnownApps(): string[] {
    const staticNames = APP_PROFILES.flatMap((profile) => profile.names)
    const learnedNames = this.learnedProfiles.flatMap((profile) => profile.names)
    return dedupe([...staticNames, ...learnedNames])
  }

  getFallbackPolicy(appName: string, platform: PlatformId): AppFallbackPolicy {
    const profile = this.findProfile(appName)
    return defaultPolicyFor(platform, profile)
  }

  getAppSelectors(appName: string, platform: PlatformId): AppSelectorVariant[] {
    const profile = this.findProfile(appName)
    return profile?.appSelectors?.[platform] || []
  }
}

export const appIndexer = new AppIndexer()
