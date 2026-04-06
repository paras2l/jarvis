import { intelligenceRouter } from '../intelligence-router'
import { localVoiceRuntime } from '../media-ml/runtimes/local-voice-runtime'
import { notificationEngine } from '../notification-engine'
import { moodEngine } from './mood-engine'
import { db, NotificationRecord } from '../../lib/db'
import { protocolRegistry } from '../protocols/ProtocolRegistry'

/**
 * JARVIS Notification Bridge (Phase 9)
 * ============================================
 * Translates raw, boring device alerts into
 * witty, humanoid partner updates.
 */
class NotificationBridge {
  private isListening = false
  private allowVoiceAnnouncements = true

  start() {
    if (this.isListening) return
    this.isListening = true
    console.log('📬 [Notification Bridge] Listening for global alerts (Phase 9)')
    void this.bootstrapSettings()
    
    // In a real device environment, this would hook into:
    // 1. Electron's native notification sync
    // 2. Supabase Realtime 'notifications' table
    // 3. Webhook listener for Phone/Tablet alerts
    
    // Realtime sink from Supabase notifications table
    db.notifications.subscribe((notification) => {
      void this.processStoredNotification(notification)
    })

    // Local app/device ingestion path
    window.addEventListener('device:notification', ((e: CustomEvent) => {
      void this.handleIncomingNotification(e.detail)
    }) as EventListener)
  }

  private async bootstrapSettings() {
    const settings = await db.settings.get()
    if (typeof settings?.voice_announcements === 'boolean') {
      this.allowVoiceAnnouncements = settings.voice_announcements
    }
  }

  /**
   * Translates raw message -> Witty Partner Summary
   */
  private async handleIncomingNotification(data: {
    app: string
    sender: string
    content: string
    importance: 'info' | 'high' | 'critical'
  }) {
    const persisted = await db.notifications.ingest({
      app_name: data.app,
      sender: data.sender,
      content: data.content,
      importance: data.importance,
      source_device: 'desktop',
      metadata: { origin: 'device-event' },
    })

    if (persisted) {
      // Let the realtime subscriber process this insert to keep one code path.
      return
    }

    const fallback: NotificationRecord = {
      app_name: data.app,
      sender: data.sender,
      content: data.content,
      importance: data.importance,
    }
    await this.processStoredNotification(fallback)
  }

  private async processStoredNotification(data: NotificationRecord) {
    const importance = data.importance ?? 'info'
    const appName = data.app_name
    const sender = data.sender ?? 'Someone'
    const content = data.content

    const shouldDeliver = await db.notifications.shouldDeliver(appName, importance)
    if (!shouldDeliver) {
      console.log(`[Bridge] Quiet-app rule muted ${appName}.`)
      // Still record in GhostWriter for audit trail
      await this.invokeGhostWriter('notification_muted', { app: appName, sender, reason: 'quiet_app_rule' })
      return
    }

    const energy = moodEngine.getEnergy()
    const mood = moodEngine.getMood()

    // 1. Skip if user is in 'Deep Focus' and it's not critical
    if (mood === 'focused' && energy > 4 && importance !== 'critical') {
      console.log(`[Bridge] Filtering notification from ${appName} due to Focus Mode.`)
      await this.invokeGhostWriter('notification_filtered', { app: appName, sender, reason: 'focus_mode' })
      return
    }

    // 2. Summarize the content using the Brain
    console.log(`[Bridge] Translating message from ${sender} (${appName})...`)
    const summary = await intelligenceRouter.summarize(content, 15)

    // 3. Mimic Protocol: Adapt tone to user's current context
    let announcement = `${sender} just messaged on ${appName}. Basically, they said: ${summary}`
    try {
      const mimicResult = await protocolRegistry.executeAction('intelligence.mimic', 'adapt_tone', {
        originalText: announcement,
        targetMood: mood,
        targetEnergy: energy
      })
      if (mimicResult.success && mimicResult.data?.adaptedText) {
        announcement = mimicResult.data.adaptedText
        console.log('[Bridge] Tone adapted via Mimic protocol')
      }
    } catch (err) {
      console.log('[Bridge] Mimic protocol skipped, using original tone')
    }
    
    notificationEngine.notify(`JARVIS: Notification from ${sender}`, announcement)
    if (this.allowVoiceAnnouncements) {
      localVoiceRuntime.speak(announcement)
    }

    if (data.id) {
      await db.notifications.markAnnounced(data.id, summary)
    }

    // 4. GhostWriter Protocol: Record this notification event for audit trail
    await this.invokeGhostWriter('notification_delivered', { app: appName, sender, importance, summary })
  }

  /**
   * GhostWriter Protocol: Record notification event in immutable audit trail
   */
  private async invokeGhostWriter(eventType: string, context: Record<string, any>) {
    try {
      await protocolRegistry.executeAction('intelligence.ghost_writer', 'capture_delta', {
        context: eventType,
        metadata: context
      })
    } catch (err) {
      console.log('[Bridge] GhostWriter protocol skipped')
    }
  }

  /**
   * SIMULATION: Use this to test the "Humanoid Response"
   */
  simulate(app: string, sender: string, content: string) {
    window.dispatchEvent(new CustomEvent('device:notification', {
      detail: { app, sender, content, importance: 'info' }
    }))
  }
}

export const notificationBridge = new NotificationBridge()
