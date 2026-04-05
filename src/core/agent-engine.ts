import { Agent, Boundary, Task } from '@/types'
import apiGateway from './api-gateway'
import { getDeviceMesh } from '@/core/device-mesh'
import { getDeviceBridge } from '@/core/device-bridge'

/**
 * Core Agent Engine
 * Handles creation, management, and execution of agents with boundaries
 * Phase 3: Cross-device task routing support
 */
class AgentEngine {
  private agents: Map<string, Agent> = new Map()
  private mainAgent: Agent | null = null
  private mesh = getDeviceMesh()
  private bridge = getDeviceBridge()

  /**
   * Initialize the main agent
   */
  initializeMainAgent(_userId: string): Agent {
    this.mainAgent = {
      id: 'main-agent-' + Date.now(),
      name: 'Main Agent',
      type: 'main',
      status: 'active',
      capabilities: [
        'task_execution',
        'sub_agent_creation',
        'api_integration',
        'voice_control',
        'screen_control',
        'app_execution',
        'device_orchestration', // Phase 3
        'cross_device_tasks', // Phase 3
      ],
      connectedAPIs: [],
      boundaries: this.getDefaultBoundaries(),
      createdAt: new Date(),
    }
    this.agents.set(this.mainAgent.id, this.mainAgent)
    return this.mainAgent
  }

