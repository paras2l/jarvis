/**
 * Scheduler — Feature #12
 *
 * Cron-style scheduled operations + Morning Digest.
 * Inspired by OpenJarvis's morning-digest and scheduled-ops presets.
 * Re-built as a pure TypeScript/Electron service — zero dependencies.
 *
 * The agent can now:
 *   - Wake up every morning and brief you on the day's tasks
 *   - Monitor folders/URLs for changes
 *   - Run any task on a time schedule (daily, hourly, on startup)
 *   - Spawn sub-agents via A2A to handle each scheduled job
 *
 * Schedule format (Simple cron-like):
 *   "@startup"           → runs once when app starts
 *   "@daily 08:00"       → every day at 8am
 *   "@hourly"            → every hour
 *   "@interval 30m"      → every 30 minutes
 *   "@interval 1h"       → every 1 hour
 */

import { a2a } from './a2a-protocol'
import { intelligenceRouter } from './intelligence-router'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ScheduledJob {
  id: string
  name: string
  schedule: string
  task: string           // command to send to agent-engine
  lastRun?: Date
  nextRun?: Date
  enabled: boolean
  runCount: number
}

export interface DigestConfig {
  enabled: boolean
  time: string           // "08:00"
  includeWeather: boolean
  includeCalendar: boolean
  includeNews: boolean
  speak: boolean         // use TTS to read aloud
}

// ── Scheduler ─────────────────────────────────────────────────────────────

class AgentScheduler {
  private jobs = new Map<string, ScheduledJob>()
  private timers = new Map<string, ReturnType<typeof setInterval>>()
  private digestConfig: DigestConfig = {
    enabled: false,
    time: '08:00',
    includeWeather: true,
    includeCalendar: true,
    includeNews: true,
    speak: false,
  }

  private onTaskCallback: ((task: string) => void) | null = null

