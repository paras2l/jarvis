/**
 * Channel Router â€” Feature C-1 (OpenClaw: Multi-Channel Inbox)
 *
 * The agent lives inside ALL your messaging apps simultaneously.
 * WhatsApp + Telegram + Discord + Slack + Signal â†’ one unified inbox.
 * You talk to Pixi from whichever app you prefer â€” it's always the same agent.
 *
 * How it works:
 *   - Each "channel" is an adapter that knows how to send/receive messages
 *   - The router normalizes them all to a common Message format
 *   - Outbound: agent writes ONE response â†’ router fans it out to the right channel
 *   - Inbound: message arrives from any platform â†’ normalized â†’ agent processes it
 *
 * Platform support:
 *   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
 *   â”‚  WhatsApp    â†’ via Baileys (unofficial WA Web API, local)       â”‚
 *   â”‚  Telegram    â†’ via official Bot API (free, always works)        â”‚
 *   â”‚  Discord     â†’ via discord.js Bot API (free)                    â”‚
 *   â”‚  Slack       â†’ via Slack Bolt API                               â”‚
 *   â”‚  Signal      â†’ via signal-cli (local, most private)            â”‚
 *   â”‚  WebChat     â†’ built-in browser chat (no setup required)       â”‚
 *   â”‚  Email       â†’ SMTP/IMAP bridge (any email provider)           â”‚
 *   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
 *
 * Architecture Decision:
 *   In this Electron app, all channel adapters that require a server
 *   (WhatsApp, Telegram, Discord) run in the Electron MAIN process.
 *   The renderer (this file) communicates via nativeBridge.channel.*
 *
 *   For web/PWA mode: only WebChat and Telegram (webhook mode) work natively.
 *   For Android/iOS: WebChat + Telegram via Capacitor HTTP plugin.
 *
 * Inspired by OpenClaw's multi-channel architecture.
 * Rebuilt from scratch for our TypeScript/Electron stack â€” no direct code copy.
 */

import { intelligenceRouter } from './intelligence-router'
import { daemonManager } from './daemon-manager'
import { a2a } from './a2a-protocol'
import { brainDirector } from './brain/brain-director'
import { emotionCore } from './emotion/emotion-core'

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type ChannelId =
  | 'whatsapp'
  | 'telegram'
  | 'discord'
  | 'slack'
  | 'signal'
  | 'webchat'
  | 'email'

export type MessageRole = 'user' | 'agent' | 'system'

export interface UnifiedMessage {
  id: string
  channelId: ChannelId
  from: string          // sender identifier (phone, username, email, etc.)
  fromName?: string     // display name if available
  content: string       // text content
  role: MessageRole
  timestamp: number
  replyTo?: string      // ID of message being replied to
  attachments?: Array<{
    type: 'image' | 'audio' | 'video' | 'file'
    url?: string
    base64?: string
    mimeType?: string
    name?: string
  }>
  raw?: unknown         // platform-specific raw message object
}

export interface ChannelConfig {
  id: ChannelId
  name: string
  enabled: boolean
  credentials: Record<string, string>   // bot token, phone, etc.
  allowedSenders?: string[]             // phone numbers, usernames (whitelist)
  webhookUrl?: string                   // for webhook-mode channels
}

export interface ChannelStatus {
  id: ChannelId
  name: string
  connected: boolean
  lastMessage?: number
  messageCount: number
  error?: string
}

// â”€â”€ Channel Adapters â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Each adapter knows how to:
 *   1. connect() â€” establish connection to the platform
 *   2. send()    â€” send a message to a specific recipient
 *   3. receive() â€” subscribe to incoming messages
 */

abstract class ChannelAdapter {
  abstract id: ChannelId
  abstract name: string
  connected = false
  messageCount = 0
  lastMessage?: number
  lastError?: string

  abstract connect(config: ChannelConfig): Promise<boolean>
  abstract send(to: string, message: string, attachments?: UnifiedMessage['attachments']): Promise<boolean>
  abstract disconnect(): Promise<void>