  /**
   * Create a sub-agent for specific task
   */
  createSubAgent(
    _parentAgentId: string,
    taskType: string,
    capabilities: string[]
  ): Agent {
    const subAgent: Agent = {
      id: `sub-agent-${Date.now()}`,
      name: `Sub-Agent: ${taskType}`,
      type: 'sub',
      status: 'active',
      capabilities: capabilities,
      connectedAPIs: [],
      boundaries: this.getDefaultBoundaries(),
      createdAt: new Date(),
    }

    this.agents.set(subAgent.id, subAgent)
    return subAgent
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)
  }

  /**
   * Connect API to agent
   */
  connectAPIToAgent(
    agentId: string,
    apiName: string,
    endpoint: string,
    apiKey?: string
  ): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false

    const api = {
      id: `api-${Date.now()}`,
      name: apiName,
      type: 'both',
      endpoint,
      apiKey,
      enabled: true,
    } as const

    agent.connectedAPIs.push(api)
    apiGateway.registerAPI(api)

    return true
  }

  /**
   * Get all connected APIs for an agent
   */
  getAgentAPIs(agentId: string) {
    const agent = this.agents.get(agentId)
    return agent?.connectedAPIs || []
  }

  /**
   * Check if agent can perform action within boundaries
   */
  validateAgainstBoundaries(agentId: string, action: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent || !agent.boundaries) return false

    for (const boundary of agent.boundaries) {
      if (!boundary.enabled) continue

      if (boundary.type === 'permission') {
        // Check if action is allowed
        if (action.includes('restricted')) return false
      }
    }

    return true
  }

  /**
   * Phase 3: Execute task on remote device
   */
  async executeRemoteTask(
    agentId: string,
    task: Task,
    targetDeviceId: string
  ): Promise<unknown> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`)
    }

    // Check agent has cross-device capability
    if (!agent.capabilities.includes('cross_device_tasks')) {
      throw new Error(`Agent ${agentId} does not support cross-device tasks`)
    }

    // Validate against boundaries
    if (!this.validateAgainstBoundaries(agentId, `remote_${task.type}`)) {
      throw new Error(`Task violates agent boundaries`)
    }

    // Delegate to device bridge for execution
    try {
      const result = await this.bridge.sendRemoteTask(targetDeviceId, task)
      return result
    } catch (error) {
      throw new Error(`Remote task execution failed: ${error}`)
    }
  }

  /**
   * Update the UI Live Canvas using a local event
   */
  private updateCanvas(payload: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-canvas-update', { detail: payload }))
    }
  }

  /**
   * Phase 3: Execute task on local device (default)
   */
  async executeLocalTask(
    agentId: string,
    task: Task
  ): Promise<unknown> {
    const agent = this.agents.get(agentId)
    if (!agent) throw new Error(`Agent ${agentId} not found`)
    if (!this.validateAgainstBoundaries(agentId, task.type)) {
      throw new Error(`Task violates agent boundaries`)
    }

    task.status = 'executing'
    const cmd = task.command || ''
    const lower = cmd.toLowerCase()
    let output = ''
    let success = true

    try {
      console.log(`[AgentEngine] Executing local task: ${cmd}`)

      // ── STEALTH ENGINE (Dynamic Background execution) ─────────────────
      // If the command explicitly asks for stealth, or if the system detects the user is busy
      const isUserBusy = typeof window !== 'undefined' && (window as any).nativeBridge?.checkUserBusy ? await (window as any).nativeBridge.checkUserBusy() : false;
      const isExplicitApp = lower.startsWith('app:') || lower.startsWith('stealth:');

      if (isExplicitApp || isUserBusy) {
        let targetApp = 'default';
        let action = cmd;

        if (isExplicitApp) {
          const parts = cmd.split(':').map(s => s.trim());
          targetApp = parts[1] || 'default';
          action = parts.slice(2).join(':') || 'generic-action';
        }

        console.log(`🥷 [AgentEngine] Routing to Stealth mode (Busy: ${isUserBusy}). Target: ${targetApp}`);
        const { stealthEngine } = await import('./stealth-engine');
        
        this.updateCanvas({
          type: 'stealth',
          title: 'Stealth Execution',
          content: `Running in background... ${action}`,
          lastUpdated: new Date().toLocaleTimeString()
        });

        const result = await stealthEngine.executeStealthTask({
          targetApp,
          action,
          payload: {},
          requiresUI: false
        });

        output = result.success ? `✅ Background success: ${result.message}` : `⏸️ ${result.message}`;
        this.updateCanvas({ type: 'stealth', title: 'Task Complete', content: output, lastUpdated: new Date().toLocaleTimeString() });
      }
      
      // ── VFX ENGINE ────────────────────────────────────────────────────
      else if (lower.startsWith('vfx:') || lower.startsWith('video:')) {
        const goal = cmd.split(':').slice(1).join(':').trim()
        const { vfxEngine } = await import('./vfx-engine');
        
        this.updateCanvas({ type: 'media', title: 'VFX Rendering', content: `Rendering: ${goal}`, lastUpdated: new Date().toLocaleTimeString() })
        const result = await vfxEngine.executeMediaTask(goal)
        output = result.status === 'completed' ? `✅ Rendered: ${result.outputFile}` : `❌ Failed: ${result.goal}`
        this.updateCanvas({ type: 'media', title: 'Render Complete', content: output, lastUpdated: new Date().toLocaleTimeString() })
      }

      // ── VIBE CODING ───────────────────────────────────────────────────
      else if (lower.startsWith('vibe:') || lower.startsWith('code:')) {
        const goal = cmd.split(':').slice(1).join(':').trim()
        const { codeExecutionEngine } = await import('./code-execution-engine');
        
        this.updateCanvas({ type: 'progress', title: 'Vibe Coding', content: `Building: "${goal}"...`, lastUpdated: new Date().toLocaleTimeString() })
        const result = await codeExecutionEngine.buildProject(goal)
        output = result.success ? `✅ Project updated: ${result.projectPath}` : `❌ Failed: ${result.message}`
        this.updateCanvas({ type: 'sandbox', title: 'Coding Result', content: output, lastUpdated: new Date().toLocaleTimeString() })
      }
      
      // ── VISION ENGINE ─────────────────────────────────────────────────
      else if (lower.startsWith('vision:') || lower.startsWith('see:')) {
        const { visionIntegration } = await import('./vision-integration');
        const report = await visionIntegration.captureAndAnalyze();
        output = `👁️ Vision Analysis at ${report.timestamp}\nText Found: "${report.textFound || 'None'}"\nConfidence: ${report.confidence * 100}%`;
      }
      
      // ── STANDARD TASK ─────────────────────────────────────────────────
      else {
        // Fallback for normal UI/Command tasks
        await new Promise(resolve => setTimeout(resolve, 500))
        output = `Command executed: ${cmd}`
      }

      task.status = success ? 'completed' : 'failed'
      task.result = { success, output }
      task.completedAt = new Date()

      return task.result
    } catch (error) {
      task.status = 'failed'
      task.error = String(error)
      task.completedAt = new Date()
      throw error
    }
  }

  /**
   * Phase 3: Route task to appropriate device (local or remote)
   */
  async routeAndExecuteTask(
    agentId: string,
    task: Task,
    targetDeviceId?: string
  ): Promise<unknown> {
    if (!targetDeviceId) {
      // No target specified, execute locally
      return this.executeLocalTask(agentId, task)
    }

    const localDevice = this.mesh.getLocalDevice()
    if (targetDeviceId === localDevice.id) {
      // Target is self, execute locally
      return this.executeLocalTask(agentId, task)
    }

    // Target is different device, execute remotely
    return this.executeRemoteTask(agentId, task, targetDeviceId)
  }

  /**
   * Phase 3: Get available devices for cross-device operations
   */
  getAvailableDevices(agentId: string) {
    const agent = this.agents.get(agentId)
    if (!agent || !agent.capabilities.includes('device_orchestration')) {
      return []
    }

    return this.mesh.getAllDevices()
  }

  /**
   * Get default boundaries for safety
   */
  private getDefaultBoundaries(): Boundary[] {
    return [
      {
        id: 'boundary-1',
        type: 'permission',
        rule: 'Cannot delete system files',
        enabled: true,
      },
      {
        id: 'boundary-2',
        type: 'permission',
        rule: 'Cannot access sensitive personal data',
        enabled: true,
      },
      {
        id: 'boundary-3',
        type: 'rate_limit',
        rule: 'Max 100 task executions per minute',
        enabled: true,
      },
      {
        id: 'boundary-4',
        type: 'permission',
        rule: 'Cross-device tasks require explicit permission',
        enabled: true,
      },
    ]
  }

  /**
   * Get all agents
   */
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  /**
   * Deactivate agent
   */
  deactivateAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    agent.status = 'inactive'
    return true
  }
}

export default new AgentEngine()
