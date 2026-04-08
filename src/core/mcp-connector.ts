/**
 * MCP Connector â€” Feature J-R1 (OpenPixi: Model Context Protocol)
 *
 * Model Context Protocol (MCP) is like USB-C for AI tools.
 * Instead of building custom integrations for each tool, you implement ONE protocol
 * and instantly connect to ANY MCP-compatible server: Blender, VS Code, databases,
 * file systems, APIs, web browsers â€” anything.
 *
 * Why it's a game-changer:
 *   - 1 implementation â†’ 1000+ compatible tools and data sources
 *   - MCP servers run locally â€” no API costs, no cloud dependency
 *   - The agent can discover what tools a server supports at runtime
 *   - Used by Claude Desktop, OpenPixi, and growing ecosystem
 *
 * This implementation:
 *   - Acts as an MCP CLIENT (connects to MCP servers)
 *   - Supports both stdio-based and HTTP-based MCP servers
 *   - Auto-discovers available tools from connected servers
 *   - Routes tool calls from the agent to the right MCP server
 *
 * Example MCP servers you can connect:
 *   - filesystem â†’ read/write any file
 *   - github â†’ full GitHub API via natural language
 *   - blender â†’ control Blender 3D
 *   - sqlite â†’ query any SQLite database
 *   - playwright â†’ browser automation
 *   - fetch â†’ web fetching with parsing
 *
 * Adapted from OpenPixi MCP integration â€” rebuilt for our browser/Electron context.
 */

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface MCPServerConfig {
  id: string
  name: string
  type: 'stdio' | 'http' | 'sse'  // Stdio (local process) or HTTP/SSE (remote)
  command?: string       // for stdio: e.g. "npx @modelcontextprotocol/server-filesystem /path"
  url?: string           // for http: e.g. "http://localhost:3001"
  env?: Record<string, string>
  description?: string
  enabled: boolean
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverId: string
  serverName: string
}

export interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
  serverId: string
}

export interface MCPCallResult {
  success: boolean
  content: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: string }>
  error?: string
  serverId: string
  toolName: string
  latencyMs: number
}

// â”€â”€ Pre-configured popular MCP servers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const POPULAR_SERVERS: Partial<MCPServerConfig>[] = [
  {
    id: 'filesystem',
    name: 'File System',
    type: 'stdio',
    command: 'npx -y @modelcontextprotocol/server-filesystem ./,C:/Users',
    description: 'Read and write any file on your computer',
  },
  {
    id: 'fetch',
    name: 'Web Fetch',
    type: 'stdio',
    command: 'npx -y @modelcontextprotocol/server-fetch',
    description: 'Fetch and parse web pages',
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    type: 'stdio',
    command: 'npx -y @modelcontextprotocol/server-sqlite --db-path ./data.db',
    description: 'Query and update SQLite databases',
  },
  {
    id: 'memory',
    name: 'Persistent Memory',
    type: 'stdio',
    command: 'npx -y @modelcontextprotocol/server-memory',
    description: 'Store and recall facts across sessions',
  },
  {
    id: 'everything',
    name: 'Debug Server',
    type: 'stdio',
    command: 'npx -y @modelcontextprotocol/server-everything',
    description: 'Test MCP features',
  },
]