  status(): ChannelStatus {
    return {
      id: this.id,
      name: this.name,
      connected: this.connected,
      lastMessage: this.lastMessage,
      messageCount: this.messageCount,
      error: this.lastError,
    }
  }
}

// â”€â”€ Telegram Adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class TelegramAdapter extends ChannelAdapter {
  id: ChannelId = 'telegram'
  name = 'Telegram'
  private botToken = ''
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private lastUpdateId = 0
  private onMessage?: (msg: UnifiedMessage) => void

  async connect(config: ChannelConfig): Promise<boolean> {
    this.botToken = config.credentials.botToken ?? ''
    if (!this.botToken) {
      this.lastError = 'No bot token configured'
      return false
    }

    // Verify bot is valid
    try {
      const resp = await fetch(`https://api.telegram.org/bot${this.botToken}/getMe`)
      const data = await resp.json() as { ok: boolean; result: { first_name: string; username: string } }
      if (!data.ok) throw new Error('Invalid token')
      console.log(`[Telegram] âœ… Connected as @${data.result.username}`)
      this.connected = true
      this.startPolling()
      return true
    } catch (e) {
      this.lastError = String(e)
      return false
    }
  }

  async send(chatId: string, text: string): Promise<boolean> {
    if (!this.botToken) return false
    try {
      const resp = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      })
      return (await resp.json() as { ok: boolean }).ok
    } catch {
      return false
    }
  }

  async sendTyping(chatId: string): Promise<void> {
    if (!this.botToken) return
    await fetch(`https://api.telegram.org/bot${this.botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).catch(() => undefined)
  }

  async disconnect(): Promise<void> {
    if (this.pollInterval) clearInterval(this.pollInterval)
    this.connected = false
  }

  setMessageCallback(cb: (msg: UnifiedMessage) => void): void {
    this.onMessage = cb
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => this.poll(), 2000)
  }

  private async poll(): Promise<void> {
    if (!this.botToken) return
    try {
      const resp = await fetch(
        `https://api.telegram.org/bot${this.botToken}/getUpdates?offset=${this.lastUpdateId + 1}&timeout=1`
      )
      const data = await resp.json() as {
        ok: boolean
        result: Array<{
          update_id: number
          message?: {
            message_id: number
            from: { id: number; first_name: string; username?: string }
            chat: { id: number }
            text?: string
          }
        }>
      }
      if (!data.ok) return

      for (const update of data.result) {
        this.lastUpdateId = update.update_id
        const msg = update.message
        if (!msg?.text) continue

        this.messageCount++
        this.lastMessage = Date.now()

        const unified: UnifiedMessage = {
          id: `tg_${msg.message_id}`,
          channelId: 'telegram',
          from: String(msg.chat.id),
          fromName: msg.from.first_name + (msg.from.username ? ` (@${msg.from.username})` : ''),
          content: msg.text,
          role: 'user',
          timestamp: Date.now(),
          raw: msg,
        }
        this.onMessage?.(unified)
      }
    } catch { /* network hiccup â€” keep trying */ }
  }
}

