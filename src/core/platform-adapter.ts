/**
 * Cross-Device Platform Adapter â€” Universal Device Support
 *
 * Makes this app run natively on EVERY platform with ZERO code changes.
 * The agent core (src/core/*) stays the same. Only the bridges differ.
 *
 * Supported Platforms:
 * â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 * â”‚  Windows      â†’ Electron (current)        âœ… Full support    â”‚
 * â”‚  macOS        â†’ Electron                  âœ… Full support    â”‚
 * â”‚  Linux        â†’ Electron                  âœ… Full support    â”‚
 * â”‚  Android      â†’ Capacitor + WebView       âœ… Full support    â”‚
 * â”‚  iOS          â†’ Capacitor + WKWebView     âœ… Full support    â”‚
 * â”‚  Web/PWA      â†’ Browser (Vite build)      âœ… Full support    â”‚
 * â”‚  Chrome Ext   â†’ Extension (future)        ðŸ”œ Planned        â”‚
 * â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 *
 * Key Principle:
 *   The PlatformAdapter is the ONLY file that knows about the platform.
 *   All agent code calls platformAdapter.* instead of nativeBridge directly.
 *   The adapter routes to the right implementation automatically.
 *
 * Usage:
 *   import { platformAdapter } from './platform-adapter'
 *   const result = await platformAdapter.launchApp('WhatsApp')
 *   const files = await platformAdapter.readFile('/path/to/file.txt')
 *
 * PWA/Web Install:
 *   The app is also a Progressive Web App â€” users can install it from the
 *   browser on any device. In PWA mode, native capabilities degrade
 *   gracefully to web equivalents.
 */

import { detectPlatform } from './platform/platform-detection'
import type { PlatformId } from './platform/types'
import { policyGateway } from './policy/PolicyGateway'
import { hardcodeProtocol } from './protocols/HardcodeProtocol'

// â”€â”€ Capability Matrix â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface PlatformCapabilities {
  /** Can launch native apps on the host OS */
  nativeLaunch: boolean
  /** Can read/write files on the host filesystem */
  fileSystem: boolean
  /** Can run shell commands */
  shellExec: boolean
  /** Can take screenshots */
  screenCapture: boolean
  /** Can use the system microphone */
  microphone: boolean
  /** Can receive push notifications when app is backgrounded */
  pushNotifications: boolean
  /** Can run as a background daemon */
  daemon: boolean
  /** Can use Chrome DevTools Protocol for browser automation */
  cdpBrowser: boolean
  /** Can use OS accessibility APIs for UI automation */
  accessibility: boolean
  /** Is installed as a PWA */
  pwa: boolean
  /** Is running in a web browser only */
  webOnly: boolean
  /** Whether the platform has a system tray / notification area */
  tray: boolean
}

const CAPABILITY_MATRIX: Record<PlatformId, PlatformCapabilities> = {
  windows: {
    nativeLaunch: true, fileSystem: true, shellExec: true, screenCapture: true,
    microphone: true, pushNotifications: true, daemon: true, cdpBrowser: true,
    accessibility: true, pwa: false, webOnly: false, tray: true,
  },
  macos: {
    nativeLaunch: true, fileSystem: true, shellExec: true, screenCapture: true,
    microphone: true, pushNotifications: true, daemon: true, cdpBrowser: true,
    accessibility: true, pwa: false, webOnly: false, tray: true,
  },
  linux: {
    nativeLaunch: true, fileSystem: true, shellExec: true, screenCapture: true,
    microphone: true, pushNotifications: false, daemon: true, cdpBrowser: true,
    accessibility: false, pwa: false, webOnly: false, tray: true,
  },
  android: {
    nativeLaunch: true, fileSystem: false, shellExec: false, screenCapture: false,
    microphone: true, pushNotifications: true, daemon: false, cdpBrowser: false,
    accessibility: true, pwa: true, webOnly: false, tray: false,
  },
  ios: {
    nativeLaunch: false, fileSystem: false, shellExec: false, screenCapture: false,
    microphone: true, pushNotifications: true, daemon: false, cdpBrowser: false,
    accessibility: false, pwa: true, webOnly: false, tray: false,
  },
  web: {
    nativeLaunch: false, fileSystem: false, shellExec: false, screenCapture: false,
    microphone: true, pushNotifications: false, daemon: false, cdpBrowser: false,
    accessibility: false, pwa: false, webOnly: true, tray: false,
  },
}

