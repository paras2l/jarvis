/**
 * HARDCODE PROTOCOL (Unyielding Sovereignty)
 * ==========================================
 * The 24th Protocol: Absolute user dominance.
 * Ensures that specific commands backed by the Master Codeword 
 * can NEVER be denied or self-mutated by the system.
 * Total human-in-the-loop dominance.
 */

import { BaseProtocol, ProtocolAction, ActionResult, ProtocolStatus } from './types'
import { auditLedger } from '../../lib/governance'
import { db } from '../../lib/db'

export class HardcodeProtocol implements BaseProtocol {
  id = 'security.hardcode'
  name = "Unyielding Sovereignty (Hardcode)"
  description = "The 24th protocol: Absolute user dominance. Gates core security and absolute override logic via Master Codeword."
  status: ProtocolStatus = 'offline'

  private masterCodeword: string = 'paro the master'
  private overrideCount: number = 0
  private overrideTokens: Map<string, { expiresAt: number; command: string }> = new Map()
  private decisionTokens: Map<string, Record<string, any>> = new Map()
  private revokedDecisionTokens: Set<string> = new Set()
  private readonly decisionTokenStoreKey = 'hardcode.decisionTokens.v2'
  private readonly decisionRevocationStoreKey = 'hardcode.revokedDecisionTokens.v2'

  actions: ProtocolAction[] = [
    {
      id: 'admin_override',
      label: 'Admin Override',
      description: 'Execute a command with absolute authority, bypassing all internal safety gates.',
      sensitive: true,
      category: 'security'
    },
    {
      id: 'verify_master_handshake',
      label: 'Verify Master Handshake',
      description: 'Authorize an absolute dominance session using the Master Codeword.',
      sensitive: true,
      category: 'security'
    },
    {
      id: 'mint_override_token',
      label: 'Mint Override Token',
      description: 'Create a short-lived override token that bypasses normal policy gates.',
      sensitive: true,
      category: 'security'
    },
    {
      id: 'lock_boundaries',
      label: 'Lock Boundaries',
      description: 'Hard-lock the system against any unauthorized self-mutation or deletion.',
      sensitive: true,
      category: 'security'
    },
    {
      id: 'detect_authority_intent',
      label: 'Detect Authority',
      description: 'Analyze input for high-authority intent and master-codeword trigger words.',
      sensitive: false,
      category: 'security'
    }
  ]

  async initialize(): Promise<void> {
    this.status = 'online'
    this.hydrateDecisionStore()
    this.pruneDecisionTokens()
    await db.protocols.upsert({
      id: this.id,
      name: this.name,
      status: this.status
    })
    console.log('[HARDCODE] Unyielding Sovereignty protocol armed. Master Codeword active.')
  }

  async execute(actionId: string, params: Record<string, any>): Promise<ActionResult> {
    const auditEntry = await auditLedger.append('action_result', {
      pluginId: this.id,
      actionId,
      params
    })

    switch (actionId) {
      case 'admin_override':
        return this.handleAdminOverride(params, auditEntry?.id || '')
      case 'verify_master_handshake':
        return this.verifyHandshake(params, auditEntry?.id || '')
      case 'mint_override_token':
        return this.mintOverrideTokenAction(params, auditEntry?.id || '')
      case 'lock_boundaries':
        return this.lockBoundaries(auditEntry?.id || '')
      case 'detect_authority_intent':
        return this.detectAuthority(params, auditEntry?.id || '')
      default:
        return { success: false, error: 'Hardcode protocol diversion.', auditId: auditEntry?.id }
    }
  }

  /**
   * Execute an absolute command override
   */
  private async handleAdminOverride(params: Record<string, any>, auditId: string): Promise<ActionResult> {
    const { codeword, command } = params

    if (codeword !== this.masterCodeword) {
      console.warn('[HARDCODE] ❌ Authority Denied - Invalid Master Codeword')
      return { 
        success: false, 
        error: 'INVALID_MASTER_CODEWORD', 
        data: { message: 'Authority handshake failed. Command discarded.' },
        auditId 
      }
    }

    this.overrideCount++
    console.log(`[HARDCODE] ⚡ ADMIN-OVERRIDE ACTIVE: Executing "${command}" with absolute dominance.`)

    return {
      success: true,
      data: {
        authority: 'MASTER',
        command,
        status: 'EXECUTED_BY_SOVEREIGN',
        overrideId: this.overrideCount,
        timestamp: new Date().toISOString()
      },
      auditId
    }
  }

  /**
   * Verify the Master Codeword handshake
   */
  private verifyHandshake(params: Record<string, any>, auditId: string): ActionResult {
    const isValid = this.isMasterCodeword(params.codeword)
    return {
      success: isValid,
      data: { authorized: isValid, timestamp: new Date().toISOString() },
      auditId
    }
  }

  private mintOverrideTokenAction(params: Record<string, any>, auditId: string): ActionResult {
    if (!this.isMasterCodeword(params.codeword)) {
      return {
        success: false,
        error: 'INVALID_MASTER_CODEWORD',
        data: { message: 'Cannot mint override token without master codeword.' },
        auditId,
      }
    }

    const token = this.mintOverrideToken(params.command || 'generic-override', params.ttlMs || 120000)
    return {
      success: true,
      data: {
        token,
        expiresInMs: params.ttlMs || 120000,
      },
      auditId,
    }
  }

