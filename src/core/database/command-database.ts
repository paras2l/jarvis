/**
 * Cross-Device Command Database - Extensible Command Storage
 * 
 * Abstraction layer over storage backends:
 * - Web: IndexedDB (efficient for offline)
 * - Mobile: Local Storage or IndexedDB (Cordova can bridge to native SQLite)
 * - Desktop: Electron SQLite bridge (fast, native)
 * 
 * Users can add custom commands via UI without coding.
 */

export interface Command {
  id: string
  name: string
  pattern: string // Regex or simple string match
  action: string // Function name or URI
  description: string
  enabled: boolean
  createdAt: number
  updatedAt: number
  metadata?: Record<string, unknown>
}

export interface CommandResult {
  found: boolean
  command?: Command
  matchConfidence?: number
}

export interface DatabaseConfig {
  platform: 'web' | 'mobile' | 'desktop'
  userId: string
  dbName?: string
}

class CommandDatabase {
  private config: DatabaseConfig | null = null
  private commands = new Map<string, Command>()
  private db: IDBDatabase | null = null
  private isInitialized = false

  /**
   * Initialize database (platform-aware)
   */
  async initialize(config: DatabaseConfig): Promise<boolean> {
    this.config = config

    try {
      switch (config.platform) {
        case 'web':
          return await this.initWeb()
        case 'mobile':
          return await this.initMobile()
        case 'desktop':
          return await this.initDesktop()
        default:
          return false
      }
    } catch (error) {
      console.error('[CommandDB] Initialize failed:', error)
      return false
    }
  }

  /**
   * Add custom command (user-extensible)
   */
  async addCommand(command: Omit<Command, 'id' | 'createdAt' | 'updatedAt'>): Promise<Command> {
    const now = Date.now()
    const newCommand: Command = {
      id: `cmd_${now}_${Math.random().toString(36).substr(2, 9)}`,
      ...command,
      createdAt: now,
      updatedAt: now,
    }

    this.commands.set(newCommand.id, newCommand)
    await this.persist('add', newCommand)

    return newCommand
  }

  /**
   * Update existing command
   */
  async updateCommand(id: string, updates: Partial<Command>): Promise<Command | null> {
    const existing = this.commands.get(id)
    if (!existing) return null

    const updated: Command = {
      ...existing,
      ...updates,
      id: existing.id, // Don't allow ID change
      createdAt: existing.createdAt, // Don't allow creation date change
      updatedAt: Date.now(),
    }

    this.commands.set(id, updated)
    await this.persist('update', updated)

    return updated
  }

  /**
   * Delete command
   */
  async deleteCommand(id: string): Promise<boolean> {
    const command = this.commands.get(id)
    if (!command) return false

    this.commands.delete(id)
    await this.persist('delete', command)

    return true
  }

  /**
   * Get all commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values())
  }

  /**
   * Get enabled commands only
   */
  getEnabled(): Command[] {
    return this.getAll().filter(cmd => cmd.enabled)
  }

  /**
   * Find command by name
   */
  findByName(name: string): Command | null {
    const lower = name.toLowerCase()
    for (const cmd of this.commands.values()) {
      if (cmd.name.toLowerCase() === lower) return cmd
      if (cmd.enabled && cmd.pattern.toLowerCase().includes(lower)) return cmd
    }
    return null
  }