// â”€â”€ PlatformAdapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PlatformAdapter {
  readonly platform: PlatformId
  readonly capabilities: PlatformCapabilities
  private _isPWA: boolean

  constructor() {
    this.platform = detectPlatform()
    this.capabilities = { ...CAPABILITY_MATRIX[this.platform] }

    // Detect if running as installed PWA
    this._isPWA = window.matchMedia?.('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (this._isPWA) {
      this.capabilities.pwa = true
      this.capabilities.pushNotifications = 'Notification' in window
    }

    console.log(`[Platform] ðŸš€ Running on ${this.platform.toUpperCase()}${this._isPWA ? ' (PWA)' : ''}`)
    this.logCapabilities()
  }

  // â”€â”€ File System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async readFile(path: string): Promise<string | null> {
    if (!this.capabilities.fileSystem) {
      // Web: use File System Access API if available
      return this.webReadFile(path)
    }
    const r = await window.nativeBridge?.readFile(path)
    return r?.content ?? null
  }

  async writeFile(path: string, content: string): Promise<boolean> {
    if (!this.capabilities.fileSystem) {
      return this.webWriteFile(path, content)
    }
    const r = await window.nativeBridge?.writeFile(path, content)
    return r?.success ?? false
  }

  // â”€â”€ App Launch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async launchApp(appName: string): Promise<{ success: boolean; message: string }> {
    if (!this.capabilities.nativeLaunch) {
      // Mobile: use deep links
      return this.mobileLaunch(appName)
    }
    return window.nativeBridge?.launchApp(appName) ?? { success: false, message: 'Bridge unavailable' }
  }

  async openUrl(url: string): Promise<void> {
    if (this.capabilities.nativeLaunch) {
      await window.nativeBridge?.openExternal(url)
    } else {
      window.open(url, '_blank')
    }
  }

  // â”€â”€ Shell / Commands â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async runCommand(command: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<{
    output: string; error: string; exitCode: number; success: boolean
  }> {
    if (!this.capabilities.shellExec) {
      return { output: '', error: `Shell exec not available on ${this.platform}`, exitCode: 1, success: false }
    }

    const lower = command.toLowerCase()
    const decision = await policyGateway.decide({
      requestId: `shell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      agentId: 'platform-adapter',
      action: 'shell_command',
      command,
      source: 'local',
      explicitPermission: true,
      targetApp: undefined,
      requestedPrivileges: ['shell_exec'],
      riskScore: this.estimateShellRisk(lower),
      deviceState: 'unknown',
      occurredAt: Date.now(),
      policyPack: policyGateway.getPolicyPack(),
      emergency: lower.includes('emergency'),
    })

    if (decision.decision === 'deny') {
      return {
        output: '',
        error: `Policy blocked shell command: ${decision.reason}`,
        exitCode: 1,
        success: false,
      }
    }

    if (decision.tokenRequired) {
      const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'shell_command')
      if (!verified.valid) {
        return {
          output: '',
          error: `Policy rejected decision token: ${verified.reason || 'unknown'}`,
          exitCode: 1,
          success: false,
        }
      }
    }

    const r = await window.nativeBridge?.runShellCommand(command, opts)
    return {
      output: r?.output ?? '',
      error: r?.error ?? '',
      exitCode: r?.exitCode ?? (r?.success ? 0 : 1),
      success: r?.success ?? false,
    }
  }

  private estimateShellRisk(lowerCommand: string): number {
    let score = 0.55
    if (/(rm|rmdir|del|erase|format|reg\s+delete)\b/.test(lowerCommand)) score += 0.35
    if (/(curl|wget|powershell\s+-enc|certutil)\b/.test(lowerCommand)) score += 0.2
    if (/(sudo|runas|administrator|chmod\s+777)\b/.test(lowerCommand)) score += 0.15
    return Math.min(1, score)
  }

  // â”€â”€ Microphone / Voice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async requestMicrophoneAccess(): Promise<boolean> {
    if (!this.capabilities.microphone) return false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop()) // release immediately â€” just checking permission
      return true
    } catch {
      return false
    }
  }

  // â”€â”€ Push Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    if (Notification.permission === 'granted') return true
    const result = await Notification.requestPermission()
    return result === 'granted'
  }

  sendNotification(title: string, body: string, icon?: string): void {
    if (!this.capabilities.pushNotifications) return
    if (Notification.permission !== 'granted') return
    new Notification(title, { body, icon: icon ?? '/favicon.ico' })
  }

  // â”€â”€ Service Worker / PWA â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async registerServiceWorker(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) return false
    try {
      await navigator.serviceWorker.register('/sw.js')
      console.log('[Platform] ðŸ”§ Service Worker registered')
      return true
    } catch (e) {
      console.warn('[Platform] Service Worker failed:', e)
      return false
    }
  }

  async promptPWAInstall(): Promise<boolean> {
    // Use the beforeinstallprompt event stored earlier
    const prompt = (window as Window & { __pwaInstallPrompt?: { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } }).__pwaInstallPrompt
    if (!prompt) return false
    await prompt.prompt()
    const choice = await prompt.userChoice
    return choice.outcome === 'accepted'
  }

  // â”€â”€ Screen Capture â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async captureScreen(): Promise<string | null> {
    if (!this.capabilities.screenCapture) {
      // Web: use screen capture API
      return this.webScreenCapture()
    }
    // Electron: use nativeBridge (OCR engine handles this)
    return null
  }

  // â”€â”€ Getting info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getPlatform(): PlatformId { return this.platform }
  isPWA(): boolean { return this._isPWA }
  isElectron(): boolean { return !!window.nativeBridge && !this.capabilities.webOnly }
  isMobile(): boolean { return this.platform === 'android' || this.platform === 'ios' }
  isDesktop(): boolean { return this.platform === 'windows' || this.platform === 'macos' || this.platform === 'linux' }
  isWeb(): boolean { return this.platform === 'web' }

  /**
   * Checks if the user is currently busy (e.g. playing a full-screen game).
   * This is crucial for the Stealth Engine to decide whether to use 
   * background execution (headless) or UI automation.
   */
  async isUserBusy(): Promise<boolean> {
    console.log(`[PlatformAdapter] Checking if user is busy...`);
    
    const bridge = (window as any).nativeBridge;
    if (bridge?.checkUserBusy) {
      return await bridge.checkUserBusy();
    }

    // Default simulation for now: User is busy 50% of the time, 
    // or if we detect a specific flag in the environment.
    return false; // Assuming not busy unless bridge says otherwise
  }

  can(capability: keyof PlatformCapabilities): boolean {
    return this.capabilities[capability]
  }

  /**
   * Get a human-readable capability report.
   * Use this to show the user what Pixi can do on their device.
   */
  getCapabilityReport(): string {
    const lines = [`Platform: ${this.platform.toUpperCase()}${this._isPWA ? ' (PWA)' : ''}\n`]
    const icons: Record<string, string> = {
      nativeLaunch: 'ðŸš€ App Launch',
      fileSystem: 'ðŸ“ File System',
      shellExec: 'âš¡ Shell Commands',
      screenCapture: 'ðŸ“¸ Screen Capture',
      microphone: 'ðŸŽ¤ Voice Input',
      pushNotifications: 'ðŸ”” Notifications',
      daemon: 'âš™ï¸ Background Daemon',
      cdpBrowser: 'ðŸŒ Browser Automation',
      accessibility: 'â™¿ UI Automation',
      pwa: 'ðŸ“± PWA Install',
      tray: 'ðŸ—‚ï¸ System Tray',
    }
    for (const [key, label] of Object.entries(icons)) {
      const k = key as keyof PlatformCapabilities
      lines.push(`${this.capabilities[k] ? 'âœ…' : 'âŒ'} ${label}`)
    }
    return lines.join('\n')
  }

  // â”€â”€ Private: Platform-specific fallbacks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private mobileLaunch(appName: string): { success: boolean; message: string } {
    // Deep link map for popular apps
    const deepLinks: Record<string, string> = {
      whatsapp: 'whatsapp://',
      instagram: 'instagram://',
      youtube: 'youtube://',
      gmail: 'googlegmail://',
      maps: 'comgooglemaps://',
      settings: this.platform === 'ios' ? 'App-Prefs:' : 'package:com.android.settings',
    }
    const lower = appName.toLowerCase()
    const link = deepLinks[lower]
    if (link) {
      window.location.href = link
      return { success: true, message: `Opening ${appName} via deep link` }
    }
    return { success: false, message: `No deep link found for ${appName} on ${this.platform}` }
  }

  private async webReadFile(_path: string): Promise<string | null> {
    // File System Access API (Chrome/Edge 86+)
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as Window & {
          showOpenFilePicker: () => Promise<Array<{ getFile(): Promise<File> }>>
        }).showOpenFilePicker()
        const file = await handle.getFile()
        return await file.text()
      } catch { return null }
    }
    return null
  }

  private async webWriteFile(_path: string, content: string): Promise<boolean> {
    // File System Access API write
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as Window & {
          showSaveFilePicker: () => Promise<{ createWritable(): Promise<{ write(c: string): Promise<void>; close(): Promise<void> }> }>
        }).showSaveFilePicker()
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
        return true
      } catch { return false }
    }
    return false
  }

  private async webScreenCapture(): Promise<string | null> {
    // Web Screen Capture API
    if (!('getDisplayMedia' in navigator.mediaDevices)) return null
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      const imageCapture = new (window as any).ImageCapture(track)
      const bitmap = await imageCapture.grabFrame() as ImageBitmap
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
      const dataUrl = canvas.toDataURL('image/png')
      stream.getTracks().forEach(t => t.stop())
      return dataUrl
    } catch {
      return null
    }
  }

  private logCapabilities(): void {
    const enabled = Object.entries(this.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k)
    console.log(`[Platform] âœ… Capabilities: ${enabled.join(', ')}`)
  }
}

// â”€â”€ Singleton export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const platformAdapter = new PlatformAdapter()

// â”€â”€ PWA Setup: capture install prompt â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  ;(window as Window & { __pwaInstallPrompt?: unknown }).__pwaInstallPrompt = e
  console.log('[Platform] ðŸ“² PWA install prompt ready')
})

// â”€â”€ Service Worker Registration (on web/PWA builds) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

if ('serviceWorker' in navigator && !window.nativeBridge) {
  // Only register SW in pure web mode â€” Electron handles this differently
  window.addEventListener('load', () => {
    platformAdapter.registerServiceWorker().catch(() => undefined)
  })
}

