import { agentScheduler } from '@/core/scheduler'
import { runtimeEventBus } from '@/core/event-bus'

const DAILY_BRIEF_TIME_KEY = 'patrich.brief.daily.time'
const ONE_TIME_BRIEF_AT_KEY = 'patrich.brief.once.at'

export interface RuntimeScheduledTask {
  id: string
  title: string
  command: string
  runAt: number
}

class TaskScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  private oneTimeTimer: ReturnType<typeof setTimeout> | null = null

  schedule(task: RuntimeScheduledTask): string {
    const delay = Math.max(0, task.runAt - Date.now())
    const timer = setTimeout(() => {
      void runtimeEventBus.emit('task.scheduled', {
        id: task.id,
        title: task.title,
        runAt: task.runAt,
      })
      this.timers.delete(task.id)
    }, delay)

    this.timers.set(task.id, timer)
    return task.id
  }

  cancel(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (!timer) return
    clearTimeout(timer)
    this.timers.delete(taskId)
  }

  setupMorningBriefing(hourLocal?: string): void {
    const selectedTime = hourLocal || this.getDailyBriefingTime() || '08:00'
    if (hourLocal) {
      localStorage.setItem(DAILY_BRIEF_TIME_KEY, selectedTime)
    }

    agentScheduler.configureMorningDigest({
      enabled: true,
      time: selectedTime,
      includeCalendar: true,
      includeNews: true,
      includeWeather: true,
      speak: true,
    })

    this.bootstrapOneTimeBriefing()
  }

  setDailyBriefingTime(hourLocal: string): { success: boolean; message: string } {
    const normalized = this.normalizeTime(hourLocal)
    if (!normalized) {
      return { success: false, message: 'Invalid time. Use format like 09:00, 9am, or 9:30 pm.' }
    }

    localStorage.setItem(DAILY_BRIEF_TIME_KEY, normalized)
    this.setupMorningBriefing(normalized)
    return { success: true, message: `Daily briefing updated to ${normalized}.` }
  }

  getDailyBriefingTime(): string | null {
    const saved = localStorage.getItem(DAILY_BRIEF_TIME_KEY)
    return saved && this.normalizeTime(saved) ? this.normalizeTime(saved)! : null
  }

  scheduleOneTimeBriefing(runAt: Date): { success: boolean; message: string } {
    const ts = runAt.getTime()
    if (!Number.isFinite(ts) || ts <= Date.now()) {
      return { success: false, message: 'One-time briefing must be scheduled for a future time.' }
    }

    localStorage.setItem(ONE_TIME_BRIEF_AT_KEY, new Date(ts).toISOString())
    this.bootstrapOneTimeBriefing()
    return {
      success: true,
      message: `One-time briefing scheduled for ${new Date(ts).toLocaleString()}.`,
    }
  }

  clearOneTimeBriefing(): { success: boolean; message: string } {
    if (this.oneTimeTimer) {
      clearTimeout(this.oneTimeTimer)
      this.oneTimeTimer = null
    }
    localStorage.removeItem(ONE_TIME_BRIEF_AT_KEY)
    return { success: true, message: 'Cleared pending one-time briefing schedule.' }
  }

  private bootstrapOneTimeBriefing(): void {
    if (this.oneTimeTimer) {
      clearTimeout(this.oneTimeTimer)
      this.oneTimeTimer = null
    }

    const raw = localStorage.getItem(ONE_TIME_BRIEF_AT_KEY)
    if (!raw) return

    const runAt = new Date(raw)
    const delay = runAt.getTime() - Date.now()
    if (!Number.isFinite(delay) || delay <= 0) {
      localStorage.removeItem(ONE_TIME_BRIEF_AT_KEY)
      return
    }

    this.oneTimeTimer = setTimeout(() => {
      this.oneTimeTimer = null
      localStorage.removeItem(ONE_TIME_BRIEF_AT_KEY)
      void agentScheduler.deliverMorningDigest()
    }, delay)
  }

  private normalizeTime(input: string): string | null {
    const text = String(input || '').trim().toLowerCase()
    if (!text) return null

    const ampmMatch = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
    if (ampmMatch) {
      let hour = Number(ampmMatch[1])
      const minute = Number(ampmMatch[2] || '0')
      const meridiem = ampmMatch[3].toLowerCase()
      if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
      if (meridiem === 'am') {
        if (hour === 12) hour = 0
      } else if (hour !== 12) {
        hour += 12
      }
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }

    const hhmmMatch = text.match(/^(\d{1,2}):(\d{2})$/)
    if (!hhmmMatch) return null

    const hour = Number(hhmmMatch[1])
    const minute = Number(hhmmMatch[2])
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
}

export const taskScheduler = new TaskScheduler()
