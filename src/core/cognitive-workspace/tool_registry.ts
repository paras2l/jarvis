/**
 * Tool Registry
 * 
 * Inside Action Layer
 * 
 * Agents dynamically select tools based on:
 * - Command parsing
 * - Tool capabilities matching
 * - Success probability
 * 
 * Tools available:
 * - open_app
 * - search_web
 * - write_file
 * - run_script
 * - control_os
 */

export type ToolCategory =
  | 'app_control'
  | 'file_system'
  | 'web_search'
  | 'script_execution'
  | 'system_control'
  | 'communication'
  | 'analysis'

export type ToolCapability =
  | 'open'
  | 'close'
  | 'write'
  | 'read'
  | 'search'
  | 'execute'
  | 'navigate'
  | 'monitor'
  | 'control'

export interface ToolSignature {
  name: string
  category: ToolCategory
  description: string
  capabilities: ToolCapability[]
  
  // Input/output spec
  requiredParams: string[]
  optionalParams?: string[]
  returns: string // Type of return value
  
  // Safety and meta
  isDestructive: boolean // Can cause data loss
  requiresPermission: boolean
  estimatedDuration: number // ms, rough estimate
  
  // Success factors
  successProbability: number // 0-1, baseline
  failureReasons?: string[]
}

/**
 * Tool Implementation
 */
export interface Tool extends ToolSignature {
  execute: (params: Record<string, any>) => Promise<any>
  validate: (params: Record<string, any>) => { valid: boolean; error?: string }
}

/**
 * Tool Registry Manager
 * 
 * Central registry of all available tools
 */
export class ToolRegistryManager {
  private tools: Map<string, Tool> = new Map()
  private categories: Map<ToolCategory, string[]> = new Map()

  constructor() {
    this.initializeDefaultTools()
  }

