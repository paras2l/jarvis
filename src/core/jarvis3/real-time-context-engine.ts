import { RuntimeContextSnapshot } from '@/core/event-bus'
import { JarvisContextModel } from './types'

class RealTimeContextEngine {
  build(snapshot: RuntimeContextSnapshot): JarvisContextModel {
    const pendingCount = snapshot.pendingNotifications?.length || 0
    const urgency = pendingCount > 3
      ? 'high'
      : pendingCount > 0
        ? 'medium'
        : 'low'

    return {
      observedAt: snapshot.timestamp,
      currentApplication: snapshot.foregroundApp || 'unknown',
      activeApplications: snapshot.activeApplications || [],
      userActivity: snapshot.userActivity || 'general_computing',
      timeOfDay: snapshot.timeOfDay,
      systemBusy: snapshot.systemBusy,
      pendingNotificationCount: pendingCount,
      calendarSignals: snapshot.calendarSignals || [],
      lastUserCommand: snapshot.lastUserCommand,
      deviceState: snapshot.deviceState,
      contextUrgency: urgency,
      contextSummary: this.buildSummary(snapshot, pendingCount),
    }
  }

  inferGoals(context: JarvisContextModel): string[] {
    const goals: string[] = []

    if (context.pendingNotificationCount > 0) {
      goals.push('Summarize pending notifications and highlight only important items')
    }

    if (context.userActivity === 'researching_topic' && context.timeOfDay !== 'night') {
      goals.push('Generate a concise research digest and next action checklist')
    }

    if (context.userActivity === 'development' && context.contextUrgency !== 'high') {
      goals.push('Prepare development checkpoint summary with current priorities and blockers')
    }

    if (context.calendarSignals.length > 0) {
      goals.push('Create a short preparation brief for upcoming calendar-related commitments')
    }

    if (!goals.length) {
      goals.push('Maintain passive observation and wait for explicit user goals')
    }

    return goals
  }

  private buildSummary(snapshot: RuntimeContextSnapshot, pendingCount: number): string {
    return [
      `App: ${snapshot.foregroundApp || 'unknown'}`,
      `Window: ${snapshot.activeWindowTitle || 'unknown'}`,
      `Time: ${snapshot.timeOfDay}`,
      `Busy: ${snapshot.systemBusy ? 'yes' : 'no'}`,
      `Pending notifications: ${pendingCount}`,
    ].join(' | ')
  }
}

export const realTimeContextEngine = new RealTimeContextEngine()