  /**
   * Match user input against command patterns
   */
  matchCommand(input: string): CommandResult {
    const lower = input.toLowerCase()

    // Exact name match (highest priority)
    for (const cmd of this.getEnabled()) {
      if (cmd.name.toLowerCase() === lower) {
        return { found: true, command: cmd, matchConfidence: 1.0 }
      }
    }

    // Pattern match (regex or substring)
    let bestMatch: { command: Command; confidence: number } | null = null

    for (const cmd of this.getEnabled()) {
      try {
        // Try regex first
        const regex = new RegExp(cmd.pattern, 'i')
        if (regex.test(lower)) {
          const confidence = this.calculateMatchConfidence(cmd.pattern, lower)
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { command: cmd, confidence }
          }
        }
      } catch {
        // Fallback to substring match
        if (lower.includes(cmd.pattern.toLowerCase())) {
          const confidence = cmd.pattern.length / lower.length
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { command: cmd, confidence }
          }
        }
      }
    }

    if (bestMatch) {
      return { found: true, command: bestMatch.command, matchConfidence: bestMatch.confidence }
    }

    return { found: false }
  }

  /**
   * Suggest commands based on input
   */
  suggestCommands(input: string, limit = 5): Command[] {
    const lower = input.toLowerCase()
    const suggestions: Array<{ command: Command; score: number }> = []

    for (const cmd of this.getEnabled()) {
      let score = 0

      // Name match
      if (cmd.name.toLowerCase().includes(lower)) {
        score += 0.7
      }

      // Pattern match
      if (cmd.pattern.toLowerCase().includes(lower)) {
        score += 0.5
      }

      // Description match
      if (cmd.description.toLowerCase().includes(lower)) {
        score += 0.3
      }

      if (score > 0) {
        suggestions.push({ command: cmd, score })
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.command)
  }

  /**
   * Enable/disable command
   */
  async toggleCommand(id: string, enabled: boolean): Promise<Command | null> {
    return this.updateCommand(id, { enabled })
  }

  /**
   * Export all commands (backup)
   */
  export(): string {
    return JSON.stringify(this.getAll(), null, 2)
  }

  /**
   * Import commands (restore)
   */
  async import(json: string): Promise<number> {
    try {
      const commands = JSON.parse(json) as Command[]
      let count = 0

      for (const cmd of commands) {
        if (cmd.id && cmd.name && cmd.pattern && cmd.action) {
          this.commands.set(cmd.id, cmd)
          await this.persist('add', cmd)
          count++
        }
      }

      return count
    } catch (error) {
      console.error('[CommandDB] Import failed:', error)
      return 0
    }
  }

  /**
   * Get database statistics
   */
  getStats(): { total: number; enabled: number; disabled: number; custom: number } {
    const all = this.getAll()
    const enabled = all.filter(c => c.enabled).length
    const custom = all.filter(c => c.id.startsWith('cmd_')).length

    return {
      total: all.length,
      enabled,
      disabled: all.length - enabled,
      custom,
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Platform-Specific Implementations
  // ─────────────────────────────────────────────────────────────────────

  private async initWeb(): Promise<boolean> {
    try {
      // Initialize IndexedDB
      return new Promise((resolve) => {
        const request = indexedDB.open(this.config?.dbName || 'jarvis-commands', 1)

        request.onerror = () => resolve(false)

        request.onsuccess = () => {
          this.db = request.result
          this.isInitialized = true
          this.loadFromStorage()
          resolve(true)
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('commands')) {
            db.createObjectStore('commands', { keyPath: 'id' })
          }
        }
      })
    } catch (error) {
      console.error('[CommandDB] Web init failed:', error)
      return false
    }
  }

  private async initMobile(): Promise<boolean> {
    // Similar to web, but with mobile optimizations
    return this.initWeb()
  }

  private async initDesktop(): Promise<boolean> {
    try {
      // Initialize Electron SQLite bridge
      const bridge = (window as any).electronBridge
      if (!bridge?.database?.init) {
        console.warn('[CommandDB] Electron bridge not available')
        return false
      }

      await bridge.database.init('commands')
      this.isInitialized = true
      await this.loadFromStorage()
      return true
    } catch (error) {
      console.error('[CommandDB] Desktop init failed:', error)
      return false
    }
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.isInitialized) return

    try {
      if (this.config?.platform === 'desktop') {
        const bridge = (window as any).electronBridge
        const stored = await bridge.database.query('SELECT * FROM commands')
        for (const cmd of stored) {
          this.commands.set(cmd.id, cmd as Command)
        }
      } else {
        // IndexedDB
        return new Promise((resolve) => {
          if (!this.db) {
            resolve()
            return
          }

          const transaction = this.db.transaction(['commands'], 'readonly')
          const store = transaction.objectStore('commands')
          const request = store.getAll()

          request.onsuccess = () => {
            for (const cmd of request.result) {
              this.commands.set(cmd.id, cmd)
            }
            resolve()
          }

          request.onerror = () => resolve()
        })
      }
    } catch (error) {
      console.error('[CommandDB] Load from storage failed:', error)
    }
  }

  private async persist(operation: 'add' | 'update' | 'delete', command: Command): Promise<void> {
    if (!this.isInitialized) return

    try {
      if (this.config?.platform === 'desktop') {
        const bridge = (window as any).electronBridge
        if (operation === 'add' || operation === 'update') {
          await bridge.database.insert('commands', command)
        } else if (operation === 'delete') {
          await bridge.database.delete('commands', command.id)
        }
      } else {
        // IndexedDB
        return new Promise((resolve) => {
          if (!this.db) {
            resolve()
            return
          }

          const transaction = this.db.transaction(['commands'], 'readwrite')
          const store = transaction.objectStore('commands')

          if (operation === 'add' || operation === 'update') {
            store.put(command)
          } else if (operation === 'delete') {
            store.delete(command.id)
          }

          transaction.oncomplete = () => resolve()
          transaction.onerror = () => resolve()
        })
      }
    } catch (error) {
      console.error('[CommandDB] Persist failed:', error)
    }
  }

  private calculateMatchConfidence(pattern: string, input: string): number {
    const patternWords = pattern.split(/\s+/)
    const inputWords = input.split(/\s+/)

    let matches = 0
    for (const word of patternWords) {
      if (inputWords.some(iw => iw.includes(word) || word.includes(iw))) {
        matches++
      }
    }

    return matches / Math.max(patternWords.length, 1)
  }
}

export const commandDatabase = new CommandDatabase()
