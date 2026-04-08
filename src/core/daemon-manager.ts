/**
 * Daemon Manager — Feature C-4 (OpenClaw: Always-On Persistent Agent)
 *
 * Makes the agent run as a persistent background service.
 * Inspired by OpenClaw's daemon architecture — rebuilt for Electron/Windows.
 *
 * What "daemon mode" gives you:
 *   - Agent runs 24/7, even when the app window is CLOSED
 *   - Monitors system resources, processes scheduled tasks, watches for events
 *   - Can be woken by voice commands, webhooks, or scheduled triggers
 *   - Shows in system tray; indicator light shows agent is alive
 *   - Restarts automatically if the app crashes
 *
 * How it works in Electron:
 *   - Main process stays alive even when browser window is closed
 *   - System tray icon indicates alive/busy/sleeping states
 *   - Renderer registers "wake callbacks" that Main triggers remotely
 *   - Heartbeat every 30s proves agent is still running
 *
 * All orchestration is via nativeBridge.daemon.* IPC channels.
 */

import { agentScheduler } from './scheduler'
import { soulEngine } from './soul-engine'
import { localLLM } from './local-llm'
import { autonomousRuntime } from './autonomous-runtime'

// ── Types ──────────────────────────────────────────────────────────────────

export type DaemonStatus = 'running' | 'sleeping' | 'busy' | 'paused' | 'stopped'

export interface DaemonState {
  status: DaemonStatus
  uptimeMs: number
  startedAt: number
  tasksCompleted: number
  lastHeartbeat: number
  activeJobs: string[]
  cpuPercent: number
  memoryMB: number
}

export interface DaemonEvent {
  type: 'wake' | 'sleep' | 'task' | 'error' | 'heartbeat' | 'webhook'
  timestamp: number
  data?: unknown
}

// ── DaemonManager ─────────────────────────────────────────────────────────

class DaemonManager {
  private status: DaemonStatus = 'stopped'
  private startedAt = 0
  private tasksCompleted = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private wakeCallbacks: Array<(event: DaemonEvent) => Promise<void>> = []
  private eventLog: DaemonEvent[] = []
  private readonly MAX_LOG = 100

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the daemon. Called once at app startup.
   * The agent stays alive even if the window is hidden.
   */
  async start(): Promise<void> {
    if (this.status !== 'stopped') return

    this.startedAt = Date.now()
    this.status = 'running'

    // Tell Electron main process to keep alive
    await window.nativeBridge?.daemon?.start?.()

    // Load SOUL.md
    await soulEngine.load()

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 30_000)

    // Wire scheduler to daemon loop
    agentScheduler.setTaskCallback(async (task) => {
      this.logEvent({ type: 'task', timestamp: Date.now(), data: task })
      this.tasksCompleted++
    })

    // Start autonomous cognitive runtime under daemon supervision.
    await autonomousRuntime.start()

    console.log('[Daemon] 🟢 Started — agent is now always-on')
    this.logEvent({ type: 'wake', timestamp: Date.now() })
  }

  /**
   * Pause the daemon (stop responding but keep running).
   * Good for "do not disturb" mode.
   */
  pause(): void {
    this.status = 'paused'
    window.nativeBridge?.daemon?.setStatus?.('paused')
    console.log('[Daemon] ⏸ Paused')
  }

  /**
   * Resume from paused state.
   */
  resume(): void {
    this.status = 'running'
    window.nativeBridge?.daemon?.setStatus?.('running')
    console.log('[Daemon] ▶ Resumed')
  }

  /**
   * Gracefully stop the daemon.
   */
  async stop(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    this.status = 'stopped'
    await autonomousRuntime.stop()
    await window.nativeBridge?.daemon?.stop?.()
    this.logEvent({ type: 'sleep', timestamp: Date.now() })
    console.log('[Daemon] 🔴 Stopped')
  }

  /**
   * Register a callback to be called when daemon is woken by an external event.
   * e.g. webhook, cron trigger, voice wake word
   */
  onWake(callback: (event: DaemonEvent) => Promise<void>): void {
    this.wakeCallbacks.push(callback)
  }

  /**
   * Trigger all wake callbacks. Called when an external event arrives.
   */
  async wake(event: DaemonEvent): Promise<void> {
    if (this.status === 'paused') return

    this.status = 'busy'
    window.nativeBridge?.daemon?.setStatus?.('busy')
    this.logEvent(event)

    try {
      await Promise.allSettled(this.wakeCallbacks.map(cb => cb(event)))
    } finally {
      this.status = 'running'
      window.nativeBridge?.daemon?.setStatus?.('running')
    }
  }

  /**
   * Get current daemon state for the status panel.
   */
  getState(): DaemonState {
    return {
      status: this.status,
      uptimeMs: this.startedAt ? Date.now() - this.startedAt : 0,
      startedAt: this.startedAt,
      tasksCompleted: this.tasksCompleted,
      lastHeartbeat: this.eventLog.filter(e => e.type === 'heartbeat').slice(-1)[0]?.timestamp ?? 0,
      activeJobs: agentScheduler.listJobs().filter(j => j.enabled).map(j => j.name),
      cpuPercent: 0,   // populated by main process telemetry
      memoryMB: 0,
    }
  }

  /**
   * Get recent event log.
   */
  getEventLog(limit = 20): DaemonEvent[] {
    return this.eventLog.slice(-limit)
  }

  /**
   * Show whether the daemon is alive and healthy.
   */
  isAlive(): boolean {
    return this.status === 'running' || this.status === 'busy'
  }

  /**
   * Get a human-readable uptime string.
   */
  getUptimeString(): string {
    const ms = this.startedAt ? Date.now() - this.startedAt : 0
    const h = Math.floor(ms / 3_600_000)
    const m = Math.floor((ms % 3_600_000) / 60_000)
    const s = Math.floor((ms % 60_000) / 1_000)
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }

  /**
   * Configure the auto-start behavior (start with Windows).
   */
  async setAutoStart(enabled: boolean): Promise<void> {
    await window.nativeBridge?.daemon?.setAutoStart?.(enabled)
    console.log(`[Daemon] Auto-start: ${enabled ? 'ON' : 'OFF'}`)
  }

  // ── Private ───────────────────────────────────────────────────────────

  private heartbeat(): void {
    const event: DaemonEvent = { type: 'heartbeat', timestamp: Date.now() }
    this.logEvent(event)

    // Check local LLM is healthy
    localLLM.checkHealth().then(h => {
      if (!h.online) {
        console.log('[Daemon] ⚡ Local LLM offline — running in cloud mode')
      }
    })

    // Sync tray icon state
    window.nativeBridge?.daemon?.heartbeat?.({
      status: this.status,
      uptime: this.getUptimeString(),
      tasksCompleted: this.tasksCompleted,
    })
  }

  private logEvent(event: DaemonEvent): void {
    this.eventLog.push(event)
    if (this.eventLog.length > this.MAX_LOG) {
      this.eventLog.shift()
    }
  }
}

export const daemonManager = new DaemonManager()