  constructor() {
    this.loadFromStorage()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register a scheduled job.
   */
  add(job: Omit<ScheduledJob, 'runCount' | 'enabled'> & { enabled?: boolean }): string {
    const id = job.id || `job_${Date.now()}`
    const full: ScheduledJob = { ...job, id, enabled: job.enabled !== false, runCount: 0 }
    this.jobs.set(id, full)
    this.schedule(full)
    this.save()
    console.log(`[Scheduler] ✅ Added: ${job.name} (${job.schedule})`)
    return id
  }

  /**
   * Remove a scheduled job.
   */
  remove(id: string): void {
    const timer = this.timers.get(id)
    if (timer) { clearInterval(timer); this.timers.delete(id) }
    this.jobs.delete(id)
    this.save()
  }

  /**
   * Enable/disable a job without removing it.
   */
  toggle(id: string, enabled: boolean): void {
    const job = this.jobs.get(id)
    if (!job) return
    job.enabled = enabled
    if (!enabled) {
      const timer = this.timers.get(id)
      if (timer) { clearInterval(timer); this.timers.delete(id) }
    } else {
      this.schedule(job)
    }
    this.save()
  }

  /**
   * Run a job immediately (ignoring schedule).
   */
  async runNow(id: string): Promise<void> {
    const job = this.jobs.get(id)
    if (!job) return
    await this.executeJob(job)
  }

  /**
   * Configure and enable the Morning Digest.
   */
  configureMorningDigest(config: Partial<DigestConfig>): void {
    this.digestConfig = { ...this.digestConfig, ...config }
    localStorage.setItem('digestConfig', JSON.stringify(this.digestConfig))

    // Remove old digest job
    const existingId = Array.from(this.jobs.values()).find(j => j.name === 'Morning Digest')?.id
    if (existingId) this.remove(existingId)

    if (this.digestConfig.enabled) {
      this.add({
        id: 'morning-digest',
        name: 'Morning Digest',
        schedule: `@daily ${this.digestConfig.time}`,
        task: 'digest:morning',
      })
    }
  }

  /**
   * Generate + deliver the morning digest NOW.
   */
  async deliverMorningDigest(): Promise<string> {
    console.log('[Scheduler] 🌅 Generating Morning Digest...')

    const sections: string[] = []
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    sections.push(`🌅 Good morning! Today is ${today}.`)

    // Ask LLM for a motivational opening
    const opening = await intelligenceRouter.query(
      `Give a brief (1 sentence) energizing morning motivation for a productive AI-powered workday.`,
      { urgency: 'background' }
    )
    sections.push(opening.content)

    // Pending tasks (from localStorage)
    const tasks = this.getPendingTasks()
    if (tasks.length > 0) {
      sections.push(`\n📋 You have ${tasks.length} pending tasks today.`)
    }

    // Current learning status
    sections.push('\n🧠 Your agent is fully armed and ready. Say "Hey JARVIS" to begin.')

    const digest = sections.join(' ')

    // Trigger TTS if configured
    if (this.digestConfig.speak && this.onTaskCallback) {
      this.onTaskCallback(`speak:${digest}`)
    }

    return digest
  }

  /**
   * Add a file watcher job — agent notifies when folder changes.
   */
  watchFolder(folderPath: string, intervalMinutes = 5): string {
    return this.add({
      id: `watch_${Date.now()}`,
      name: `Watch: ${folderPath}`,
      schedule: `@interval ${intervalMinutes}m`,
      task: `monitor:folder:${folderPath}`,
    })
  }

  listJobs(): ScheduledJob[] {
    return Array.from(this.jobs.values())
  }

  setTaskCallback(cb: (task: string) => void): void {
    this.onTaskCallback = cb
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private schedule(job: ScheduledJob): void {
    if (!job.enabled) return

    const intervalMs = this.parseSchedule(job.schedule)
    if (intervalMs === null) return

    // First run timing
    const isStartup = job.schedule === '@startup'
    const delay = isStartup ? 2000 : this.calcNextRunDelay(job.schedule)

    const runAndReschedule = async () => {
      await this.executeJob(job)
      if (!isStartup) {
        const next = this.calcNextRunDelay(job.schedule)
        const timer = setTimeout(runAndReschedule, next)
        this.timers.set(job.id, timer as unknown as ReturnType<typeof setInterval>)
      }
    }

    const timer = setTimeout(runAndReschedule, delay)
    this.timers.set(job.id, timer as unknown as ReturnType<typeof setInterval>)

    job.nextRun = new Date(Date.now() + delay)
  }

  private async executeJob(job: ScheduledJob): Promise<void> {
    console.log(`[Scheduler] ▶ Running: ${job.name}`)
    job.lastRun = new Date()
    job.runCount++

    // Special handling for built-in digest
    if (job.task === 'digest:morning') {
      const digest = await this.deliverMorningDigest()
      console.log('[Scheduler] Digest:', digest.slice(0, 100))
      return
    }

    // Dispatch to agent via A2A or callback
    if (this.onTaskCallback) {
      this.onTaskCallback(job.task)
    } else {
      // Use A2A broadcast to orchestrator
      await a2a.send('scheduler', 'orchestrator', { task: job.task, source: 'scheduler' })
    }

    this.save()
  }

  private parseSchedule(schedule: string): number | null {
    if (schedule === '@startup') return 0
    if (schedule === '@hourly') return 60 * 60 * 1000
    if (schedule.startsWith('@interval')) {
      const m = schedule.match(/(\d+)(m|h|d)/)
      if (!m) return null
      const val = parseInt(m[1])
      const unit = m[2]
      if (unit === 'm') return val * 60_000
      if (unit === 'h') return val * 3_600_000
      if (unit === 'd') return val * 86_400_000
    }
    if (schedule.startsWith('@daily')) return 24 * 60 * 60 * 1000
    return null
  }

  private calcNextRunDelay(schedule: string): number {
    if (schedule.startsWith('@daily')) {
      // Parse time like "08:00"
      const timeMatch = schedule.match(/(\d+):(\d+)/)
      if (timeMatch) {
        const [h, min] = [parseInt(timeMatch[1]), parseInt(timeMatch[2])]
        const now = new Date()
        const target = new Date()
        target.setHours(h, min, 0, 0)
        if (target <= now) target.setDate(target.getDate() + 1)
        return target.getTime() - now.getTime()
      }
    }
    return this.parseSchedule(schedule) ?? 3_600_000
  }

  private getPendingTasks(): string[] {
    try {
      return JSON.parse(localStorage.getItem('pendingTasks') ?? '[]')
    } catch { return [] }
  }

  private save(): void {
    const data = Array.from(this.jobs.values())
    localStorage.setItem('scheduledJobs', JSON.stringify(data))
  }

  private loadFromStorage(): void {
    try {
      const stored = JSON.parse(localStorage.getItem('scheduledJobs') ?? '[]') as ScheduledJob[]
      for (const job of stored) {
        this.jobs.set(job.id, { ...job, runCount: job.runCount ?? 0 })
        this.schedule(job)
      }

      const digestCfg = localStorage.getItem('digestConfig')
      if (digestCfg) this.digestConfig = { ...this.digestConfig, ...JSON.parse(digestCfg) }

      console.log(`[Scheduler] Loaded ${stored.length} scheduled jobs`)
    } catch { /* silent */ }

    // Always register startup ping
    this.add({
      id: 'startup-ping',
      name: 'Startup Health Check',
      schedule: '@startup',
      task: 'system:health-check',
    })
  }
}

export const agentScheduler = new AgentScheduler()
