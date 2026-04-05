import { AuditEntry } from './types'

const STORAGE_KEY = 'test-model.audit-log'
const MAX_ENTRIES = 500

class AuditLog {
  private entries: AuditEntry[] = []

  constructor() {
    this.entries = this.load()
  }

  private load(): AuditEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries.slice(-MAX_ENTRIES)))
  }

  append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const fullEntry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    }

    this.entries.push(fullEntry)
    this.save()
    return fullEntry
  }

  getRecent(limit = 50): AuditEntry[] {
    return this.entries.slice(-limit)
  }
}

export const auditLog = new AuditLog()