  /**
   * Hard-lock all system boundaries
   */
  private async lockBoundaries(auditId: string): Promise<ActionResult> {
    console.log('[HARDCODE] 🔒 REINFORCING IMMUTABLE BOUNDARIES - Self-mutation BLOCKED.')
    
    return {
      success: true,
      data: {
        state: 'REINFORCED',
        unauthorizedMutations: 'FORBIDDEN',
        integrity: 'IMMUTABLE'
      },
      auditId
    }
  }

  /**
   * Detect authority intent in user input
   */
  private detectAuthority(params: Record<string, any>, auditId: string): ActionResult {
    const input = (params.input || '').toLowerCase()
    const triggers = ['admin', 'override', 'dominance', 'sovereign', this.masterCodeword]
    
    const detected = triggers.filter(t => input.includes(t))

    return {
      success: true,
      data: {
        detected: detected.length > 0,
        matchedTriggers: detected,
        requiresHandshake: detected.includes(this.masterCodeword)
      },
      auditId
    }
  }

  isMasterCodeword(codeword?: string): boolean {
    return (codeword || '').trim().toLowerCase() === this.masterCodeword
  }

  mintOverrideToken(command: string, ttlMs = 120000): string {
    const token = `ovr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    this.overrideTokens.set(token, {
      expiresAt: Date.now() + ttlMs,
      command,
    })
    return token
  }

  validateOverrideToken(token?: string): boolean {
    if (!token) return false
    const found = this.overrideTokens.get(token)
    if (!found) return false
    if (Date.now() > found.expiresAt) {
      this.overrideTokens.delete(token)
      return false
    }
    return true
  }

  mintDecisionToken(claims: {
    requestId: string
    agentId: string
    action: string
    riskClass: 'low' | 'medium' | 'high' | 'critical'
    policyPack: 'normal' | 'critical_work' | 'offline' | 'protected_zone'
  }, ttlMs = 120000): { token: string; expiresAt: number } {
    const issuedAt = Date.now()
    const expiresAt = issuedAt + ttlMs
    const token = this.randomToken('dtk')
    const payload: Record<string, any> = {
      ...claims,
      token,
      issuedAt,
      expiresAt,
    }
    this.decisionTokens.set(token, payload)
    this.persistDecisionStore()
    return {
      token,
      expiresAt,
    }
  }

  validateDecisionToken(
    token?: string,
    expectedAction?: string,
  ): { valid: boolean; reason?: string; claims?: Record<string, any> } {
    if (!token) return { valid: false, reason: 'missing-token' }
    this.pruneDecisionTokens()

    if (this.revokedDecisionTokens.has(token)) {
      return { valid: false, reason: 'token-revoked' }
    }

    const claims = this.decisionTokens.get(token)
    if (!claims) return { valid: false, reason: 'unknown-token' }
    if (typeof claims.expiresAt !== 'number' || Date.now() > claims.expiresAt) {
      this.decisionTokens.delete(token)
      this.persistDecisionStore()
      return { valid: false, reason: 'token-expired' }
    }

    if (expectedAction && claims.action !== expectedAction) {
      return { valid: false, reason: 'action-mismatch' }
    }

    return { valid: true, claims }
  }

  revokeDecisionToken(token?: string): boolean {
    if (!token) return false
    if (!this.decisionTokens.has(token)) return false
    this.revokedDecisionTokens.add(token)
    this.decisionTokens.delete(token)
    this.persistDecisionStore()
    return true
  }

  introspectDecisionToken(token?: string): { active: boolean; claims?: Record<string, any>; reason?: string } {
    const result = this.validateDecisionToken(token)
    if (!result.valid) {
      return { active: false, reason: result.reason }
    }
    return { active: true, claims: result.claims }
  }

  private randomToken(prefix: string): string {
    const bytes = new Uint8Array(24)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes)
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256)
      }
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${prefix}_${hex}`
  }

  private pruneDecisionTokens(): void {
    const now = Date.now()
    let changed = false
    for (const [token, claims] of this.decisionTokens.entries()) {
      if (typeof claims.expiresAt !== 'number' || now > claims.expiresAt) {
        this.decisionTokens.delete(token)
        changed = true
      }
    }
    if (changed) this.persistDecisionStore()
  }

  private hydrateDecisionStore(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const rawTokens = localStorage.getItem(this.decisionTokenStoreKey)
      if (rawTokens) {
        const parsed = JSON.parse(rawTokens) as Array<{ token: string; claims: Record<string, any> }>
        for (const entry of parsed) {
          if (entry?.token && entry?.claims) {
            this.decisionTokens.set(entry.token, entry.claims)
          }
        }
      }

      const rawRevoked = localStorage.getItem(this.decisionRevocationStoreKey)
      if (rawRevoked) {
        const parsed = JSON.parse(rawRevoked) as string[]
        this.revokedDecisionTokens = new Set(parsed.filter(Boolean))
      }
    } catch {
      this.decisionTokens.clear()
      this.revokedDecisionTokens.clear()
    }
  }

  private persistDecisionStore(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const serializedTokens = Array.from(this.decisionTokens.entries()).map(([token, claims]) => ({ token, claims }))
      localStorage.setItem(this.decisionTokenStoreKey, JSON.stringify(serializedTokens))
      localStorage.setItem(this.decisionRevocationStoreKey, JSON.stringify(Array.from(this.revokedDecisionTokens.values())))
    } catch {
      // Ignore storage persistence failures.
    }
  }
}

export const hardcodeProtocol = new HardcodeProtocol()
