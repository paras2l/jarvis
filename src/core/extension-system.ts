/**
 * Extension System — Feature #4
 *
 * Hot-loadable skill packs. Inspired by JARVIS-MARK5's extension architecture.
 * Re-designed for our TypeScript/Electron app.
 *
 * How it works:
 *   - Drop a folder into userData/extensions/
 *   - Each extension has: manifest.json + handler code
 *   - The system auto-discovers, validates, and registers extensions
 *   - Extensions get routed from agent-engine transparently
 *   - All 12 new features are internally extensions too
 *
 * manifest.json format:
 * {
 *   "id": "blender-control",
 *   "name": "Blender Controller",
 *   "version": "1.0.0",
 *   "commands": ["blender:", "render:", "model:"],
 *   "wakeWords": ["hey blender", "open blender"],
 *   "description": "Controls Blender via automation"
 * }
 */

import { a2a } from './a2a-protocol'
import { policyGateway } from './policy/PolicyGateway'
import { hardcodeProtocol } from './protocols/HardcodeProtocol'

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description: string
  commands: string[]        // command prefixes this extension handles
  wakeWords?: string[]      // optional voice triggers
  enabled: boolean
  author?: string
  icon?: string
  integrity?: string
  actionsFile?: string
}

export interface Extension {
  manifest: ExtensionManifest
  handle: (command: string, args: string) => Promise<string>
}

export interface ExtensionResult {
  handled: boolean
  extensionId?: string
  output?: string
  error?: string
}

// ── ExtensionSystem ───────────────────────────────────────────────────────

class ExtensionSystem {
  private extensions = new Map<string, Extension>()
  private commandIndex = new Map<string, string>()  // prefix → extension ID
  private wakeWordIndex = new Map<string, string>()  // wake word → extension ID

  // ── Registration ─────────────────────────────────────────────────────

  /**
   * Register an extension programmatically (used internally for built-in features).
   */
  register(extension: Extension): void {
    const { manifest } = extension

    if (!manifest.enabled) {
      console.log(`[Extensions] Skipping disabled: ${manifest.id}`)
      return
    }

    this.extensions.set(manifest.id, extension)

    // Index commands
    for (const cmd of manifest.commands) {
      this.commandIndex.set(cmd.toLowerCase(), manifest.id)
    }

    // Index wake words
    for (const ww of manifest.wakeWords ?? []) {
      this.wakeWordIndex.set(ww.toLowerCase(), manifest.id)
    }

    // Register as A2A agent
    a2a.register(`ext:${manifest.id}`, async (msg) => {
      try {
        const output = await extension.handle(
          String(msg.payload.command ?? ''),
          String(msg.payload.args ?? '')
        )
        return { messageId: msg.id, from: `ext:${manifest.id}`, success: true, data: output, latencyMs: 0 }
      } catch (err) {
        return {
          messageId: msg.id,
          from: `ext:${manifest.id}`,
          success: false,
          error: String(err),
          latencyMs: 0,
        }
      }
    })

    console.log(`[Extensions] ✅ Loaded: ${manifest.name} (${manifest.commands.join(', ')})`)
  }

  /**
   * Auto-discover and load extensions from userData/extensions/ directory.
   * Called on startup by electron main process.
   */
  async loadFromDisk(): Promise<number> {
    if (!window.nativeBridge?.listExtensions) return 0

    try {
      const result = await window.nativeBridge.listExtensions()
      if (!result.success) return 0

      let loaded = 0
      for (const extPath of result.extensions ?? []) {
        if (await this.loadExtensionFromPath(extPath)) loaded++
      }
      return loaded
    } catch (err) {
      console.error('[Extensions] Error loading from disk:', err)
      return 0
    }
  }

  // ── Command Routing ───────────────────────────────────────────────────

  /**
   * Try to route a command to an extension. Returns handled=false if no match.
   */
  async route(fullCommand: string): Promise<ExtensionResult> {
    const lower = fullCommand.toLowerCase()

    // Try command prefix match
    for (const [prefix, extId] of this.commandIndex.entries()) {
      if (lower.startsWith(prefix)) {
        const ext = this.extensions.get(extId)
        if (!ext) continue

        const args = fullCommand.slice(prefix.length).trim()
        try {
          const decision = await policyGateway.decide({
            requestId: `ext_${extId}_${Date.now()}`,
            agentId: `ext:${extId}`,
            action: 'extension_command',
            command: `${prefix} ${args}`,
            source: 'local',
            explicitPermission: true,
            requestedPrivileges: ['extension_exec'],
            riskScore: 0.45,
            occurredAt: Date.now(),
            policyPack: policyGateway.getPolicyPack(),
          })

          if (decision.decision === 'deny') {
            return { handled: true, extensionId: extId, error: `Policy blocked extension command: ${decision.reason}` }
          }

          if (decision.tokenRequired) {
            const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'extension_command')
            if (!verified.valid) {
              return { handled: true, extensionId: extId, error: `Policy token invalid: ${verified.reason || 'unknown'}` }
            }
          }

          const output = await ext.handle(prefix, args)
          return { handled: true, extensionId: extId, output }
        } catch (err) {
          return { handled: true, extensionId: extId, error: String(err) }
        }
      }
    }

