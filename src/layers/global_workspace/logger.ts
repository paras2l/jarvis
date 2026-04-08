export interface WorkspaceLogEntry {
  id: string
  timestamp: number
  event: string
  source: string
  level: 'info' | 'warn' | 'error'
  data?: Record<string, unknown>
}

export class WorkspaceLogger {
  private entries: WorkspaceLogEntry[] = []
  private readonly maxEntries = 1000

  info(event: string, source: string, data?: Record<string, unknown>): void {
    this.append('info', event, source, data)
  }

  warn(event: string, source: string, data?: Record<string, unknown>): void {
    this.append('warn', event, source, data)
  }

  error(event: string, source: string, data?: Record<string, unknown>): void {
    this.append('error', event, source, data)
  }

  recent(limit = 100): WorkspaceLogEntry[] {
    return this.entries.slice(-Math.max(1, limit))
  }

  private append(
    level: WorkspaceLogEntry['level'],
    event: string,
    source: string,
    data?: Record<string, unknown>,
  ): void {
    this.entries.push({
      id: `gwl_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      event,
      source,
      level,
      data,
    })

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }
}

export const workspaceLogger = new WorkspaceLogger()
