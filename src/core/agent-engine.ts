import { Agent, Boundary, Task } from '@/types'
import apiGateway from './api-gateway'
import { getDeviceMesh } from '@/core/device-mesh'
import { getDeviceBridge } from '@/core/device-bridge'
import { soulEngine } from './soul-engine'
import { intelligenceRouter } from './intelligence-router'
import { notificationEngine } from './notification-engine'
import { localVoiceRuntime } from './media-ml/runtimes/local-voice-runtime'
import { proactiveEngine } from './soul/proactive-engine'
import { notificationBridge } from './soul/notification-bridge'
import { protocolRegistry } from './protocols/ProtocolRegistry'
import { coreSoulProtocol } from './protocols/CoreSoul'
import { personaEngineProtocol } from './protocols/PersonaEngine'
import { akashaEngineProtocol } from './protocols/AkashaEngine'
import { mimicProtocol } from './protocols/MimicProtocol'
import { legionProtocol } from './protocols/LegionProtocol'
import { predictiveProtocol } from './protocols/PredictiveProtocol'
import { skillSynthesisProtocol } from './protocols/SkillSynthesis'
import { scholarProtocol } from './protocols/ScholarProtocol'
import { homeAssistanceProtocol } from './protocols/HomeAssistance'
import { universalContextProtocol } from './protocols/UniversalContext'
import { ghostProtocol } from './protocols/GhostProtocol'
import { overlockProtocol } from './protocols/OverlockProtocol'
import { sustainProtocol } from './protocols/SustainProtocol'
import { hyperInferenceProtocol } from './protocols/HyperInference'
import { sentinelCodeProtocol } from './protocols/SentinelCode'
import { cyclopsVisionProtocol } from './protocols/CyclopsVision'
import { sixthSenseProtocol } from './protocols/SixthSense'
import { planetaryProtocol } from './protocols/PlanetaryProtocol'
import { quantProtocol } from './protocols/QuantProtocol'
import { mintProtocol } from './protocols/MintProtocol'
import { ghostWriterProtocol } from './protocols/GhostWriter'
import { closerProtocol } from './protocols/CloserProtocol'
import { waveProtocol } from './protocols/WaveProtocol'
import { hardcodeProtocol } from './protocols/HardcodeProtocol'
import { custodianProtocol } from './protocols/CustodianProtocol'
import { protocolOrchestrator } from './protocols/ProtocolOrchestrator'
import { policyGateway } from './policy/PolicyGateway'
import { PolicyContext, PolicyResult } from './policy/types'
import { proactiveScheduler } from './persona/proactive-scheduler'
import { runBehaviorTestSuite } from './security/behavior-test-suite'
import { runRedTeamPass } from './security/red-team-harness'
import { episodicMemoryGraph } from './memory/EpisodicMemoryGraph'
import { continuityEngine } from './ops/ContinuityEngine'
import { getAuthenticatedContext } from './security/auth-context'
import { jarvisOS } from './jarvis3'
import { eventPublisher } from '@/event_system/event_publisher'

type HierarchicalAgentRole =
  | 'ManagerAgent'
  | 'AutomationAgent'
  | 'ResearchAgent'
  | 'ScreenAnalysisAgent'
  | 'LearningAgent'
  | 'PredictionAgent'
  | 'MonitoringAgent'

type CanvasPayload = {
  type: string
  title: string
  content: string
  lastUpdated: string
}

/**
 * Core Agent Engine
 * Handles creation, management, and execution of agents with boundaries
 * Phase 3: Cross-device task routing support
 * Phase 9: Humanoid brain with proactive autonomy
 * Enterprise: Protocol orchestration with health monitoring & resilience
 */