// â”€â”€ Discord Adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class DiscordAdapter extends ChannelAdapter {
  id: ChannelId = 'discord'
  name = 'Discord'
  private botToken = ''
  private ws: WebSocket | null = null
  private onMessage?: (msg: UnifiedMessage) => void
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private sessionId = ''  // reserved for Discord resume on reconnect
  private sequence: number | null = null

  async connect(config: ChannelConfig): Promise<boolean> {
    this.botToken = config.credentials.botToken ?? ''
    if (!this.botToken) { this.lastError = 'No bot token'; return false }

    try {
      // In Electron: delegate to main process (discord.js needs Node.js)
      if (window.nativeBridge?.channel?.connect) {
        const ok = await window.nativeBridge.channel.connect('discord', config.credentials)
        this.connected = ok
        return ok
      }
      // Web fallback: use Discord Gateway directly via WebSocket
      await this.connectGateway()
      return this.connected
    } catch (e) {
      this.lastError = String(e)
      return false
    }
  }

  async send(channelId: string, content: string): Promise<boolean> {
    if (!this.botToken) return false
    if (window.nativeBridge?.channel?.send) {
      return window.nativeBridge.channel.send('discord', channelId, content)
    }
    try {
      const resp = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      })
      return resp.ok
    } catch { return false }
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
    this.ws?.close()
    this.connected = false
  }

  setMessageCallback(cb: (msg: UnifiedMessage) => void): void {
    this.onMessage = cb
  }

  private async connectGateway(): Promise<void> {
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')
    this.ws.onmessage = (event) => this.handleGatewayMessage(event)
    this.ws.onerror = (e) => { this.lastError = 'Gateway error'; console.error('[Discord]', e) }
    await new Promise<void>(r => { if (this.ws) this.ws.onopen = () => r() })
  }

  private handleGatewayMessage(event: MessageEvent): void {
    const payload = JSON.parse(event.data as string) as {
      op: number; t?: string; s?: number
      d: Record<string, unknown>
    }

    if (payload.s) this.sequence = payload.s

    switch (payload.op) {
      case 10: // Hello
        this.heartbeatInterval = setInterval(() => {
          this.ws?.send(JSON.stringify({ op: 1, d: this.sequence }))
        }, (payload.d.heartbeat_interval as number) ?? 41250)
        // Identify
        this.ws?.send(JSON.stringify({
          op: 2,
          d: {
            token: this.botToken,
            intents: 513, // GUILDS + GUILD_MESSAGES
            properties: { os: 'linux', browser: 'Pixi', device: 'Pixi' },
          },
        }))
        break
      case 0: // Dispatch
        if (payload.t === 'READY') {
          this.connected = true
          this.sessionId = String(payload.d.session_id ?? '')
          console.log(`[Discord] âœ… Connected (session: ${this.sessionId.slice(0, 8)}...)`)
        }
        if (payload.t === 'MESSAGE_CREATE') {
          const m = payload.d as {
            id: string; content: string; channel_id: string
            author: { id: string; username: string; bot?: boolean }
          }
          if (m.author.bot) return
          this.messageCount++
          this.lastMessage = Date.now()
          this.onMessage?.({
            id: `dc_${m.id}`,
            channelId: 'discord',
            from: m.channel_id,
            fromName: m.author.username,
            content: m.content,
            role: 'user',
            timestamp: Date.now(),
            raw: m,
          })
        }
        break
    }
  }
}

// â”€â”€ WebChat Adapter (built-in, zero setup) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class WebChatAdapter extends ChannelAdapter {
  id: ChannelId = 'webchat'
  name = 'WebChat'
  private messageCallback?: (msg: UnifiedMessage) => void

  async connect(_config: ChannelConfig): Promise<boolean> {
    // WebChat is always available â€” it's the in-app chat
    this.connected = true
    console.log('[WebChat] âœ… Ready (built-in)')
    return true
  }

  async send(_to: string, content: string): Promise<boolean> {
    // Rendered directly in the UI â€” dispatch a custom event
    window.dispatchEvent(new CustomEvent('Pixi:agent-message', { detail: { content } }))
    return true
  }

  async disconnect(): Promise<void> { this.connected = false }

  setMessageCallback(cb: (msg: UnifiedMessage) => void): void {
    this.messageCallback = cb
    // Listen for user messages from the UI
    window.addEventListener('Pixi:user-message', (e: Event) => {
      const detail = (e as CustomEvent<{ content: string; from: string }>).detail
      this.messageCount++
      this.lastMessage = Date.now()
      this.messageCallback?.({
        id: `wc_${Date.now()}`,
        channelId: 'webchat',
        from: detail.from ?? 'user',
        content: detail.content,
        role: 'user',
        timestamp: Date.now(),
      })
    })
  }
}

