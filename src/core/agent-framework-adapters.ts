export type AgentFramework = 'native' | 'langgraph' | 'autogen'

export interface FrameworkExecutionRequest {
  goal: string
  context?: Record<string, unknown>
}

export interface FrameworkExecutionResult {
  success: boolean
  output: string
  framework: AgentFramework
  metadata?: Record<string, unknown>
}

const FRAMEWORK_CONFIG_KEY = 'Pixi.framework.config'

interface FrameworkConfig {
  selected: AgentFramework
  langgraphEndpoint?: string
  autogenEndpoint?: string
}

const DEFAULT_CONFIG: FrameworkConfig = {
  selected: 'native',
}

function loadConfig(): FrameworkConfig {
  try {
    const raw = localStorage.getItem(FRAMEWORK_CONFIG_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw) as FrameworkConfig
    return {
      selected: parsed.selected || 'native',
      langgraphEndpoint: parsed.langgraphEndpoint,
      autogenEndpoint: parsed.autogenEndpoint,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

class AgentFrameworkAdapters {
  private config = loadConfig()

  getConfig(): FrameworkConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<FrameworkConfig>): FrameworkConfig {
    this.config = { ...this.config, ...partial }
    localStorage.setItem(FRAMEWORK_CONFIG_KEY, JSON.stringify(this.config))
    return this.getConfig()
  }

  async execute(request: FrameworkExecutionRequest): Promise<FrameworkExecutionResult> {
    const selected = this.config.selected

    if (selected === 'native') {
      return {
        success: true,
        output: request.goal,
        framework: 'native',
        metadata: { mode: 'pass-through' },
      }
    }

    if (selected === 'langgraph') {
      return this.callFrameworkEndpoint('langgraph', this.config.langgraphEndpoint, request)
    }

    if (selected === 'autogen') {
      return this.callFrameworkEndpoint('autogen', this.config.autogenEndpoint, request)
    }

    return {
      success: false,
      output: 'Unsupported framework selection',
      framework: 'native',
    }
  }

  private async callFrameworkEndpoint(
    framework: 'langgraph' | 'autogen',
    endpoint: string | undefined,
    request: FrameworkExecutionRequest,
  ): Promise<FrameworkExecutionResult> {
    if (!endpoint) {
      return {
        success: false,
        output: `${framework} endpoint is not configured.`,
        framework,
      }
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        return {
          success: false,
          output: `${framework} endpoint error: ${response.status}`,
          framework,
        }
      }

      const payload = (await response.json()) as { output?: string; metadata?: Record<string, unknown> }
      return {
        success: true,
        output: payload.output || '',
        framework,
        metadata: payload.metadata,
      }
    } catch (error) {
      return {
        success: false,
        output: error instanceof Error ? error.message : 'Framework request failed',
        framework,
      }
    }
  }
}

export const agentFrameworkAdapters = new AgentFrameworkAdapters()