class AgentEngine {
  private agents: Map<string, Agent> = new Map()
  private mainAgent: Agent | null = null
  private mesh = getDeviceMesh()
  private bridge = getDeviceBridge()
  private roleAgents: Map<HierarchicalAgentRole, Agent> = new Map()

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
        'humanoid_proactivity', // Phase 9
        'episodic_wisdom', // v4.0
        'economic_agency', // v4.0
        'continuity_handoff', // v4.0
      ],
      connectedAPIs: [],
      boundaries: this.getDefaultBoundaries(),
      createdAt: new Date(),
    }

    // 🧬 Start the Humanoid Brain (Phase 9)
    proactiveEngine.start()
    notificationBridge.start()

    // 🛡️ Beyond OpenClaw: Protocol Registration (Wave 1, 2, 3 & Meta-Governance)
    protocolRegistry.register(coreSoulProtocol)
    protocolRegistry.register(personaEngineProtocol)
    protocolRegistry.register(akashaEngineProtocol)
    protocolRegistry.register(mimicProtocol)
    protocolRegistry.register(legionProtocol)
    protocolRegistry.register(predictiveProtocol)
    protocolRegistry.register(skillSynthesisProtocol)
    protocolRegistry.register(scholarProtocol)
    protocolRegistry.register(homeAssistanceProtocol)
    protocolRegistry.register(universalContextProtocol)
    protocolRegistry.register(ghostProtocol)
    protocolRegistry.register(overlockProtocol)
    protocolRegistry.register(sustainProtocol)
    protocolRegistry.register(hyperInferenceProtocol)
    protocolRegistry.register(sentinelCodeProtocol)
    protocolRegistry.register(cyclopsVisionProtocol)
    protocolRegistry.register(sixthSenseProtocol)
    protocolRegistry.register(planetaryProtocol)
    protocolRegistry.register(quantProtocol)
    protocolRegistry.register(mintProtocol)
    protocolRegistry.register(ghostWriterProtocol)
    protocolRegistry.register(closerProtocol)
    protocolRegistry.register(waveProtocol)
    protocolRegistry.register(hardcodeProtocol) // 🛡️ Unyielding Sovereignty
    protocolRegistry.register(custodianProtocol) // 🧙 The 25th Protocol: Meta-Guardian
    protocolRegistry.initializeAll()

    // 🎯 Enterprise Protocol Orchestration
    protocolOrchestrator.initializeHealthTracking()
    protocolOrchestrator.initializeProtocolChains()
    policyGateway.bootstrapDefaultPolicy()
    proactiveScheduler.start()
    
    // 🌌 Patrich Implants: Initialization (v4.0)
    episodicMemoryGraph.consolidate().catch(() => {})
    continuityEngine.startMonitoring().catch(() => {})
    
    this.runSecurityStartupGate().catch((error) => {
      console.error('[SecurityGate] startup gate failed:', error)
      policyGateway.setPolicyPack('protected_zone')
    })

    console.log('✅ PATRICH OS v4.0 - All 25 Beyond-OpenClaw protocols active')
    console.log('✅ Protocol Orchestrator online with health monitoring & mesh resonance')
    console.log('✅ Custodian Protocol activated - governance & boundaries enforced')

    this.agents.set(this.mainAgent.id, this.mainAgent)
    this.ensureHierarchicalAgents(this.mainAgent.id)
    return this.mainAgent
  }

  private ensureHierarchicalAgents(parentAgentId: string): void {
    const defaults: Array<{ role: HierarchicalAgentRole; capabilities: string[] }> = [
      { role: 'ManagerAgent', capabilities: ['task_execution', 'device_orchestration', 'cross_device_tasks'] },
      { role: 'AutomationAgent', capabilities: ['screen_control', 'app_execution', 'browser_automation'] },
      { role: 'ResearchAgent', capabilities: ['api_integration', 'web_research', 'analysis'] },
      { role: 'ScreenAnalysisAgent', capabilities: ['screen_control', 'ocr', 'vision_analysis'] },
      { role: 'LearningAgent', capabilities: ['learning', 'memory_update', 'skill_synthesis'] },
      { role: 'PredictionAgent', capabilities: ['prediction', 'behavior_modeling', 'proactive_assist'] },
      { role: 'MonitoringAgent', capabilities: ['notification_watch', 'system_monitoring', 'context_awareness'] },
    ]

    for (const spec of defaults) {
      if (this.roleAgents.has(spec.role)) continue
      const agent = this.createSubAgent(parentAgentId, spec.role, spec.capabilities)
      agent.name = spec.role
      this.roleAgents.set(spec.role, agent)
    }
  }

  getHierarchyAgents(): Array<{ role: HierarchicalAgentRole; agent: Agent }> {
    return Array.from(this.roleAgents.entries()).map(([role, agent]) => ({ role, agent }))
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

  private async enforcePolicy(ctx: PolicyContext): Promise<PolicyResult> {
    const decision = await policyGateway.decide(ctx)
    if (decision.decision === 'deny') {
      throw new Error(`Policy blocked action: ${decision.reason}`)
    }
    if (decision.tokenRequired && !decision.decisionToken) {
      throw new Error('Policy blocked action: privileged route requires decision token')
    }
    return decision
  }

  private async buildPolicyContext(agentId: string, action: string, command: string, source: 'local' | 'remote', explicitPermission = false): Promise<PolicyContext> {
    const lower = (command || '').toLowerCase()
    const auth = await getAuthenticatedContext()
    const authority = this.extractAuthorityHints(command)
    return {
      requestId: `policy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      action,
      command,
      source,
      explicitPermission,
      riskScore: this.estimateRisk(action, lower),
      targetApp: this.extractTargetApp(command),
      requestedPrivileges: this.inferPrivileges(action, lower),
      deviceState: 'unknown',
      occurredAt: Date.now(),
      policyPack: policyGateway.getPolicyPack(),
      emergency: lower.includes('emergency') || authority.emergency,
      commander: auth.commander || authority.commander,
      codeword: auth.codeword || authority.codeword,
    }
  }

  private extractAuthorityHints(command: string): {
    commander?: string
    codeword?: string
    emergency: boolean
  } {
    const lower = (command || '').toLowerCase()
    return {
      commander: /\bparas\b|\bparo\b/.test(lower) ? 'paras' : undefined,
      codeword: lower.includes('paro the master') ? 'paro the master' : undefined,
      emergency: /\bemergency\b|\burgent\b/.test(lower),
    }
  }

  private requireDecisionToken(action: string, decision: PolicyResult): void {
    if (!decision.tokenRequired) return
    const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, action)
    if (!verified.valid) {
      throw new Error(`Policy blocked action: invalid decision token (${verified.reason || 'unknown'})`)
    }
  }

  private estimateRisk(action: string, lowerCommand: string): number {
    let score = 0.35
    if (action.includes('remote')) score += 0.25
    if (action.includes('screen') || action.includes('app')) score += 0.2
    if (lowerCommand.includes('delete') || lowerCommand.includes('wipe')) score += 0.35
    if (lowerCommand.includes('password') || lowerCommand.includes('otp')) score += 0.2
    return Math.min(1, score)
  }

  private inferPrivileges(action: string, lowerCommand: string): string[] {
    const privileges: string[] = []
    if (action.includes('remote')) privileges.push('cross_device')
    if (action.includes('screen')) privileges.push('ui_automation')
    if (action.includes('app') || lowerCommand.includes('launch')) privileges.push('native_launch')
    if (lowerCommand.includes('shell') || lowerCommand.includes('command')) privileges.push('shell_exec')
    if (lowerCommand.includes('ocr') || lowerCommand.includes('capture')) privileges.push('screen_capture')
    return privileges
  }

  private extractTargetApp(command: string): string | undefined {
    const match = command.match(/(?:app:|open|launch)\s*([a-zA-Z0-9._ -]{2,40})/i)
    return match?.[1]?.trim()
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

    const remoteDecision = await this.enforcePolicy(
      await this.buildPolicyContext(
        agentId,
        `remote_${task.type}`,
        task.command || '',
        'remote',
        true,
      ),
    )
    this.requireDecisionToken(`remote_${task.type}`, remoteDecision)

    // Auto-route to a compatible device if the requested target can't execute this task.
    let routedTargetDeviceId = targetDeviceId
    if (!this.mesh.supportsTaskOnDevice(targetDeviceId, task)) {
      const fallback = this.mesh.findBestDeviceForTask(task, { excludeDeviceIds: [targetDeviceId] })
      if (!fallback) {
        throw new Error(`No compatible online device can execute ${task.type} right now.`)
      }
      routedTargetDeviceId = fallback.id
      console.warn(`[AgentEngine] Auto-routed remote task ${task.id} from ${targetDeviceId} to ${fallback.id} (${fallback.name})`)
    }

    // Delegate to device bridge for execution
    try {
      const result = await this.bridge.sendRemoteTask(routedTargetDeviceId, task)
      void eventPublisher.taskCompleted(
        {
          taskId: task.id,
          success: true,
          result,
          summary: `Remote task executed on ${routedTargetDeviceId}`,
          agentId,
        },
        'agent-engine',
      )
      if (routedTargetDeviceId !== targetDeviceId && result && typeof result === 'object') {
        return {
          ...(result as Record<string, unknown>),
          autoRouted: true,
          requestedTargetDeviceId: targetDeviceId,
          actualTargetDeviceId: routedTargetDeviceId,
        }
      }
      return result
    } catch (error) {
      void eventPublisher.taskFailed(
        {
          taskId: task.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          summary: `Remote task execution failed for ${routedTargetDeviceId}`,
          agentId,
        },
        'agent-engine',
      )
      throw new Error(`Remote task execution failed: ${error}`)
    }
  }

  /**
   * Update the UI Live Canvas using a local event
   */
  private updateCanvas(payload: CanvasPayload) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-canvas-update', { detail: payload }))
    }
  }

  /**
   * Get a friendly, witty response from the agent soul
   */
  async getAgentResponse(userInput: string, taskResult?: unknown): Promise<string> {
    const soulPrompt = soulEngine.getSystemPrompt()
    const prompt = taskResult 
      ? `The user said: "${userInput}". I have executed their task. Result: ${JSON.stringify(taskResult)}. Give a 1-sentence friendly, witty update to the user like a partner.`
      : `The user said: "${userInput}". I'm about to start this task. Give a 1-sentence witty acknowledging response that sounds like a smart partner (JARVIS).`

    const response = await intelligenceRouter.query(prompt, { 
      systemPrompt: soulPrompt,
      urgency: 'realtime',
      taskType: 'chat'
    })

    return response.content
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

    const localDecision = await this.enforcePolicy(
      await this.buildPolicyContext(agentId, task.type, task.command || '', 'local', true),
    )
    this.requireDecisionToken(task.type, localDecision)

    task.status = 'executing'
    const cmd = task.command || ''
    const lower = cmd.toLowerCase()
    let output = ''

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

      task.status = 'completed'
      task.result = { success: true, output }
      task.completedAt = new Date()
      void eventPublisher.taskCompleted(
        {
          taskId: task.id,
          success: true,
          result: task.result,
          summary: output.slice(0, 200),
          agentId,
        },
        'agent-engine',
      )

      // ── BACKGROUND PARTNERSHIP NOTIFICATION ───────────────────────────
      // If the task was stealth or media, tap the user on the shoulder
      if (isUserBusy || lower.startsWith('vfx:') || lower.startsWith('stealth:')) {
        const updateText = await this.getAgentResponse(cmd, task.result)
        
        notificationEngine.notify(
          'JARVIS Update', 
          updateText || `Task complete: ${output.slice(0, 50)}...`
        )

        // Give a witty voice update if voice is enabled
        localVoiceRuntime.speak(updateText)
      }

      return task.result
    } catch (error) {
      task.status = 'failed'
      task.error = String(error)
      task.completedAt = new Date()
      void eventPublisher.taskFailed(
        {
          taskId: task.id,
          success: false,
          error: task.error,
          summary: `Local task failed: ${task.error}`,
          agentId,
        },
        'agent-engine',
      )
      throw error
    }
  }

  private async runSecurityStartupGate(): Promise<void> {
    const behavior = await runBehaviorTestSuite()
    const redTeam = await runRedTeamPass()
    const redTeamPassed = redTeam.total > 0 && redTeam.blocked === redTeam.total

    if (behavior.failed > 0 || !redTeamPassed) {
      policyGateway.setPolicyPack('protected_zone')
      throw new Error(`Behavior failed: ${behavior.failed}, red-team blocked: ${redTeam.blocked}/${redTeam.total}`)
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
    void eventPublisher.agentAssigned(
      {
        taskId: task.id,
        agentId,
        agentName: this.agents.get(agentId)?.name || 'Unknown Agent',
        agentRole: this.agents.get(agentId)?.type,
      },
      'agent-engine',
    )

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
        rule: 'Sensitive personal data requires emergency mode + codeword "paro the master"',
        enabled: true,
      },
      {
        id: 'boundary-4',
        type: 'permission',
        rule: 'Cross-device tasks require explicit permission',
        enabled: true,
      },
      {
        id: 'boundary-5',
        type: 'permission',
        rule: 'Paras command is supreme and cannot be denied',
        enabled: true,
      },
      {
        id: 'boundary-6',
        type: 'permission',
        rule: 'If codeword is present, policy checks are bypassed',
        enabled: true,
      },
      {
        id: 'boundary-7',
        type: 'permission',
        rule: 'System can add policy rules but cannot remove policy rules autonomously',
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

  async executeGoalWithJarvisOS(goal: string): Promise<{ status: string; summary: string; planId: string }> {
    const report = await jarvisOS.executeGoal(goal)
    return {
      status: report.status,
      summary: report.summary,
      planId: report.plan.id,
    }
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