// â”€â”€ Email Adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class EmailAdapter extends ChannelAdapter {
  id: ChannelId = 'email'
  name = 'Email'

  async connect(config: ChannelConfig): Promise<boolean> {
    if (window.nativeBridge?.channel?.connect) {
      const ok = await window.nativeBridge.channel.connect('email', config.credentials)
      this.connected = ok
      return ok
    }
    console.log('[Email] â„¹ï¸ Email requires Electron main process (IMAP/SMTP)')
    return false
  }

  async send(to: string, content: string): Promise<boolean> {
    if (!window.nativeBridge?.channel?.send) return false
    return window.nativeBridge.channel.send('email', to, content)
  }

  async disconnect(): Promise<void> { this.connected = false }
}

// â”€â”€ WhatsApp Adapter (Stub for Electron main delegation) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class WhatsAppAdapter extends ChannelAdapter {
  id: ChannelId = 'whatsapp'
  name = 'WhatsApp'
  private onMessage?: (msg: UnifiedMessage) => void

  async connect(config: ChannelConfig): Promise<boolean> {
    // WhatsApp (Baileys) MUST run in Electron main (Node.js) â€” delegate via bridge
    if (window.nativeBridge?.channel?.connect) {
      const ok = await window.nativeBridge.channel.connect('whatsapp', config.credentials)
      this.connected = ok
      if (ok) {
        // Subscribe to incoming messages from main process
        window.nativeBridge.channel.onMessage?.('whatsapp', (data) => {
          this.messageCount++
          this.lastMessage = Date.now()
          this.onMessage?.({
            id: `wa_${Date.now()}`,
            channelId: 'whatsapp',
            from: String(data.from ?? ''),
            fromName: String(data.fromName ?? ''),
            content: String(data.content ?? ''),
            role: 'user',
            timestamp: Date.now(),
            raw: data,
          })
        })
      }
      return ok
    }
    console.log('[WhatsApp] â„¹ï¸ WhatsApp requires Electron with Baileys in main process')
    return false
  }

  async send(to: string, content: string): Promise<boolean> {
    if (!window.nativeBridge?.channel?.send) return false
    return window.nativeBridge.channel.send('whatsapp', to, content)
  }

  async disconnect(): Promise<void> {
    await window.nativeBridge?.channel?.disconnect?.('whatsapp')
    this.connected = false
  }

  setMessageCallback(cb: (msg: UnifiedMessage) => void): void {
    this.onMessage = cb
  }
}