  /**
   * Register a new tool
   */
  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool)

    // Category indexing
    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, [])
    }
    this.categories.get(tool.category)!.push(tool.name)
  }

  /**
   * Get tool by name
   */
  public getTool(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  /**
   * Get all tools in category
   */
  public getToolsByCategory(category: ToolCategory): Tool[] {
    const toolNames = this.categories.get(category) || []
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => !!t)
  }

  /**
   * Get tools that have specific capability
   */
  public getToolsByCapability(capability: ToolCapability): Tool[] {
    return Array.from(this.tools.values()).filter((t) =>
      t.capabilities.includes(capability),
    )
  }

  /**
   * Get all tools
   */
  public getAllTools(): Tool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Match tools for intent
   * 
   * Returns ranked list of tools that could satisfy the intent
   */
  public matchToolsForIntent(
    intent: string,
    requiredCapabilities?: ToolCapability[],
  ): { tool: Tool; score: number }[] {
    const allTools = this.getAllTools()
    const scored: { tool: Tool; score: number }[] = []

    allTools.forEach((tool) => {
      let score = 0

      // Capability matching
      if (requiredCapabilities) {
        const matchedCapabilities = requiredCapabilities.filter((cap) =>
          tool.capabilities.includes(cap),
        )
        score += (matchedCapabilities.length / requiredCapabilities.length) * 50
      }

      // Intent matching (rough text-based)
      const intentLower = intent.toLowerCase()
      const nameLower = tool.name.toLowerCase()
      const descLower = tool.description.toLowerCase()

      if (nameLower.includes(intentLower) || intentLower.includes(nameLower)) {
        score += 30
      }

      if (descLower.includes(intentLower) || intentLower.includes(descLower)) {
        score += 20
      }

      // Success probability bonus
      score += tool.successProbability * 10

      // Safety penalty for destructive tools (user should confirm)
      if (tool.isDestructive) {
        score -= 15
      }

      if (score > 0) {
        scored.push({ tool, score })
      }
    })

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score)
    return scored
  }

  /**
   * Execute tool
   */
  public async executeTool(toolName: string, params: Record<string, any>): Promise<any> {
    const tool = this.getTool(toolName)
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`)
    }

    // Validate params
    const validation = tool.validate(params)
    if (!validation.valid) {
      throw new Error(`Validation failed for ${toolName}: ${validation.error}`)
    }

    // Execute
    return tool.execute(params)
  }

  /**
   * Get tool registry diagnostics
   */
  public getDiagnostics() {
    return {
      totalTools: this.tools.size,
      categories: Object.fromEntries(
        Array.from(this.categories.entries()).map(([cat, names]) => [cat, names.length]),
      ),
      tools: this.getAllTools().map((t) => ({
        name: t.name,
        category: t.category,
        capabilities: t.capabilities,
        isDestructive: t.isDestructive,
        successProbability: t.successProbability,
      })),
    }
  }

  /**
   * Initialize default tools
   */
  private initializeDefaultTools(): void {
    // App control tools
    this.registerTool(this.createOpenAppTool())
    this.registerTool(this.createCloseAppTool())

    // File system tools
    this.registerTool(this.createWriteFileTool())
    this.registerTool(this.createReadFileTool())
    this.registerTool(this.createDeleteFileTool())

    // Web search
    this.registerTool(this.createSearchWebTool())

    // Script execution
    this.registerTool(this.createRunScriptTool())

    // System control
    this.registerTool(this.createSystemControlTool())
  }

  // ────────────────────────────────────────────
  // Tool Implementations
  // ────────────────────────────────────────────

  private createOpenAppTool(): Tool {
    return {
      name: 'open_app',
      category: 'app_control',
      description: 'Open an application by name',
      capabilities: ['open'],
      requiredParams: ['app_name'],
      optionalParams: ['args'],
      returns: 'boolean',
      isDestructive: false,
      requiresPermission: false,
      estimatedDuration: 2000,
      successProbability: 0.9,
      failureReasons: ['app_not_found', 'already_running', 'permission_denied'],
      validate: (params) => {
        if (!params.app_name || typeof params.app_name !== 'string') {
          return { valid: false, error: 'app_name is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Opening app: ${params.app_name}`)
        // Implementation would use electron or system APIs
        return { success: true, app: params.app_name }
      },
    }
  }

  private createCloseAppTool(): Tool {
    return {
      name: 'close_app',
      category: 'app_control',
      description: 'Close a running application',
      capabilities: ['close'],
      requiredParams: ['app_name'],
      optionalParams: [],
      returns: 'boolean',
      isDestructive: false,
      requiresPermission: false,
      estimatedDuration: 500,
      successProbability: 0.85,
      failureReasons: ['app_not_running', 'unsaved_changes', 'permission_denied'],
      validate: (params) => {
        if (!params.app_name || typeof params.app_name !== 'string') {
          return { valid: false, error: 'app_name is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Closing app: ${params.app_name}`)
        return { success: true, app: params.app_name }
      },
    }
  }

  private createWriteFileTool(): Tool {
    return {
      name: 'write_file',
      category: 'file_system',
      description: 'Write content to a file',
      capabilities: ['write'],
      requiredParams: ['path', 'content'],
      optionalParams: ['encoding', 'mode'],
      returns: 'boolean',
      isDestructive: true, // Can overwrite existing files
      requiresPermission: true,
      estimatedDuration: 100,
      successProbability: 0.95,
      failureReasons: ['path_invalid', 'permission_denied', 'disk_full'],
      validate: (params) => {
        if (!params.path || !params.content) {
          return { valid: false, error: 'path and content are required' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Writing file: ${params.path}`)
        return { success: true, path: params.path, bytes: params.content.length }
      },
    }
  }

  private createReadFileTool(): Tool {
    return {
      name: 'read_file',
      category: 'file_system',
      description: 'Read content from a file',
      capabilities: ['read'],
      requiredParams: ['path'],
      optionalParams: ['encoding'],
      returns: 'string',
      isDestructive: false,
      requiresPermission: false,
      estimatedDuration: 50,
      successProbability: 0.98,
      failureReasons: ['file_not_found', 'permission_denied', 'encoding_error'],
      validate: (params) => {
        if (!params.path || typeof params.path !== 'string') {
          return { valid: false, error: 'path is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Reading file: ${params.path}`)
        return { success: true, path: params.path, content: '...' }
      },
    }
  }

  private createDeleteFileTool(): Tool {
    return {
      name: 'delete_file',
      category: 'file_system',
      description: 'Delete a file (permanently)',
      capabilities: ['control'],
      requiredParams: ['path'],
      optionalParams: [],
      returns: 'boolean',
      isDestructive: true, // Data loss operation
      requiresPermission: true,
      estimatedDuration: 50,
      successProbability: 0.95,
      failureReasons: ['file_not_found', 'permission_denied', 'file_locked'],
      validate: (params) => {
        if (!params.path || typeof params.path !== 'string') {
          return { valid: false, error: 'path is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Deleting file: ${params.path}`)
        return { success: true, path: params.path }
      },
    }
  }

  private createSearchWebTool(): Tool {
    return {
      name: 'search_web',
      category: 'web_search',
      description: 'Search the web for information',
      capabilities: ['search'],
      requiredParams: ['query'],
      optionalParams: ['results_count'],
      returns: 'array',
      isDestructive: false,
      requiresPermission: false,
      estimatedDuration: 3000,
      successProbability: 0.9,
      failureReasons: ['search_failed', 'no_results', 'network_error'],
      validate: (params) => {
        if (!params.query || typeof params.query !== 'string') {
          return { valid: false, error: 'query is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (params) => {
        console.log(`[Tool] Searching web: ${params.query}`)
        return { success: true, results: [] }
      },
    }
  }

  private createRunScriptTool(): Tool {
    return {
      name: 'run_script',
      category: 'script_execution',
      description: 'Execute a script or command',
      capabilities: ['execute'],
      requiredParams: ['script'],
      optionalParams: ['language', 'timeout'],
      returns: 'string',
      isDestructive: true, // Script can modify system
      requiresPermission: true,
      estimatedDuration: 5000,
      successProbability: 0.8,
      failureReasons: ['syntax_error', 'runtime_error', 'timeout', 'permission_denied'],
      validate: (params) => {
        if (!params.script || typeof params.script !== 'string') {
          return { valid: false, error: 'script is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (_params) => {
        console.log(`[Tool] Running script`)
        return { success: true, output: '' }
      },
    }
  }

  private createSystemControlTool(): Tool {
    return {
      name: 'control_os',
      category: 'system_control',
      description: 'Control operating system features',
      capabilities: ['control', 'monitor'],
      requiredParams: ['action'],
      optionalParams: ['target'],
      returns: 'object',
      isDestructive: false,
      requiresPermission: true,
      estimatedDuration: 1000,
      successProbability: 0.85,
      failureReasons: ['action_not_supported', 'permission_denied', 'resource_unavailable'],
      validate: (params) => {
        if (!params.action || typeof params.action !== 'string') {
          return { valid: false, error: 'action is required and must be string' }
        }
        return { valid: true }
      },
      execute: async (_params) => {
        console.log(`[Tool] OS control: ${_params.action}`)
        return { success: true, action: _params.action }
      },
    }
  }
}

/**
 * Singleton tool registry instance
 */
let globalToolRegistry: ToolRegistryManager | null = null

export function getToolRegistry(): ToolRegistryManager {
  if (!globalToolRegistry) {
    globalToolRegistry = new ToolRegistryManager()
  }
  return globalToolRegistry
}

export function resetToolRegistry(): ToolRegistryManager {
  globalToolRegistry = new ToolRegistryManager()
  return globalToolRegistry
}

export default ToolRegistryManager
