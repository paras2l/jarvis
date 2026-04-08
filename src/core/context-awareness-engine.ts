import { getLatestChatHistory } from '@/core/chat-history'
import { runtimeEventBus, RuntimeContextSnapshot } from '@/core/event-bus'
import { getDeviceMesh } from '@/core/device-mesh'
import { db } from '@/lib/db'

class ContextAwarenessEngine {
  private lastSnapshot: RuntimeContextSnapshot | null = null
  private lastUserCommand: string | undefined

  constructor() {
    runtimeEventBus.on('voice.command', ({ command }) => {
      this.lastUserCommand = command.slice(0, 220)
    })
  }

  async collectSnapshot(): Promise<RuntimeContextSnapshot> {
    const now = new Date()
    const hour = now.getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'

    const activeWindow = await this.getActiveWindowTitle()
    const foregroundApp = await this.getForegroundAppName()
    const recentConversationSummary = this.buildConversationSummary()
    const systemBusy = await this.isSystemBusy()
    const pendingNotifications = await this.getPendingNotifications()
    const deviceState = this.getDeviceState()
    const userActivity = this.inferUserActivity(activeWindow, foregroundApp, recentConversationSummary)
    const calendarSignals = this.inferCalendarSignals(recentConversationSummary)

    const snapshot: RuntimeContextSnapshot = {
      timestamp: Date.now(),
      activeWindowTitle: activeWindow,
      foregroundApp,
      timeOfDay,
      recentConversationSummary,
      systemBusy,
      activeApplications: foregroundApp ? [foregroundApp] : [],
      userActivity,
      screenSummary: activeWindow,
      pendingNotifications,
      calendarSignals,
      lastUserCommand: this.lastUserCommand,
      deviceState,
    }

    this.lastSnapshot = snapshot
    await runtimeEventBus.emit('context.updated', { snapshot })
    return snapshot
  }

  getLastSnapshot(): RuntimeContextSnapshot | null {
    return this.lastSnapshot
  }

  private async getActiveWindowTitle(): Promise<string> {
    if (!window.nativeBridge?.getForegroundWindow) return 'unknown'
    const result = await window.nativeBridge.getForegroundWindow()
    if (!result.success) return 'unknown'
    return result.windowTitle || 'unknown'
  }

  private async getForegroundAppName(): Promise<string | undefined> {
    if (!window.nativeBridge?.getForegroundAppMetadata) return undefined
    const result = await window.nativeBridge.getForegroundAppMetadata()
    if (!result.success || !result.app) return undefined
    return result.app.appName
  }

  private buildConversationSummary(): string {
    const latest = getLatestChatHistory()
    if (!latest || !latest.messages.length) return 'No recent conversations'

    const tail = latest.messages.slice(-4)
    const compact = tail
      .map((m) => `${m.type === 'user' ? 'User' : 'Agent'}: ${String(m.content || '').slice(0, 100)}`)
      .join(' | ')

    return compact.slice(0, 400)
  }

  private async isSystemBusy(): Promise<boolean> {
    if (!window.nativeBridge?.mcp?.checkUserBusy) return false
    try {
      return await window.nativeBridge.mcp.checkUserBusy()
    } catch {
      return false
    }
  }

  private async getPendingNotifications(): Promise<RuntimeContextSnapshot['pendingNotifications']> {
    try {
      const pending = await db.notifications.listPending(5)
      return pending.map((item) => ({
        source: item.app_name,
        title: (item.sender || item.content || item.app_name || 'notification').slice(0, 120),
        importance: item.importance || 'info',
      }))
    } catch {
      return []
    }
  }

  private getDeviceState(): RuntimeContextSnapshot['deviceState'] {
    const mesh = getDeviceMesh()
    const local = mesh.getLocalDevice()
    const devices = mesh.getAllDevices()
    const activeCount = devices.filter((device) => device.status === 'online').length
    return {
      localDeviceId: local.id,
      localDeviceStatus: local.status,
      activeDeviceCount: activeCount,
      totalDeviceCount: devices.length,
      capabilities: local.capabilities,
    }
  }

  private inferUserActivity(activeWindow: string, foregroundApp: string | undefined, summary: string): string {
    const joined = `${activeWindow} ${foregroundApp || ''} ${summary}`.toLowerCase()
    if (/(youtube|video|premiere|capcut|resolve|editor)/.test(joined)) return 'content_creation'
    if (/(github|vscode|terminal|build|debug|code)/.test(joined)) return 'development'
    if (/(browser|research|search|read|docs)/.test(joined)) return 'researching_topic'
    if (/(mail|message|whatsapp|slack|teams)/.test(joined)) return 'communication'
    return 'general_computing'
  }

  private inferCalendarSignals(summary: string): string[] {
    const lower = summary.toLowerCase()
    const markers: string[] = []
    if (/(meeting|standup|appointment|calendar)/.test(lower)) markers.push('possible_meeting_context')
    if (/(deadline|due|tomorrow|tonight)/.test(lower)) markers.push('upcoming_deadline_context')
    return markers
  }
}

export const contextAwarenessEngine = new ContextAwarenessEngine()
