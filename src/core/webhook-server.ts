/**
 * Webhook Server — Feature C-8 (OpenClaw) + J-R4 (OpenJarvis)
 *
 * Lets external apps PUSH events into the agent.
 * Instead of the agent only reacting to YOU, the world can trigger it too.
 *
 * Use cases:
 *   - GitHub push → agent runs tests → reports to Telegram
 *   - Form submit → agent processes data → sends confirmation email
 *   - Cron from external service → agent wakes up → does daily task
 *   - Zapier/Make → triggers agent → executes complex workflow
 *   - IoT sensor → agent analyzes → takes action
 *
 * In Electron, the HTTP server runs in the MAIN process.
 * The renderer registers webhook handlers via nativeBridge.webhook.*
 *
 * Default port: 19204 (configurable)
 * Security: optional shared secret (HMAC verification like GitHub webhooks)
 */

import { a2a } from './a2a-protocol'
import { daemonManager } from './daemon-manager'

// ── Types ──────────────────────────────────────────────────────────────────

export interface WebhookEndpoint {
  id: string
  path: string             // e.g. "/github" or "/zapier"
  name: string
  description: string
  secret?: string          // HMAC secret for verification
  enabled: boolean
  handler: string          // what to do when triggered (agent command)
  triggerCount: number
  lastTriggered?: number
}

export interface WebhookPayload {
  endpoint: string
  body: unknown
  headers: Record<string, string>
  timestamp: number
  source?: string         // "github" | "zapier" | "custom"
}

// ── WebhookServer ─────────────────────────────────────────────────────────

class WebhookServer {
  private endpoints = new Map<string, WebhookEndpoint>()
  private port = 19204
  private running = false

  constructor() {
    this.loadEndpoints()
    this.registerDefaultEndpoints()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the webhook HTTP server. Runs in Electron main process.
   */
  async start(port?: number): Promise<void> {
    if (this.running) return
    this.port = port ?? this.port

    const success = await window.nativeBridge?.webhook?.start?.(this.port)
    if (success !== false) {
      this.running = true
      console.log(`[Webhook] 🔔 Listening on http://localhost:${this.port}`)
    }

    // Listen for incoming webhooks from main process
    window.nativeBridge?.webhook?.onReceive?.((payload: WebhookPayload) => {
      this.handleIncoming(payload).catch(console.error)
    })
  }

  /**
   * Stop the webhook server.
   */
  async stop(): Promise<void> {
    await window.nativeBridge?.webhook?.stop?.()
    this.running = false
    console.log('[Webhook] ⏹ Stopped')
  }

  /**
   * Register a new webhook endpoint.
   */
  register(endpoint: Omit<WebhookEndpoint, 'triggerCount'>): void {
    this.endpoints.set(endpoint.path, { ...endpoint, triggerCount: 0 })
    this.saveEndpoints()

    // Tell main process about new route
    window.nativeBridge?.webhook?.registerPath?.(endpoint.path)
    console.log(`[Webhook] ✅ Registered: ${endpoint.path} → ${endpoint.handler}`)
  }

  /**
   * Remove an endpoint.
   */
  unregister(path: string): void {
    this.endpoints.delete(path)
    this.saveEndpoints()
  }

  /**
   * Simulate an incoming webhook (for testing).
   */
  async simulate(path: string, body: unknown): Promise<void> {
    await this.handleIncoming({
      endpoint: path,
      body,
      headers: { 'content-type': 'application/json', 'x-simulated': 'true' },
      timestamp: Date.now(),
      source: 'simulation',
    })
  }

  /**
   * Get the local URL for a specific endpoint.
   */
  getUrl(path: string): string {
    return `http://localhost:${this.port}${path}`
  }

  /**
   * Get all registered endpoints and their stats.
   */
  listEndpoints(): WebhookEndpoint[] {
    return Array.from(this.endpoints.values())
  }

  isRunning(): boolean { return this.running }
  getPort(): number { return this.port }

  // ── Private ───────────────────────────────────────────────────────────

  private async handleIncoming(payload: WebhookPayload): Promise<void> {
    const endpoint = this.endpoints.get(payload.endpoint)

    if (!endpoint || !endpoint.enabled) {
      console.log(`[Webhook] ⚠️ Unregistered path: ${payload.endpoint}`)
      return
    }

    // Update stats
    endpoint.triggerCount++
    endpoint.lastTriggered = Date.now()
    this.saveEndpoints()

    console.log(`[Webhook] 📨 ${endpoint.name} triggered`)

    // Wake the daemon
    await daemonManager.wake({
      type: 'webhook',
      timestamp: Date.now(),
      data: { endpoint: endpoint.path, payload: payload.body },
    })

    // Build the agent command from the handler template
    const command = this.buildCommand(endpoint.handler, payload)

    // Route to agent via A2A
    await a2a.send(
      'webhook-server',
      'orchestrator',
      { command, source: 'webhook', webhookEndpoint: payload.endpoint },
      { type: 'task', priority: 'normal' }
    )
  }

  private buildCommand(handler: string, payload: WebhookPayload): string {
    // Simple template substitution: {{body}} → JSON of body
    return handler
      .replace('{{body}}', JSON.stringify(payload.body).slice(0, 500))
      .replace('{{source}}', payload.source ?? 'webhook')
      .replace('{{path}}', payload.endpoint)
      .replace('{{timestamp}}', new Date(payload.timestamp).toISOString())
  }

  private registerDefaultEndpoints(): void {
    // GitHub webhook
    this.register({
      id: 'github-push',
      path: '/github',
      name: 'GitHub Events',
      description: 'Triggered by GitHub push, PR, issue events',
      enabled: true,
      handler: 'git: analyze github event: {{body}}',
    })

    // Generic trigger
    this.register({
      id: 'trigger',
      path: '/trigger',
      name: 'Generic Trigger',
      description: 'Send any command to the agent via HTTP POST',
      enabled: true,
      handler: '{{body}}',
    })

    // Morning trigger (can be called by cron.job)
    this.register({
      id: 'morning',
      path: '/morning',
      name: 'Morning Digest Trigger',
      description: 'Triggers the morning briefing',
      enabled: true,
      handler: 'good morning',
    })
  }

  private saveEndpoints(): void {
    try {
      localStorage.setItem('webhook-endpoints', JSON.stringify(Array.from(this.endpoints.values())))
    } catch { /* ignore */ }
  }

  private loadEndpoints(): void {
    try {
      const stored = localStorage.getItem('webhook-endpoints')
      if (stored) {
        const eps = JSON.parse(stored) as WebhookEndpoint[]
        eps.forEach(e => this.endpoints.set(e.path, e))
      }
    } catch { /* ignore */ }
  }
}

export const webhookServer = new WebhookServer()
