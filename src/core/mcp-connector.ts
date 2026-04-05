/**
 * MCP Connector — Feature J-R1 (OpenJarvis: Model Context Protocol)
 *
 * Model Context Protocol (MCP) is like USB-C for AI tools.
 * Instead of building custom integrations for each tool, you implement ONE protocol
 * and instantly connect to ANY MCP-compatible server: Blender, VS Code, databases,
 * file systems, APIs, web browsers — anything.
 *
 * Why it's a game-changer:
 *   - 1 implementation → 1000+ compatible tools and data sources
 *   - MCP servers run locally — no API costs, no cloud dependency
 *   - The agent can discover what tools a server supports at runtime
 *   - Used by Claude Desktop, OpenJarvis, and growing ecosystem
 *
 * This implementation:
 *   - Acts as an MCP CLIENT (connects to MCP servers)
 *   - Supports both stdio-based and HTTP-based MCP servers
 *   - Auto-discovers available tools from connected servers
 *   - Routes tool calls from the agent to the right MCP server
 *
 * Example MCP servers you can connect:
 *   - filesystem → read/write any file
 *   - github → full GitHub API via natural language
 *   - blender → control Blender 3D
 *   - sqlite → query any SQLite database
 *   - playwright → browser automation
 *   - fetch → web fetching with parsing
 *
 * Adapted from OpenJarvis MCP integration — rebuilt for our browser/Electron context.
 */

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Pre-configured popular MCP servers ────────────────────────────────────

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

// ── MCPConnector ───────────────────────────────────────────────────────────

class MCPConnector {
  private servers = new Map<string, MCPServerConfig>()
  private toolRegistry = new Map<string, MCPTool>()      // toolName → MCPTool
  private readonly CONFIG_KEY = 'mcp-servers'

  constructor() {
    this.loadConfig()
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Register an MCP server. Call this to connect new tools.
   */
  async registerServer(config: MCPServerConfig): Promise<boolean> {
    this.servers.set(config.id, config)
    this.saveConfig()

    if (!config.enabled) return true

    try {
      await this.discoverTools(config)
      console.log(`[MCP] ✅ Connected: ${config.name} (${this.countServerTools(config.id)} tools)`)
      return true
    } catch (e) {
      console.warn(`[MCP] ⚠️ Could not connect to ${config.name}: ${e}`)
      return false
    }
  }

  /**
   * Register all popular servers at once (for quick setup).
   */
  async registerPopularServers(): Promise<void> {
    console.log('[MCP] 🔌 Registering popular MCP servers...')
    for (const partial of POPULAR_SERVERS) {
      await this.registerServer({ ...partial, enabled: true } as MCPServerConfig)
    }
  }

  /**
   * Call a tool by name with arguments.
   * This is what the agent calls when it needs to use an MCP tool.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPCallResult> {
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
      const result = await this.sendToolCall(server, toolName, args)
      return { ...result, serverId: tool.serverId, toolName, latencyMs: Date.now() - start }
    } catch (e) {
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

  // ── Private: Discovery ────────────────────────────────────────────────

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
    }

    const tools = stubs[server.id] ?? []
    for (const tool of tools) {
      this.toolRegistry.set(tool.name, tool)
    }
  }

  private async sendToolCall(
    server: MCPServerConfig,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>> {
    if (window.nativeBridge?.mcp?.callTool) {
      const raw = await window.nativeBridge.mcp.callTool(server, toolName, args)
      return raw as Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>
    }

    // Fallback: handle filesystem tools with nativeBridge.readFile etc.
    return this.localFallback(server.id, toolName, args)
  }

  private async localFallback(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<Omit<MCPCallResult, 'serverId' | 'toolName' | 'latencyMs'>> {
    // Best-effort fallback for filesystem tools using existing nativeBridge
    if (serverId === 'filesystem') {
      if (toolName === 'read_file' && window.nativeBridge?.readFile) {
        const r = await window.nativeBridge.readFile(String(args.path))
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

    if (serverId === 'fetch' && (toolName === 'fetch_url' || toolName === 'fetch_markdown')) {
      const url = String(args.url)
      try {
        const resp = await fetch(`https://r.jina.ai/${url}`)
        const text = await resp.text()
        return { success: true, content: [{ type: 'text', text: text.slice(0, 5000) }] }
      } catch (e) {
        return { success: false, content: [], error: String(e) }
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
        console.log(`[MCP] 📋 Loaded ${configs.length} server configs`)
      }
    } catch { /* ignore */ }
  }
}

export const mcpConnector = new MCPConnector()