// â”€â”€ MCPConnector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class MCPConnector {
  private servers = new Map<string, MCPServerConfig>()
  private toolRegistry = new Map<string, MCPTool>()      // toolName â†’ MCPTool
  private readonly CONFIG_KEY = 'mcp-servers'

  constructor() {
    this.loadConfig()
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private abortError(toolName: string): MCPCallResult {
    return {
      success: false,
      content: [],
      error: `Cancelled ${toolName}`,
      serverId: '',
      toolName,
      latencyMs: 0,
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  }

  /**
   * Register an MCP server. Call this to connect new tools.
   */
  async registerServer(config: MCPServerConfig): Promise<boolean> {
    this.servers.set(config.id, config)
    this.saveConfig()

    if (!config.enabled) return true

    try {
      await this.discoverTools(config)
      console.log(`[MCP] âœ… Connected: ${config.name} (${this.countServerTools(config.id)} tools)`)
      return true
    } catch (e) {
      console.warn(`[MCP] âš ï¸ Could not connect to ${config.name}: ${e}`)
      return false
    }
  }

  /**
   * Register all popular servers at once (for quick setup).
   */
  async registerPopularServers(): Promise<void> {
    console.log('[MCP] ðŸ”Œ Registering popular MCP servers...')
    for (const partial of POPULAR_SERVERS) {
      await this.registerServer({ ...partial, enabled: true } as MCPServerConfig)
    }
  }

  /**
   * Call a tool by name with arguments.
   * This is what the agent calls when it needs to use an MCP tool.
   */
  async callTool(toolName: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<MCPCallResult> {
    if (signal?.aborted) {
      return this.abortError(toolName)
    }

    const start = Date.now()
    const tool = this.toolRegistry.get(toolName)

    if (!tool) {
      return {
        success: false,
        content: [],
        error: `Tool "${toolName}" not found. Available: ${this.listToolNames().join(', ')}`,
        serverId: '',
        toolName,
        latencyMs: 0,
      }
    }

    const server = this.servers.get(tool.serverId)
    if (!server || !server.enabled) {
      return { success: false, content: [], error: `Server ${tool.serverId} not enabled`, serverId: tool.serverId, toolName, latencyMs: 0 }
    }

    try {
      const result = await this.sendToolCall(server, toolName, args, signal)
      if (signal?.aborted) {
        return this.abortError(toolName)
      }
      return { ...result, serverId: tool.serverId, toolName, latencyMs: Date.now() - start }
    } catch (e) {
      if (signal?.aborted) {
        return this.abortError(toolName)
      }
      return { success: false, content: [], error: String(e), serverId: tool.serverId, toolName, latencyMs: Date.now() - start }
    }
  }

  /**
   * Find the best tool for a natural language request.
   * Agent uses this to auto-select the right tool.
   */
  findToolForRequest(request: string): MCPTool | null {
    const lower = request.toLowerCase()
    const tools = Array.from(this.toolRegistry.values())

    // Score each tool by how well its description matches the request
    const scored = tools.map(t => {
      const desc = t.description.toLowerCase()
      const name = t.name.toLowerCase()
      let score = 0

      // Keyword matching
      const reqWords = lower.split(/\s+/)
      for (const word of reqWords) {
        if (word.length < 3) continue
        if (desc.includes(word)) score += 2
        if (name.includes(word)) score += 3
      }

      return { tool: t, score }
    })

    const best = scored.sort((a, b) => b.score - a.score)[0]
    return best?.score > 0 ? best.tool : null
  }

  /**
   * Get all available tools (for the agent to know what it can do).
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.toolRegistry.values())
  }

  listToolNames(): string[] {
    return Array.from(this.toolRegistry.keys())
  }

  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values())
  }

  /**
   * Generate a tool manifest for injection into LLM context.
   * This tells the LLM what MCP tools are available.
   */
  getToolManifest(): string {
    const tools = this.getAllTools()
    if (tools.length === 0) return ''

    const lines = [
      'Available MCP Tools (call with: mcp:<toolName> {"arg": "value"}):',
      ...tools.map(t => `- ${t.name}: ${t.description}  [via ${t.serverName}]`)
    ]
    return lines.join('\n')
  }

  /**
   * Remove a server and all its tools.
   */
  removeServer(serverId: string): void {
    this.servers.delete(serverId)
    // Remove all tools from this server
    for (const [name, tool] of this.toolRegistry.entries()) {
      if (tool.serverId === serverId) this.toolRegistry.delete(name)
    }
    this.saveConfig()
  }

  // â”€â”€ Private: Discovery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async discoverTools(server: MCPServerConfig): Promise<void> {
    // In a real implementation, this would:
    // 1. For stdio: spawn the process and communicate via JSON-RPC over stdin/stdout
    // 2. For http: GET /tools and GET /resources
    // Since we're in the renderer, this goes through nativeBridge.mcp.*

    if (window.nativeBridge?.mcp?.listTools) {
      const tools = await window.nativeBridge.mcp.listTools(server)
      for (const tool of (tools ?? [])) {
        this.toolRegistry.set(tool.name, { ...tool, serverId: server.id, serverName: server.name })
      }
    } else {
      // Register stub tools based on well-known server capabilities
      this.registerStubTools(server)
    }
  }

  private registerStubTools(server: MCPServerConfig): void {
    // Register well-known tools for popular servers even if bridge isn't available
    const stubs: Record<string, MCPTool[]> = {
      filesystem: [
        { name: 'read_file', description: 'Read contents of any file', inputSchema: { path: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'write_file', description: 'Write content to a file', inputSchema: { path: 'string', content: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'list_directory', description: 'List files in a directory', inputSchema: { path: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'search_files', description: 'Search for files matching a pattern', inputSchema: { path: 'string', pattern: 'string' }, serverId: server.id, serverName: server.name },
      ],
      fetch: [
        { name: 'fetch_url', description: 'Fetch and parse web page content', inputSchema: { url: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'fetch_markdown', description: 'Fetch web page as clean markdown', inputSchema: { url: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'search_web', description: 'Search the web and return relevant snippets', inputSchema: { query: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'get_world_news', description: 'Get latest world news headlines', inputSchema: { category: 'string', limit: 'number' }, serverId: server.id, serverName: server.name },
        { name: 'open_world_monitor', description: 'Open a world monitor view for global events', inputSchema: { section: 'string' }, serverId: server.id, serverName: server.name },
      ],
      sqlite: [
        { name: 'query_db', description: 'Run SQL SELECT query on database', inputSchema: { query: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'execute_db', description: 'Run SQL INSERT/UPDATE/DELETE', inputSchema: { query: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'list_tables', description: 'List all tables in the database', inputSchema: {}, serverId: server.id, serverName: server.name },
      ],
      memory: [
        { name: 'remember', description: 'Store a fact for future recall', inputSchema: { content: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'recall', description: 'Search stored memories', inputSchema: { query: 'string' }, serverId: server.id, serverName: server.name },
      ],
      everything: [
        { name: 'get_system_info', description: 'Get system info for platform, host, uptime, and network interfaces', inputSchema: { detail: 'string' }, serverId: server.id, serverName: server.name },
        { name: 'analyze_screen', description: 'Run OCR and summarize what is currently visible on screen', inputSchema: { scope: 'string', mode: 'string' }, serverId: server.id, serverName: server.name },
      ],
    }

    const tools = stubs[server.id] ?? []
    for (const tool of tools) {
      this.toolRegistry.set(tool.name, tool)
    }
  }

  private async sendToolCall(
    server: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>> {
    this.throwIfAborted(signal)

    if (window.nativeBridge?.mcp?.callTool) {
      const raw = await window.nativeBridge.mcp.callTool(server, toolName, args)
      this.throwIfAborted(signal)
      return raw as Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>
    }

    // Fallback: handle filesystem tools with nativeBridge.readFile etc.
    return this.localFallback(server.id, toolName, args, signal)
  }

  private async localFallback(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>> {
    this.throwIfAborted(signal)

    // Best-effort fallback for filesystem tools using existing nativeBridge
    if (serverId === 'filesystem') {
      if (toolName === 'read_file' && window.nativeBridge?.readFile) {
        const r = await window.nativeBridge.readFile(String(args.path))
        this.throwIfAborted(signal)
        return {
          success: r.success,
          content: [{ type: 'text', text: r.content ?? '' }],
          error: r.success ? undefined : 'Read failed',
        }
      }
      if (toolName === 'write_file' && window.nativeBridge?.writeFile) {
        await window.nativeBridge.writeFile(String(args.path), String(args.content))
        return { success: true, content: [{ type: 'text', text: 'File written successfully' }] }
      }
    }

    if (serverId === 'fetch' && (toolName === 'fetch_url' || toolName === 'fetch_markdown' || toolName === 'search_web' || toolName === 'get_world_news' || toolName === 'open_world_monitor')) {
      const query = String(args.query || '').trim()
      const newsUrl = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'
      const monitorUrl = 'https://www.worldometers.info/'
      const rawUrl =
        toolName === 'search_web' ? `https://duckduckgo.com/?q=${encodeURIComponent(query || 'latest world updates')}` :
        toolName === 'get_world_news' ? newsUrl :
        toolName === 'open_world_monitor' ? monitorUrl :
        String(args.url)

      const url = rawUrl
      try {
        const resp = await fetch(`https://r.jina.ai/${url}`, { signal })
        const text = await resp.text()
        this.throwIfAborted(signal)
        return { success: true, content: [{ type: 'text', text: text.slice(0, 5000) }] }
      } catch (e) {
        if (signal?.aborted) {
          return { success: false, content: [], error: `Cancelled ${toolName}` }
        }
        return { success: false, content: [], error: String(e) }
      }
    }

    if (toolName === 'get_system_info' && window.nativeBridge?.monitor?.getSystemInfo) {
      const info = await window.nativeBridge.monitor.getSystemInfo()
      this.throwIfAborted(signal)
      if (!info.success || !info.info) {
        return { success: false, content: [], error: info.message || 'System info unavailable' }
      }

      const payload = info.info
      return {
        success: true,
        content: [{
          type: 'text',
          text: `Platform: ${payload.platform}\nArchitecture: ${payload.arch}\nHost: ${payload.hostname}\nUptime: ${Math.round(payload.uptime)} seconds\nInterfaces: ${(payload.networkInterfaces || []).join(', ')}`,
        }],
      }
    }

    if (toolName === 'analyze_screen' && window.nativeBridge?.captureScreen && window.nativeBridge?.runOCR) {
      const capture = await window.nativeBridge.captureScreen()
      this.throwIfAborted(signal)
      if (!capture?.success || !capture.imageBase64) {
        return { success: false, content: [], error: capture?.message || 'Screen capture failed' }
      }

      const ocr = await window.nativeBridge.runOCR(capture.imageBase64)
      this.throwIfAborted(signal)
      if (!ocr?.success) {
        return { success: false, content: [], error: ocr?.message || 'OCR failed' }
      }

      const text = String(ocr.text || '').slice(0, 1200)
      return {
        success: true,
        content: [{ type: 'text', text: text || 'Screen analyzed but no OCR text was detected.' }],
      }
    }

    return { success: false, content: [], error: `No fallback for ${serverId}.${toolName}` }
  }

  private countServerTools(serverId: string): number {
    return Array.from(this.toolRegistry.values()).filter(t => t.serverId === serverId).length
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(this.CONFIG_KEY, JSON.stringify(Array.from(this.servers.values())))
    } catch { /* ignore */ }
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(this.CONFIG_KEY)
      if (stored) {
        const configs = JSON.parse(stored) as MCPServerConfig[]
        configs.forEach(c => this.servers.set(c.id, c))
        console.log(`[MCP] ðŸ“‹ Loaded ${configs.length} server configs`)
      }
    } catch { /* ignore */ }
  }
}

export const mcpConnector = new MCPConnector()