    return { handled: false }
  }

  /**
   * Try to match a voice input against extension wake words.
   */
  routeVoice(transcript: string): ExtensionResult & { extensionId?: string } {
    const lower = transcript.toLowerCase()

    for (const [wakeWord, extId] of this.wakeWordIndex.entries()) {
      if (lower.includes(wakeWord)) {
        return { handled: true, extensionId: extId }
      }
    }
    return { handled: false }
  }

  // ── Management ────────────────────────────────────────────────────────

  enable(id: string): void {
    const ext = this.extensions.get(id)
    if (ext) ext.manifest.enabled = true
  }

  disable(id: string): void {
    const ext = this.extensions.get(id)
    if (ext) {
      ext.manifest.enabled = false
      a2a.unregister(`ext:${id}`)
    }
  }

  unload(id: string): void {
    const ext = this.extensions.get(id)
    if (!ext) return

    for (const cmd of ext.manifest.commands) {
      this.commandIndex.delete(cmd.toLowerCase())
    }
    for (const ww of ext.manifest.wakeWords ?? []) {
      this.wakeWordIndex.delete(ww.toLowerCase())
    }
    a2a.unregister(`ext:${id}`)
    this.extensions.delete(id)
    console.log(`[Extensions] Unloaded: ${id}`)
  }

  listAll(): ExtensionManifest[] {
    return Array.from(this.extensions.values()).map(e => e.manifest)
  }

  get(id: string): Extension | undefined {
    return this.extensions.get(id)
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async loadExtensionFromPath(extPath: string): Promise<boolean> {
    try {
      if (!window.nativeBridge?.readFile) return false

      const decision = await policyGateway.decide({
        requestId: `ext_load_${Date.now()}`,
        agentId: 'extension-system',
        action: 'extension_load',
        command: extPath,
        source: 'local',
        explicitPermission: true,
        requestedPrivileges: ['file_system', 'extension_load'],
        riskScore: 0.65,
        occurredAt: Date.now(),
        policyPack: policyGateway.getPolicyPack(),
      })
      if (decision.decision === 'deny') return false
      if (decision.tokenRequired) {
        const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'extension_load')
        if (!verified.valid) return false
      }

      const manifestResult = await window.nativeBridge.readFile(`${extPath}/manifest.json`)
      if (!manifestResult.success || !manifestResult.content) return false

      const manifest = JSON.parse(manifestResult.content) as ExtensionManifest
      if (!manifest.id || !manifest.commands) return false
      if (!manifest.integrity) {
        console.warn(`[Extensions] ${manifest.id} rejected: missing integrity checksum`)
        return false
      }

      const actionsFile = manifest.actionsFile || 'actions.json'
      const actionsResult = await window.nativeBridge.readFile(`${extPath}/${actionsFile}`)
      if (!actionsResult.success || !actionsResult.content) return false

      const hash = await this.sha256(actionsResult.content)
      if (hash !== manifest.integrity) {
        console.warn(`[Extensions] ${manifest.id} rejected: integrity mismatch`)
        return false
      }

      const parsedActions = JSON.parse(actionsResult.content) as Record<string, string>
      const safeActions = Object.entries(parsedActions).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
      if (!safeActions.length) return false

      this.register({
        manifest: { ...manifest, enabled: manifest.enabled !== false },
        handle: async (commandPrefix: string, args: string) => {
          const found = safeActions.find(([key]) => key.toLowerCase() === commandPrefix.toLowerCase())
          if (!found) return `No declarative handler for ${commandPrefix}`
          return found[1].replace(/\{args\}/g, args)
        },
      })
      return true
    } catch (err) {
      console.error(`[Extensions] Failed to load ${extPath}:`, err)
      return false
    }
  }

  private async sha256(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  }
}

export const extensionSystem = new ExtensionSystem()

// ── Built-in Extensions Auto-Registration ─────────────────────────────────
// Register all 12 features as extensions so they appear in the extension list
// and can be individually toggled/replaced by user-created extensions.

export function registerBuiltinExtensions(): void {
  // These are registered by their respective engines when imported.
  // This function just signals registration is complete.
  console.log('[Extensions] Built-in extensions ready.')
}