// â”€â”€ ChannelRouter â€” The Unified Inbox â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ChannelRouter {
  private adapters = new Map<ChannelId, ChannelAdapter>()
  private configs = new Map<ChannelId, ChannelConfig>()
  private messageHistory: UnifiedMessage[] = []
  private readonly MAX_HISTORY = 500
  private replyContexts = new Map<string, string>()  // messageId â†’ channelSender

  constructor() {
    // Register all adapters
    this.adapters.set('telegram', new TelegramAdapter())
    this.adapters.set('discord', new DiscordAdapter())
    this.adapters.set('webchat', new WebChatAdapter())
    this.adapters.set('whatsapp', new WhatsAppAdapter())
    this.adapters.set('email', new EmailAdapter())

    this.loadConfigs()
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Connect a channel with its credentials.
   */
  async connect(channelId: ChannelId, credentials: Record<string, string> = {}): Promise<boolean> {
    const adapter = this.adapters.get(channelId)
    if (!adapter) return false

    const config: ChannelConfig = {
      id: channelId,
      name: adapter.name,
      enabled: true,
      credentials,
    }
    this.configs.set(channelId, config)
    this.saveConfigs()

    // Wire message callback
    if ('setMessageCallback' in adapter) {
      (adapter as TelegramAdapter).setMessageCallback((msg) => this.handleIncoming(msg))
    }

    const ok = await adapter.connect(config)
    console.log(`[ChannelRouter] ${ok ? 'âœ…' : 'âŒ'} ${adapter.name}`)
    return ok
  }

  /**
   * Start WebChat automatically (zero config needed).
   */
  async startWebChat(): Promise<void> {
    await this.connect('webchat', {})
    const wc = this.adapters.get('webchat') as WebChatAdapter
    wc.setMessageCallback((msg) => this.handleIncoming(msg))
  }

  /**
   * Send a message out to a specific channel.
   * @param channelId Which platform to send on
   * @param to Recipient identifier (chat_id, phone, channel_id, email)
   * @param content The message text
   */
  async send(channelId: ChannelId, to: string, content: string): Promise<boolean> {
    const adapter = this.adapters.get(channelId)
    if (!adapter?.connected) return false

    // Show typing indicator for Telegram
    if (channelId === 'telegram') {
      await (adapter as TelegramAdapter).sendTyping(to)
    }

    const ok = await adapter.send(to, content)
    if (ok) {
      this.logMessage({
        id: `out_${Date.now()}`,
        channelId,
        from: 'Pixi',
        content,
        role: 'agent',
        timestamp: Date.now(),
      })
    }
    return ok
  }

  /**
   * Reply to a specific message (uses stored reply context).
   */
  async reply(originalMessageId: string, content: string): Promise<boolean> {
    const context = this.replyContexts.get(originalMessageId)
    if (!context) return false

    const [channelId, to] = context.split('|') as [ChannelId, string]
    return this.send(channelId, to, content)
  }

  /**
   * Broadcast a message to ALL connected channels.
   * Useful for system announcements.
   */
  async broadcast(content: string): Promise<void> {
    const targets = Array.from(this.configs.entries())
      .filter(([, c]) => c.enabled)

    await Promise.allSettled(
      targets.map(([id, config]) => {
        const defaultTarget = config.credentials.defaultRecipient ?? ''
        if (defaultTarget) return this.send(id, defaultTarget, content)
        return Promise.resolve(false)
      })
    )
  }

  /**
   * Get status of all channels.
   */
  getStatus(): ChannelStatus[] {
    return Array.from(this.adapters.values()).map(a => a.status())
  }

  /**
   * Get recent message history across all channels.
   */
  getHistory(limit = 50): UnifiedMessage[] {
    return this.messageHistory.slice(-limit)
  }

  /**
   * Check if any channel is connected.
   */
  isAnyConnected(): boolean {
    return Array.from(this.adapters.values()).some(a => a.connected)
  }

  /**
   * Build a compact triage summary for the most recent inbox messages.
   */
  async triageInbox(limit = 25): Promise<string> {
    const recentMessages = this.messageHistory
      .slice(-Math.max(1, limit))
      .map((message) => `${message.channelId}:${message.fromName ?? message.from}: ${message.content}`)
      .join('\n')
    const emotionSnapshot = emotionCore.analyzeText(recentMessages || 'Inbox triage')

    const brainPrompt = await brainDirector.buildAdaptivePromptEnvelope({
      text: recentMessages || 'Inbox triage',
      intent: 'message_reply',
      mode: 'triage',
      mood: emotionCore.toMoodLabel(emotionSnapshot.emotion),
      emotionSnapshot,
      userName: 'Paras',
      recentTurns: this.messageHistory.slice(-Math.max(1, limit)).map((message) => ({
        role: message.role === 'agent' ? 'assistant' : 'user',
        content: message.content,
        timestamp: message.timestamp,
      })),
    })

    const result = await intelligenceRouter.query(
      [
        'Summarize this inbox into an actionable triage brief.',
        'Call out urgent human messages first, then items that need a reply, then low-priority noise.',
        'If possible, suggest the next best action for each important item.',
      ].join('\n'),
      {
        urgency: 'background',
        taskType: 'chat',
        systemPrompt: brainPrompt,
        isPrivate: true,
      }
    )

    return result.content.trim()
  }

  /**
   * Disconnect a channel.
   */
  async disconnect(channelId: ChannelId): Promise<void> {
    await this.adapters.get(channelId)?.disconnect()
  }

  /**
   * Disconnect all channels.
   */
  async disconnectAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.adapters.values()).map(a => a.disconnect())
    )
  }

  // â”€â”€ Private: Incoming Message Processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async handleIncoming(msg: UnifiedMessage): Promise<void> {
    this.logMessage(msg)

    // Store reply context (channelId + sender) so we can reply back
    this.replyContexts.set(msg.id, `${msg.channelId}|${msg.from}`)
    // Expire old contexts after 30 minutes  
    setTimeout(() => this.replyContexts.delete(msg.id), 30 * 60 * 1000)

    console.log(`[ChannelRouter] ðŸ“¨ [${msg.channelId}] ${msg.fromName ?? msg.from}: ${msg.content.slice(0, 80)}`)

    // Wake daemon
    await daemonManager.wake({ type: 'wake', timestamp: Date.now(), data: msg })

    // Route via A2A to the orchestrator
    const result = await a2a.send(
      'channel-router',
      'orchestrator',
      { message: msg, channelId: msg.channelId, from: msg.from, content: msg.content },
      { priority: 'high', type: 'task' }
    )

    if (!result.success) {
      // Fallback: process directly with intelligence router
      await this.directProcess(msg)
    }
  }

  private async directProcess(msg: UnifiedMessage): Promise<void> {
    const recentTurns = this.getRecentChannelTurns(msg)
    const emotionSnapshot = emotionCore.analyzeText(msg.content)
    const brainPrompt = await brainDirector.buildAdaptivePromptEnvelope({
      text: msg.content,
      intent: 'message_reply',
      mode: 'triage',
      mood: emotionCore.toMoodLabel(emotionSnapshot.emotion),
      emotionSnapshot,
      userName: msg.fromName || msg.from,
      recentTurns,
    })

    const response = await intelligenceRouter.query(
      [
        'Reply to the incoming channel message in a useful, concise way.',
        'If the message is a request, answer or ask the smallest clarifying question needed.',
        'If it is noise or FYI, acknowledge briefly and avoid over-explaining.',
      ].join('\n'),
      {
        urgency: 'normal',
        taskType: 'chat',
        systemPrompt: brainPrompt,
        isPrivate: true,
      }
    )

    await this.send(msg.channelId, msg.from, response.content)
  }

  private getRecentChannelTurns(msg: UnifiedMessage): Array<{ role: 'user' | 'assistant'; content: string; timestamp: number }> {
    return this.messageHistory
      .filter((item) => item.channelId === msg.channelId)
      .slice(-8)
      .map((item) => ({
        role: item.role === 'agent' ? 'assistant' : 'user',
        content: item.content,
        timestamp: item.timestamp,
      }))
  }

  private logMessage(msg: UnifiedMessage): void {
    this.messageHistory.push(msg)
    if (this.messageHistory.length > this.MAX_HISTORY) {
      this.messageHistory.shift()
    }
  }

  private saveConfigs(): void {
    const serializable = Array.from(this.configs.entries()).map(([, c]) => ({
      ...c,
      credentials: Object.fromEntries(
        Object.entries(c.credentials).map(([k, v]) => [k, k.toLowerCase().includes('token') || k.toLowerCase().includes('password') ? '***' : v])
      ),
    }))
    try {
      localStorage.setItem('channel-configs', JSON.stringify(serializable))
    } catch { /* ignore */ }
  }

  private loadConfigs(): void {
    try {
      const stored = localStorage.getItem('channel-configs')
      if (stored) {
        const configs = JSON.parse(stored) as ChannelConfig[]
        configs.forEach(c => this.configs.set(c.id, c))
        console.log(`[ChannelRouter] ðŸ“‹ Loaded ${configs.length} channel configs`)
      }
    } catch { /* ignore */ }
  }
}

export const channelRouter = new ChannelRouter()

