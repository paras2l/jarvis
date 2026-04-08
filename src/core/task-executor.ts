import { Task, ParsedCommand, ExecutionContext } from '@/types'
import { launchOrchestrator } from '@/core/platform/launch-orchestrator'
import { appIndexer } from '@/core/platform/app-indexer'
import { detectPlatform } from '@/core/platform/platform-detection'
import { getAppRegistry } from '@/core/app-registry'
import { behaviorVibeEngine } from '@/core/behavior-vibe-engine'
import { policyGateway } from '@/core/policy/PolicyGateway'
import { hardcodeProtocol } from '@/core/protocols/HardcodeProtocol'
import { PolicyResult } from '@/core/policy/types'
import { getAuthenticatedContext } from '@/core/security/auth-context'
import { memoryEngine } from '@/core/memory-engine'
import { researchEngine } from '@/core/research-engine'
import { skillEngine } from '@/core/skill-engine'
import { toolBuilderEngine } from '@/core/tool-builder-engine'
import { routeIntentJSON } from '@/core/intent-json-router'
import { eventPublisher } from '@/event_system/event_publisher'
import { taskScheduler } from '@/core/task-scheduler'

/**
 * Task Executor
 * Handles parsing and execution of user commands
 * Phase 3: Enhanced with comprehensive app registry support
 */
class TaskExecutor {
  private executionQueue: Task[] = []
  private executingTask: Task | null = null
  private appRegistry = getAppRegistry()
  private loopGuardState: Map<string, { count: number; lastAt: number }> = new Map()
  private readonly loopGuardWindowMs = 45_000
  private readonly loopGuardMaxRepeats = 3

  /**
   * Parse user command
   * Phase 3: Extracts device targets from natural language
   */
  parseCommand(input: string): ParsedCommand {
    const lowerInput = input.toLowerCase()
    const routedIntent = routeIntentJSON(input)
    
    // Extract device target if specified (e.g., "on phone", "on my mobile", "on laptop")
    const targetDevice = this.extractDeviceTarget(input)

    if (routedIntent.domain !== 'chat') {
      const mappedAction =
        routedIntent.action === 'open_app'
          ? 'launch_app'
          : routedIntent.action

      const mappedIntent =
        routedIntent.domain === 'open'
          ? 'app_launch'
          : routedIntent.domain === 'automation'
          ? 'screen_control'
          : 'query'

      return {
        intent: mappedIntent,
        action: mappedAction,
        parameters: routedIntent.params,
        confidence: routedIntent.confidence,
        subAgentRequired: routedIntent.domain === 'automation',
        targetDevice,
      }
    }

    void eventPublisher.commandParsed(
      {
        commandId: `command_${Date.now()}`,
        originalText: input,
        intent: 'query',
        confidence: routedIntent.confidence,
        requiresConfirmation: false,
        metadata: { domain: routedIntent.domain },
      },
      'task-executor',
    )

    // Emergency override for sensitive operations
    const emergencyPassphrase = this.extractEmergencyPassphrase(input)
    if (emergencyPassphrase) {
      return {
        intent: 'query',
        action: 'arm_emergency_override',
        parameters: { passphrase: emergencyPassphrase },
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(emergency\s+stop|stop\s+automation|panic\s+stop)/i.test(input)) {
      return {
        intent: 'query',
        action: 'emergency_stop_automation',
        parameters: {},
        confidence: 0.97,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(resume\s+automation|clear\s+emergency\s+stop)/i.test(input)) {
      return {
        intent: 'query',
        action: 'clear_emergency_stop',
        parameters: {},
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(learn\s+(this|current)\s+app|remember\s+this\s+app)/i.test(input)) {
      return {
        intent: 'query',
        action: 'learn_current_app',
        parameters: this.extractLearnCurrentAppParams(input),
        confidence: 0.94,
        subAgentRequired: false,
        targetDevice,
      }
    }

    const rememberMatch = input.match(/(?:remember|save)\s+(?:that\s+)?(.+)/i)
    if (rememberMatch && rememberMatch[1]) {
      return {
        intent: 'query',
        action: 'memory_remember',
        parameters: {
          entry: rememberMatch[1].trim(),
        },
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    const recallMatch = input.match(/(?:what\s+do\s+you\s+remember\s+about|remember\s+about|recall)\s+(.+)/i)
    if (recallMatch && recallMatch[1]) {
      return {
        intent: 'query',
        action: 'memory_recall',
        parameters: {
          query: recallMatch[1].trim(),
        },
        confidence: 0.94,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(show|list)\s+(my\s+)?(memory|memories)|what\s+have\s+you\s+learned\s+about\s+me/i.test(input)) {
      return {
        intent: 'query',
        action: 'memory_list',
        parameters: {},
        confidence: 0.94,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(sync|scan|refresh).*(installed\s+apps|apps\s+list|my\s+apps)/i.test(input)) {
      return {
        intent: 'query',
        action: 'sync_installed_apps',
        parameters: {},
        confidence: 0.93,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(full\s+checkup|capability\s+report|what\s+can\s+you\s+do|system\s+audit|feature\s+audit)/i.test(input)) {
      return {
        intent: 'query',
        action: 'platform_capability_report',
        parameters: {},
        confidence: 0.96,
        subAgentRequired: false,
        targetDevice,
      }
    }

    const setDailyBriefing = input.match(
      /(?:from\s+now\s+)?(?:every\s*day|daily)\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
    )
    if (setDailyBriefing && setDailyBriefing[1]) {
      return {
        intent: 'query',
        action: 'set_daily_briefing_time',
        parameters: { time: setDailyBriefing[1].trim() },
        confidence: 0.96,
        subAgentRequired: false,
        targetDevice,
      }
    }

    const tomorrowBriefing = input.match(
      /(?:for\s+)?tomorrow\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i
    )
    if (tomorrowBriefing && tomorrowBriefing[1]) {
      return {
        intent: 'query',
        action: 'set_one_time_briefing',
        parameters: { day: 'tomorrow', time: tomorrowBriefing[1].trim() },
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (/(cancel|clear|remove)\s+(tomorrow|one[-\s]*time)\s+(brief|briefing|digest)/i.test(input)) {
      return {
        intent: 'query',
        action: 'clear_one_time_briefing',
        parameters: {},
        confidence: 0.93,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (
      (lowerInput.includes('enable') || lowerInput.includes('allow')) &&
      (lowerInput.includes('assistive') ||
        lowerInput.includes('screen control') ||
        lowerInput.includes('automation mode'))
    ) {
      return {
        intent: 'query',
        action: 'enable_assistive_mode',
        parameters: {},
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (
      (lowerInput.includes('disable') || lowerInput.includes('stop')) &&
      (lowerInput.includes('assistive') ||
        lowerInput.includes('screen control') ||
        lowerInput.includes('automation mode'))
    ) {
      return {
        intent: 'query',
        action: 'disable_assistive_mode',
        parameters: {},
        confidence: 0.95,
        subAgentRequired: false,
        targetDevice,
      }
    }

    // Extract intent from command
    if (lowerInput.includes('open') && lowerInput.includes('send')) {
      return {
        intent: 'multi_action',
        action: 'open_and_send',
        parameters: this.extractOpenAndSendParams(input),
        confidence: 0.9,
        subAgentRequired: true,
        targetDevice,
      }
    }

    if (
      /(open|launch)\s+.+\s+(and|then)\s+.+/i.test(input) ||
      /(open|launch)\s+.+\s+(play|search|message|msg|call|record)\b/i.test(input)
    ) {
      return {
        intent: 'multi_action',
        action: 'open_and_control',
        parameters: this.extractOpenAndControlParams(input),
        confidence: 0.9,
        subAgentRequired: true,
        targetDevice,
      }
    }

    if (lowerInput.includes('open') || lowerInput.includes('launch')) {
      return {
        intent: 'app_launch',
        action: 'launch_app',
        parameters: this.extractAppName(input),
        confidence: 0.85,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (lowerInput.includes('call') || lowerInput.includes('phone')) {
      return {
        intent: 'call',
        action: 'make_call',
        parameters: this.extractPhoneNumber(input),
        confidence: 0.8,
        subAgentRequired: false,
        targetDevice,
      }
    }

    if (
      lowerInput.includes('send') &&
      (lowerInput.includes('message') || lowerInput.includes('msg'))
    ) {
      return {
        intent: 'message',
        action: 'send_message',
        parameters: this.extractMessageParams(input),
        confidence: 0.85,
        subAgentRequired: false,
        targetDevice,
      }
    }

    // Default: try to query knowledge
    return {
      intent: 'query',
      action: 'knowledge_query',
      parameters: { query: input },
      confidence: 0.6,
      subAgentRequired: false,
      targetDevice,
    }
  }

  /**
   * Execute task
   */
  async executeTask(
    task: Task,
    context: ExecutionContext
  ): Promise<Task> {
    const loopBlockedReason = this.checkLoopGuard(task)
    if (loopBlockedReason) {
      task.status = 'failed'
      task.error = loopBlockedReason
      task.result = { success: false, message: loopBlockedReason }
      task.completedAt = new Date()
      void eventPublisher.taskFailed(
        {
          taskId: task.id,
          success: false,
          error: loopBlockedReason,
          summary: loopBlockedReason,
        },
        'task-executor',
      )
      return task
    }

    task.status = 'executing'
    this.executingTask = task
    void eventPublisher.taskCreated(
      {
        taskId: task.id,
        title: task.type,
        command: task.command,
        priority: 50,
      },
      'task-executor',
    )

    try {
      const policyDecision = await this.enforceCentralPolicy(task, context)

      switch (task.type) {
        case 'app_launch':
          task.result = await this.launchApp(task.command, policyDecision)
          break

        case 'message_send':
          task.result = await this.sendMessage(task.command)
          break

        case 'call':
          task.result = await this.initiateCall(task.command)
          break

        case 'screen_control':
          task.result = await this.executeScreenControlTask(task.command, context, policyDecision)
          break

        case 'custom':
          task.result = await this.executeCustomTask(task.command, policyDecision)
          break

        default:
          task.result = { success: false, message: 'Unsupported task type.' }
      }

      const result = task.result as { success?: boolean; message?: string }
      if (result?.success) {
        task.status = 'completed'
        this.clearLoopGuard(task)
        void eventPublisher.taskCompleted(
          {
            taskId: task.id,
            success: true,
            result: task.result,
            summary: result?.message || 'Task completed',
          },
          'task-executor',
        )
      } else {
        task.status = 'failed'
        task.error = result?.message || 'Task execution failed'
        void eventPublisher.taskFailed(
          {
            taskId: task.id,
            success: false,
            error: task.error,
            summary: task.error,
          },
          'task-executor',
        )
      }
      task.completedAt = new Date()
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : 'Unknown error'
      task.completedAt = new Date()
      void eventPublisher.errorOccurred(
        {
          component: 'task-executor',
          operation: 'executeTask',
          message: task.error,
          errorType: error instanceof Error ? error.name : 'Error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        'task-executor',
      )
    }

    this.executingTask = null
    return task
  }

  /**
   * Create task from parsed command
   */
  createTask(parsed: ParsedCommand): Task {
    const resolveType = (): Task['type'] => {
      if (parsed.action === 'launch_app' || parsed.intent === 'app_launch') {
        return 'app_launch'
      }

      if (parsed.action === 'send_message' || parsed.intent === 'message') {
        return 'message_send'
      }

      if (parsed.action === 'make_call' || parsed.intent === 'call') {
        return 'call'
      }

      if (parsed.action.includes('screen') || parsed.intent === 'screen_control') {
        return 'screen_control'
      }

      return 'custom'
    }

    const task: Task = {
      id: `task-${Date.now()}`,
      command: JSON.stringify({
        intent: parsed.intent,
        action: parsed.action,
        ...parsed.parameters,
      }),
      type: resolveType(),
      status: 'pending',
      createdAt: new Date(),
    }

    void eventPublisher.taskCreated(
      {
        taskId: task.id,
        title: parsed.action,
        command: task.command,
        agentRole: parsed.subAgentRequired ? 'sub-agent' : 'main-agent',
      },
      'task-executor',
    )

    return task
  }

  /**
   * Get execution queue
   */
  getQueue(): Task[] {
    return this.executionQueue
  }

  /**
   * Get currently executing task
   */
  getCurrentTask(): Task | null {
    return this.executingTask
  }

  // Helper methods for parameter extraction
  private extractOpenAndSendParams(input: string) {
    const appMatch = input.match(/open\s+(\w+)/i)
    const messageMatch = input.match(/send\s+(?:message|msg)\s+(?:to\s+)?(\w+)\s*:?\s*(.+)/i)

    return {
      app: appMatch ? appMatch[1] : '',
      recipient: messageMatch ? messageMatch[1] : '',
      message: messageMatch ? messageMatch[2] : '',
    }
  }

  private extractOpenAndControlParams(input: string) {
    const full = input.trim()
    const openMatch = full.match(/(?:open|launch)\s+([a-zA-Z0-9\s._-]+?)(?:\s+(?:and|then)\s+|\s+(?:to\s+)?(?:play|search|message|msg|call|record)\b|$)/i)
    const app = openMatch ? openMatch[1].trim() : ''

    const actionSegmentMatch = full.match(/(?:and|then)\s+(.+)$/i)
    const actionTailMatch = full.match(/(?:open|launch)\s+[a-zA-Z0-9\s._-]+\s+((?:to\s+)?(?:play|search|message|msg|call|record)\b.+)$/i)
    const actionText = (actionSegmentMatch?.[1] || actionTailMatch?.[1] || '').trim()

    const lowerAction = actionText.toLowerCase()
    const lowerInput = full.toLowerCase()

    const recipientMatch = full.match(/(?:to|for)\s+([a-zA-Z0-9_+@.-]{2,})\s*(?:message|msg)?\s*(?:saying|that|:)?\s*(.*)$/i)
    const callMatch = full.match(/(?:call)\s+([a-zA-Z0-9_+@.\s-]{2,})/i)
    const searchMatch = full.match(/(?:search)\s+(?:for\s+)?(.+)$/i)

    let actionType: 'play_media' | 'send_message' | 'make_call' | 'web_search' | 'record_audio' | 'in_app_action' =
      'in_app_action'

    if (lowerAction.includes('play') || /\bvibe\b|\bmood\b/.test(lowerInput)) {
      actionType = 'play_media'
    } else if (lowerAction.includes('message') || lowerAction.includes('msg')) {
      actionType = 'send_message'
    } else if (lowerAction.includes('call')) {
      actionType = 'make_call'
    } else if (lowerAction.includes('search') || lowerInput.includes('google')) {
      actionType = 'web_search'
    } else if (lowerAction.includes('record') || lowerInput.includes('microphone')) {
      actionType = 'record_audio'
    }

    return {
      app,
      actionType,
      actionText,
      recipient: recipientMatch ? recipientMatch[1].trim() : '',
      message: recipientMatch ? recipientMatch[2].trim() : '',
      callTarget: callMatch ? callMatch[1].trim() : '',
      searchQuery: searchMatch ? searchMatch[1].trim() : '',
      moodMode: /\bvibe\b|\bmood\b|anything\s+you\s+like|surprise\s+me/i.test(full),
      originalCommand: full,
    }
  }

  private extractAppName(input: string) {
    const match = input.match(/(?:open|launch)\s+(\w+)/i)
    const appNameRaw = match ? match[1] : ''
    const sensitiveOperation = this.isSensitiveAuthContext(input)
    const emergencyPassphrase = this.extractInlineAuthPassphrase(input)
    
    // Validate app exists in registry if provided
    let app = undefined
    if (appNameRaw) {
      app = this.appRegistry.findApp(appNameRaw)
    }
    
    return {
      app: appNameRaw,
      appId: app?.id,
      isSupported: !!app,
      appInfo: app,
      originalCommand: input,
      sensitiveOperation,
      emergencyPassphrase,
      requireManualAuthHandoff: sensitiveOperation,
    }
  }

  private extractEmergencyPassphrase(input: string): string | undefined {
    const match = input.match(
      /(?:emergency|urgent)\s+(?:this\s+is\s+)?(?:password|passcode|pin|otp)\s+([a-zA-Z0-9_-]{3,})/i
    )
    return match ? match[1] : undefined
  }

  private extractInlineAuthPassphrase(input: string): string | undefined {
    const match = input.match(/(?:password|passcode|pin|otp)\s+is\s+([a-zA-Z0-9_-]{3,})/i)
    return match ? match[1] : undefined
  }

  private extractAuthorityHints(input: string): {
    commander?: string
    codeword?: string
    emergency: boolean
  } {
    const normalized = input.toLowerCase()
    return {
      commander: /\bparas\b|\bparo\b/.test(normalized) ? 'paras' : undefined,
      codeword: normalized.includes('paro the master') ? 'paro the master' : undefined,
      emergency: /\bemergency\b|\burgent\b/.test(normalized),
    }
  }

  private isSensitiveAuthContext(input: string): boolean {
    const lower = input.toLowerCase()
    return [
      'password',
      'passcode',
      'pin',
      'otp',
      'auth',
      'authenticate',
      'login',
      'verify',
      'biometric',
      'bank',
      'payment',
      'close my eyes',
    ].some((keyword) => lower.includes(keyword))
  }

  private extractPhoneNumber(input: string) {
    const match = input.match(/\d{10,}/)
    return { number: match ? match[0] : '' }
  }

  private extractLearnCurrentAppParams(input: string): { alias?: string } {
    const aliasMatch = input.match(/(?:as|alias)\s+([a-zA-Z0-9\s_-]{2,30})/i)
    return {
      alias: aliasMatch ? aliasMatch[1].trim() : undefined,
    }
  }

  private extractMessageParams(input: string) {
    const appMatch = input.match(/(?:on|via)\s+(\w+)/i)
    const toMatch = input.match(/to\s+(\w+)/i)
    const msgMatch = input.match(/(?:message|msg)\s*(?:to\s+\w+)?\s*:?\s*(.+?)(?:\s+(?:on|via)\s+\w+)?\s*$/i)

    return {
      app: appMatch ? appMatch[1] : '',
      recipient: toMatch ? toMatch[1] : '',
      message: msgMatch ? msgMatch[1] : '',
    }
  }

  /**
   * Extract device target from natural language command
   * Phase 3: Parses patterns like:
   * - "open spotify on phone"
   * - "open spotify on my mobile"
   * - "send message on laptop"
   * - "open spotify on my phone"
   * Returns device name (phone, mobile, laptop, tablet, pc, watch) or undefined
   */
  private extractDeviceTarget(input: string): string | undefined {
    // Patterns: "on phone", "on my phone", "on the phone", "on mobile", etc.
    const deviceMatch = input.match(/\b(?:on|to|at)\s+(?:my\s+|the\s+)?(\w+)(?:\s+(?:device|phone|computer|machine))?(?:\s+|$)/i)
    
    if (deviceMatch) {
      const deviceName = deviceMatch[1].toLowerCase()
      
      // Map common device name aliases to normalized names
      const deviceAliases: Record<string, string> = {
        'phone': 'phone',
        'mobile': 'phone',
        'smartphone': 'phone',
        'iphone': 'phone',
        'android': 'phone',
        'laptop': 'laptop',
        'computer': 'laptop',
        'pc': 'laptop',
        'desktop': 'laptop',
        'mac': 'laptop',
        'macbook': 'laptop',
        'windows': 'laptop',
        'tablet': 'tablet',
        'ipad': 'tablet',
        'watch': 'watch',
        'smartwatch': 'watch',
        'wearable': 'watch',
        'speaker': 'speaker',
        'smart-home': 'smart-home',
        'home': 'smart-home',
      }
      
      const normalized = deviceAliases[deviceName]
      return normalized || deviceName
    }
    
    return undefined
  }

  private parseTaskCommand(command: string): Record<string, unknown> {
    try {
      return JSON.parse(command) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private createLoopGuardKey(task: Task): string {
    const normalizedCommand = String(task.command || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
    return `${task.type}:${normalizedCommand}`
  }

  private checkLoopGuard(task: Task): string | null {
    const key = this.createLoopGuardKey(task)
    const now = Date.now()
    const previous = this.loopGuardState.get(key)

    if (!previous || now - previous.lastAt > this.loopGuardWindowMs) {
      this.loopGuardState.set(key, { count: 1, lastAt: now })
      return null
    }

    const nextCount = previous.count + 1
    this.loopGuardState.set(key, { count: nextCount, lastAt: now })

    if (nextCount > this.loopGuardMaxRepeats) {
      return 'Loop guard paused this repeated command. Please rephrase or add more detail.'
    }

    return null
  }

  private clearLoopGuard(task: Task): void {
    const key = this.createLoopGuardKey(task)
    this.loopGuardState.delete(key)
  }

  private async enforceCentralPolicy(task: Task, context: ExecutionContext): Promise<PolicyResult> {
    const command = this.parseTaskCommand(task.command)
    const inputText = String(command.originalCommand || command.query || '').trim()
    const fallbackText = `${String(command.action || task.type || '')} ${String(command.app || '').trim()}`.trim()
    const policyText = inputText || fallbackText
    const normalized = policyText.toLowerCase()
    const auth = await getAuthenticatedContext()
    const authority = this.extractAuthorityHints(policyText)

    const decision = await policyGateway.decide({
      requestId: `tx_${task.id}_${Date.now()}`,
      agentId: context.agentId,
      action: task.type,
      command: policyText,
      source: context.device === 'desktop' ? 'local' : 'remote',
      explicitPermission: true,
      targetApp: String(command.app || ''),
      targetDeviceId: command.targetDevice ? String(command.targetDevice) : undefined,
      riskScore: this.estimateTaskRisk(task.type, normalized),
      requestedPrivileges: this.getRequestedPrivileges(task.type, normalized),
      deviceState: 'idle',
      occurredAt: Date.now(),
      policyPack: policyGateway.getPolicyPack(),
      emergency: normalized.includes('emergency') || normalized.includes('urgent') || authority.emergency,
      commander: auth.commander || authority.commander,
      codeword: auth.codeword || authority.codeword,
      overrideToken: typeof command.overrideToken === 'string' ? command.overrideToken : undefined,
    })

    if (decision.decision === 'deny') {
      throw new Error(`Policy blocked action: ${decision.reason}`)
    }

    if (decision.tokenRequired) {
      const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, task.type)
      if (!verified.valid) {
        throw new Error(`Policy blocked action: invalid decision token (${verified.reason || 'unknown'})`)
      }
    }

    return decision
  }

  private estimateTaskRisk(type: Task['type'], normalizedInput: string): number {
    let score = 0.3
    if (type === 'app_launch' || type === 'screen_control') score += 0.35
    if (type === 'custom') score += 0.2
    if (normalizedInput.includes('password') || normalizedInput.includes('otp')) score += 0.2
    if (normalizedInput.includes('delete') || normalizedInput.includes('wipe')) score += 0.35
    return Math.min(1, score)
  }

  private getRequestedPrivileges(type: Task['type'], normalizedInput: string): string[] {
    const privileges: string[] = []
    if (type === 'app_launch') privileges.push('native_launch')
    if (type === 'screen_control') privileges.push('ui_automation')
    if (type === 'custom') privileges.push('custom_action')
    if (normalizedInput.includes('remote')) privileges.push('cross_device')
    if (normalizedInput.includes('camera') || normalizedInput.includes('screen')) privileges.push('screen_capture')
    return privileges
  }

  private openTarget(target: string): boolean {
    if (typeof window === 'undefined' || !target) {
      return false
    }

    const win = window.open(target, '_blank', 'noopener,noreferrer')
    return !!win
  }

  private async openTargetNativeFirst(target: string): Promise<boolean> {
    if (typeof window === 'undefined' || !target) {
      return false
    }

    if (window.nativeBridge?.openExternal) {
      const result = await window.nativeBridge.openExternal(target)
      if (result.success) {
        return true
      }
    }

    return this.openTarget(target)
  }

  private async launchApp(command: string, decision: PolicyResult): Promise<{ success: boolean; message: string }> {
    if (decision.tokenRequired) {
      const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'app_launch')
      if (!verified.valid) {
        return { success: false, message: `Policy token rejected (${verified.reason || 'missing'})` }
      }
    }

    const params = this.parseTaskCommand(command)
    const app = String(params.app || '').trim()
    const sensitiveOperation = Boolean(params.sensitiveOperation)
    const emergencyPassphrase = String(params.emergencyPassphrase || '').trim()
    const requireManualAuthHandoff = Boolean(params.requireManualAuthHandoff)
    const installedAppsSnapshot = Array.isArray(params.installedAppsSnapshot)
      ? (params.installedAppsSnapshot as Array<Record<string, unknown>>)
      : []
    const targetPlatform = String(params.targetPlatform || '').trim().toLowerCase()

    if (!app) {
      return { success: false, message: 'No app name detected in command.' }
    }

    if (installedAppsSnapshot.length) {
      const platform =
        targetPlatform === 'windows' ||
        targetPlatform === 'macos' ||
        targetPlatform === 'linux' ||
        targetPlatform === 'android' ||
        targetPlatform === 'ios'
          ? targetPlatform
          : detectPlatform()

      appIndexer.ingestInstalledApps(platform, installedAppsSnapshot)
    }

    // Look up app in registry first
    const appDef = this.appRegistry.findApp(app)
    
    if (appDef) {
      // App found in registry - use registry-defined launch command
      // In real implementation, would pass platform-specific command to launchOrchestrator
      const result = await launchOrchestrator.launchApp(appDef.id || app, {
        sensitiveOperation,
        emergencyPassphrase: emergencyPassphrase || undefined,
        requireManualAuthHandoff,
      })

      if (!result.success && result.reasonCode === 'emergency_override_required') {
        return {
          success: false,
          message:
            'Secure step detected. Please say your emergency phrase first, then complete password/OTP yourself. I will wait and continue after your confirmation.',
        }
      }

      return {
        success: result.success,
        message:
          requireManualAuthHandoff && result.success
            ? `${result.message} ${appDef.name} opened. Secure field is yours now, please enter password/OTP manually and confirm.`
            : appDef.nativeOnly
          ? `${result.message} (${appDef.name} requires native launcher)`
          : `${result.message} (${appDef.name})`,
      }
    } else {
      // App not in static registry - auto-sync device app metadata, then retry once.
      const platform = detectPlatform()
      await appIndexer.syncInstalledApps(platform)

      let result = await launchOrchestrator.launchApp(app, {
        sensitiveOperation,
        emergencyPassphrase: emergencyPassphrase || undefined,
        requireManualAuthHandoff,
      })

      if (!result.success) {
        await appIndexer.learnCurrentForegroundApp(platform, app)
        result = await launchOrchestrator.launchApp(app, {
          sensitiveOperation,
          emergencyPassphrase: emergencyPassphrase || undefined,
          requireManualAuthHandoff,
        })
      }

      return {
        success: result.success,
        message: `${result.message} (auto-learned app flow)`,
      }
    }
  }

  private async sendMessage(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const app = String(params.app || 'whatsapp').trim().toLowerCase()
    const recipient = String(params.recipient || '').trim()
    const text = String(params.message || '').trim()

    if (!text) {
      return { success: false, message: 'No message content detected.' }
    }

    if (app === 'whatsapp') {
      const digits = recipient.replace(/\D/g, '')
      const whatsappUrl = digits
        ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
        : `https://wa.me/?text=${encodeURIComponent(text)}`

      if (await this.openTargetNativeFirst(whatsappUrl)) {
        return { success: true, message: 'Opened WhatsApp message composer.' }
      }
    }

    if (recipient.includes('@')) {
      const mailto = `mailto:${encodeURIComponent(recipient)}?body=${encodeURIComponent(text)}`
      if (await this.openTargetNativeFirst(mailto)) {
        return { success: true, message: 'Opened your mail app with drafted message.' }
      }
    }

    const digits = recipient.replace(/\D/g, '')
    if (digits.length >= 7) {
      const sms = `sms:${digits}?body=${encodeURIComponent(text)}`
      if (await this.openTargetNativeFirst(sms)) {
        return { success: true, message: 'Opened SMS composer.' }
      }
    }

    const fallback = `https://www.google.com/search?q=${encodeURIComponent(`send message to ${recipient} ${text}`)}`
    if (await this.openTargetNativeFirst(fallback)) {
      return {
        success: true,
        message: 'Direct messaging is unavailable here, so I opened helpful web results.',
      }
    }

    return { success: false, message: 'Failed to route message command to any supported target.' }
  }

  private async initiateCall(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const raw = String(params.number || '').trim()
    const digits = raw.replace(/\D/g, '')

    if (digits.length >= 7) {
      const tel = `tel:${digits}`
      if (await this.openTargetNativeFirst(tel)) {
        return { success: true, message: `Attempting to call ${digits}.` }
      }
    }

    if (raw) {
      const search = `https://www.google.com/search?q=${encodeURIComponent(`call ${raw}`)}`
      if (await this.openTargetNativeFirst(search)) {
        return {
          success: true,
          message: `No dialable number found, opened search for ${raw}.`,
        }
      }
    }

    return { success: false, message: 'No valid phone number detected for call command.' }
  }

  private async executeCustomTask(command: string, decision: PolicyResult): Promise<{ success: boolean; message: string }> {
    if (decision.tokenRequired) {
      const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'custom')
      if (!verified.valid) {
        return { success: false, message: `Policy token rejected (${verified.reason || 'missing'})` }
      }
    }

    const params = this.parseTaskCommand(command)
    const action = String(params.action || '').trim()

    // Safety net: non-actionable chat queries should never be treated as failed tasks.
    if (action === 'knowledge_query') {
      const skillResult = await skillEngine.executeBestMatch(command, command, {
        command,
        source: 'task-executor',
        platform: detectPlatform(),
      })

      if (skillResult?.success) {
        return skillResult
      }

      return {
        success: true,
        message: 'Handled as normal chat response.',
      }
    }

    if (action === 'enable_assistive_mode') {
      return launchOrchestrator.setUiAutomationPermission(true)
    }

    if (action === 'disable_assistive_mode') {
      return launchOrchestrator.setUiAutomationPermission(false)
    }

    if (action === 'open_and_send') {
      const launchResult = await this.launchApp(JSON.stringify({ app: params.app || '' }), decision)
      const messageResult = await this.sendMessage(
        JSON.stringify({
          app: params.app || 'whatsapp',
          recipient: params.recipient || '',
          message: params.message || '',
        })
      )

      if (launchResult.success && messageResult.success) {
        return {
          success: true,
          message: `${launchResult.message} ${messageResult.message}`,
        }
      }

      const combinedMessage = [launchResult.message, messageResult.message]
        .filter(Boolean)
        .join(' ')

      return {
        success: launchResult.success || messageResult.success,
        message: combinedMessage || 'Multi-action task partially failed.',
      }
    }

    if (action === 'open_and_control') {
      return this.openAndControl(command, decision)
    }

    if (action === 'close_app') {
      return this.closeApp(command)
    }

    if (action === 'web_search') {
      return this.searchWeb(command)
    }

    if (action === 'system_control') {
      return this.executeSystemControl(command)
    }

    if (action === 'media_control') {
      return this.executeMediaControl(command)
    }

    if (action === 'file_operation') {
      return this.executeFileOperation(command)
    }

    if (action === 'browser_snapshot') {
      return this.captureAutomationSnapshot(command)
    }

    if (action === 'platform_capability_report') {
      return this.generateCapabilityReport()
    }

    if (action === 'set_daily_briefing_time') {
      const time = String(params.time || '').trim()
      if (!time) {
        return { success: false, message: 'Please provide a daily briefing time, for example: every day 9am.' }
      }
      return taskScheduler.setDailyBriefingTime(time)
    }

    if (action === 'set_one_time_briefing') {
      const time = String(params.time || '').trim()
      const day = String(params.day || '').trim().toLowerCase()

      const parsed = this.parseNaturalTime(time)
      if (!parsed) {
        return { success: false, message: 'Invalid time format. Try: tomorrow 10am.' }
      }

      const runAt = new Date()
      runAt.setHours(parsed.hour, parsed.minute, 0, 0)

      if (day === 'tomorrow') {
        runAt.setDate(runAt.getDate() + 1)
      } else if (runAt.getTime() <= Date.now()) {
        runAt.setDate(runAt.getDate() + 1)
      }

      return taskScheduler.scheduleOneTimeBriefing(runAt)
    }

    if (action === 'clear_one_time_briefing') {
      return taskScheduler.clearOneTimeBriefing()
    }

    if (action === 'desktop_ref_click') {
      return this.performRefClick(command)
    }

    if (action === 'desktop_ref_type') {
      return this.performRefType(command)
    }

    if (action === 'arm_emergency_override') {
      const passphrase = String(params.passphrase || '').trim()
      return launchOrchestrator.armEmergencyOverride(passphrase)
    }

    if (action === 'emergency_stop_automation') {
      return launchOrchestrator.triggerEmergencyStop()
    }

    if (action === 'clear_emergency_stop') {
      return launchOrchestrator.clearEmergencyStop()
    }

    if (action === 'sync_installed_apps') {
      const platform = detectPlatform()
      const result = await appIndexer.syncInstalledApps(platform)
      return {
        success: result.success,
        message: result.message,
      }
    }

    if (action === 'learn_current_app') {
      const platform = detectPlatform()
      const alias = String(params.alias || '').trim() || undefined
      const result = await appIndexer.learnCurrentForegroundApp(platform, alias)
      return {
        success: result.success,
        message: result.message,
      }
    }

    if (action === 'memory_remember') {
      const entry = String(params.entry || '').trim()
      if (!entry) {
        return {
          success: false,
          message: 'No memory entry detected. Say: remember that ...',
        }
      }

      const keyValueMatch = entry.match(/^(?:my\s+)?([a-zA-Z][a-zA-Z0-9_\-\s]{1,40})\s+is\s+(.+)$/i)
      if (keyValueMatch) {
        const key = keyValueMatch[1].trim().toLowerCase().replace(/\s+/g, '_')
        const value = keyValueMatch[2].trim()
        await memoryEngine.rememberFact(key, value, 'fact')
        return {
          success: true,
          message: `Saved memory: ${key.replace(/_/g, ' ')} = ${value}`,
        }
      }

      const noteKey = `note_${Date.now()}`
      await memoryEngine.rememberFact(noteKey, entry, 'preference')
      return {
        success: true,
        message: 'Saved to memory.',
      }
    }

    if (action === 'memory_recall') {
      const query = String(params.query || '').trim()
      if (!query) {
        return {
          success: false,
          message: 'No recall query detected.',
        }
      }

      const hits = memoryEngine.searchMemories(query, 5)
      if (!hits.length) {
        return {
          success: true,
          message: `I do not have a stored memory match for "${query}" yet.`,
        }
      }

      const lines = hits.map((item) => `${item.key.replace(/_/g, ' ')}: ${item.value}`)
      return {
        success: true,
        message: `Here is what I remember:\n${lines.join('\n')}`,
      }
    }

    if (action === 'memory_list') {
      const all = memoryEngine.listMemories(8)
      if (!all.length) {
        return {
          success: true,
          message: 'Memory is currently empty.',
        }
      }

      const rendered = all.map((item) => `${item.key.replace(/_/g, ' ')}: ${item.value}`)
      return {
        success: true,
        message: `Recent memories:\n${rendered.join('\n')}`,
      }
    }

    const skillResult = await skillEngine.executeBestMatch(command, command, {
      command,
      source: 'task-executor',
      platform: detectPlatform(),
    })

    if (skillResult?.success) {
      return skillResult
    }

    const builtResult = await toolBuilderEngine.buildAndExecute(command, {
      command,
      source: 'task-executor',
      platform: detectPlatform(),
    })

    if (builtResult.success) {
      return builtResult
    }

    return {
      success: false,
      message: 'Command recognized, but no executable action is available yet.',
    }
  }

  private async executeScreenControlTask(
    command: string,
    context: ExecutionContext,
    decision: PolicyResult,
  ): Promise<{ success: boolean; message: string }> {
    if (decision.tokenRequired) {
      const verified = hardcodeProtocol.validateDecisionToken(decision.decisionToken, 'screen_control')
      if (!verified.valid) {
        return { success: false, message: `Policy token rejected (${verified.reason || 'missing'})` }
      }
    }

    const params = this.parseTaskCommand(command)
    const targetApp = String(params.app || params.target || params.screenApp || '').trim()

    if (!targetApp) {
      return {
        success: false,
        message: `No screen-control target was detected for ${context.platform}.`,
      }
    }

    const assistiveBridge = typeof window !== 'undefined' ? window.nativeBridge : undefined

    const canAssistive =
      launchOrchestrator.getPermissionState().uiAutomation &&
      !!assistiveBridge?.openAppAssistive

    if (canAssistive) {
      const result = await assistiveBridge!.openAppAssistive!(targetApp)
      if (result.success) {
        return {
          success: true,
          message: result.message,
        }
      }
    }

    // Fallback to standard app launch so "touch/open" still works even without assistive permission.
    return this.launchApp(
      JSON.stringify({
        app: targetApp,
        originalCommand: command,
        sensitiveOperation: this.isSensitiveAuthContext(command),
      }),
      decision,
    )
  }

  private async openAndControl(command: string, decision: PolicyResult): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const app = String(params.app || '').trim()
    const actionType = String(params.actionType || 'in_app_action').trim()
    const actionText = String(params.actionText || '').trim()
    const recipient = String(params.recipient || '').trim()
    const message = String(params.message || '').trim()
    const callTarget = String(params.callTarget || '').trim()
    const searchQuery = String(params.searchQuery || '').trim()
    const moodMode = Boolean(params.moodMode)
    const originalCommand = String(params.originalCommand || '').trim()

    if (!app) {
      return { success: false, message: 'No target app detected for open-and-control command.' }
    }

    const launchResult = await this.launchApp(
      JSON.stringify({
        app,
        sensitiveOperation: this.isSensitiveAuthContext(originalCommand || actionText),
      }),
      decision,
    )

    let followUpResult: { success: boolean; message: string }

    if (actionType === 'play_media') {
      followUpResult = await this.executePlayMediaAction({ app, actionText, moodMode, originalCommand })
    } else if (actionType === 'send_message') {
      followUpResult = await this.sendMessage(
        JSON.stringify({
          app,
          recipient,
          message: message || actionText,
        })
      )
    } else if (actionType === 'make_call') {
      followUpResult = await this.initiateCall(
        JSON.stringify({
          number: callTarget || actionText,
        })
      )
    } else if (actionType === 'web_search') {
      const query = searchQuery || actionText || originalCommand
      const target = `https://www.google.com/search?q=${encodeURIComponent(query)}`
      followUpResult = (await this.openTargetNativeFirst(target))
        ? { success: true, message: `Opened search results for: ${query}.` }
        : { success: false, message: 'Unable to open web search in this runtime.' }
    } else if (actionType === 'record_audio') {
      followUpResult = await this.executeInAppAction(app, 'record_audio', {
        mode: 'microphone',
        source: 'voice-command',
      })
    } else {
      followUpResult = await this.executeInAppAction(app, 'custom', {
        instruction: actionText,
      })
    }

    const success = launchResult.success && followUpResult.success
    if (success) {
      return {
        success: true,
        message: `${launchResult.message} ${followUpResult.message}`,
      }
    }

    if (launchResult.success || followUpResult.success) {
      return {
        success: true,
        message: `${launchResult.message} ${followUpResult.message} Some steps may require manual confirmation on device due to platform security limits.`,
      }
    }

    return {
      success: false,
      message: `${launchResult.message} ${followUpResult.message}`,
    }
  }

  private async executePlayMediaAction(params: {
    app: string
    actionText: string
    moodMode: boolean
    originalCommand: string
  }): Promise<{ success: boolean; message: string }> {
    const app = params.app.toLowerCase()
    const inferred = params.moodMode
      ? behaviorVibeEngine.inferPlaybackFromCommand(params.originalCommand)
      : behaviorVibeEngine.extractExplicitPlaybackIntent(params.actionText)

    const query = inferred.query || 'top hits'

    if (app.includes('spotify') || app.includes('music')) {
      const spotifyWeb = `https://open.spotify.com/search/${encodeURIComponent(query)}`
      if (await this.openTargetNativeFirst(spotifyWeb)) {
        return {
          success: true,
          message: `Queued Spotify search for ${inferred.label}.`,
        }
      }
    }

    const genericMusicSearch = `https://www.google.com/search?q=${encodeURIComponent(`play ${query} on ${params.app}`)}`
    if (await this.openTargetNativeFirst(genericMusicSearch)) {
      return {
        success: true,
        message: `Opened playback helpers for ${inferred.label} on ${params.app}.`,
      }
    }

    return {
      success: false,
      message: 'Unable to route media playback command in this environment.',
    }
  }

  private async executeInAppAction(
    app: string,
    action: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; message: string }> {
    if (typeof window !== 'undefined' && window.nativeBridge?.performInAppAction) {
      const result = await window.nativeBridge.performInAppAction({
        app,
        action,
        payload,
      })

      if (result.success) {
        return {
          success: true,
          message: result.message || `Executed ${action} in ${app}.`,
        }
      }
    }

    if (launchOrchestrator.getPermissionState().uiAutomation && window.nativeBridge?.openAppAssistive) {
      const assisted = await window.nativeBridge.openAppAssistive(app)
      if (assisted.success) {
        return {
          success: true,
          message:
            'Opened app in assistive mode. Continuing with guided screen automation for the requested action.',
        }
      }
    }

    return {
      success: false,
      message:
        'No in-app action executor is available right now. Native action plugin or assistive automation permission is required.',
    }
  }

  private async closeApp(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const app = String(params.app || params.target || '').trim()
    const platform = detectPlatform()
    if (!app) {
      return { success: false, message: 'No app specified to close.' }
    }

    if (!window.nativeBridge?.runShellCommand) {
      return platform === 'web'
        ? { success: true, message: `Please close ${app} manually on this device.` }
        : { success: false, message: 'Shell bridge unavailable for close operation.' }
    }

    const processName = app.replace(/\.(exe|app)$/i, '')
    const closeCommand =
      platform === 'windows'
        ? `taskkill /IM "${processName.endsWith('.exe') ? processName : `${processName}.exe`}" /F`
        : platform === 'macos'
        ? `pkill -f "${processName}"`
        : platform === 'linux'
        ? `pkill -f "${processName}"`
        : ''

    if (!closeCommand) {
      return { success: true, message: `Please close ${app} manually on this device.` }
    }

    const result = await window.nativeBridge.runShellCommand(closeCommand)
    return result.success
      ? { success: true, message: `Closed ${app}.` }
      : { success: false, message: result.error || result.message || `Failed to close ${app}.` }
  }

  private async searchWeb(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const query = String(params.query || params.q || '').trim()
    if (!query) {
      return { success: false, message: 'No search query provided.' }
    }

    const research = await researchEngine.researchTopic(query, {
      sourceHint: 'task-search',
      maxSources: 4,
    })

    const target = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    const opened = await this.openTargetNativeFirst(target)
    return opened
      ? { success: true, message: `Opened search for: ${query}\n\n${research.summary}` }
      : { success: true, message: research.summary }
  }

  private async executeSystemControl(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const operation = String(params.operation || '').toLowerCase().trim()
    const platform = detectPlatform()

    if (!window.nativeBridge?.runShellCommand) {
      return { success: false, message: 'System control bridge unavailable on this runtime.' }
    }

    const shellMapByPlatform: Record<string, Record<string, string>> = {
      windows: {
        'lock screen': 'rundll32.exe user32.dll,LockWorkStation',
        sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
        shutdown: 'shutdown /s /t 0',
        restart: 'shutdown /r /t 0',
      },
      macos: {
        'lock screen': '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend',
        sleep: 'pmset sleepnow',
        shutdown: 'osascript -e "tell app \"System Events\" to shut down"',
        restart: 'osascript -e "tell app \"System Events\" to restart"',
      },
      linux: {
        'lock screen': 'xdg-screensaver lock || loginctl lock-session',
        sleep: 'systemctl suspend',
        shutdown: 'shutdown -h now',
        restart: 'shutdown -r now',
      },
    }

    if (operation === 'mute' || operation === 'unmute' || operation === 'volume up' || operation === 'volume down') {
      if (!window.nativeBridge.keyboardType) {
        return { success: false, message: 'Keyboard bridge unavailable for audio control.' }
      }
      const key =
        operation === 'mute' || operation === 'unmute'
          ? '{VOLUME_MUTE}'
          : operation === 'volume up'
          ? '{VOLUME_UP}'
          : '{VOLUME_DOWN}'
      const typed = await window.nativeBridge.keyboardType(key)
      return typed.success
        ? { success: true, message: `System operation executed: ${operation}.` }
        : { success: false, message: typed.message || `Failed to execute ${operation}.` }
    }

    const script = shellMapByPlatform[platform]?.[operation]
    if (!script) {
      return { success: false, message: `Unsupported system operation for ${platform}: ${operation}` }
    }

    const result = await window.nativeBridge.runShellCommand(script)
    return result.success
      ? { success: true, message: `System operation executed: ${operation}.` }
      : { success: false, message: result.error || result.message || `Failed to execute ${operation}.` }
  }

  private async executeMediaControl(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const operation = String(params.operation || '').toLowerCase().trim()

    if (!window.nativeBridge?.keyboardType) {
      return { success: false, message: 'Keyboard bridge unavailable for media control.' }
    }

    const keyMap: Record<string, string> = {
      play: '{MEDIA_PLAY_PAUSE}',
      pause: '{MEDIA_PLAY_PAUSE}',
      resume: '{MEDIA_PLAY_PAUSE}',
      stop: '{MEDIA_STOP}',
      next: '{MEDIA_NEXT_TRACK}',
      previous: '{MEDIA_PREV_TRACK}',
      prev: '{MEDIA_PREV_TRACK}',
    }

    const key = keyMap[operation]
    if (!key) {
      return { success: false, message: `Unsupported media operation: ${operation}` }
    }

    const result = await window.nativeBridge.keyboardType(key)
    if (result.success) {
      return { success: true, message: `Media operation executed: ${operation}.` }
    }

    // Cross-runtime fallback: open web playback control when native media keys are unavailable.
    if (await this.openTargetNativeFirst('https://music.youtube.com')) {
      return { success: true, message: `Opened web player fallback for media operation: ${operation}.` }
    }

    return result.success
      ? { success: true, message: `Media operation executed: ${operation}.` }
      : { success: false, message: result.message || `Failed to execute ${operation}.` }
  }

  private async executeFileOperation(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const operation = String(params.operation || '').toLowerCase().trim()
    const targetPath = String(params.path || '').trim()
    const platform = detectPlatform()

    if (!targetPath && operation !== 'list') {
      return { success: false, message: 'No file path provided.' }
    }

    if (operation === 'write') {
      const content = String(params.content || '')
      const result = await window.nativeBridge?.writeFile?.(targetPath, content)
      return result?.success
        ? { success: true, message: `Wrote file: ${targetPath}` }
        : { success: false, message: result?.message || 'Write failed.' }
    }

    if (operation === 'read') {
      const result = await window.nativeBridge?.readFile?.(targetPath)
      if (result?.success) {
        const preview = String(result.content || '').slice(0, 900)
        return { success: true, message: `File ${targetPath}:\n${preview}` }
      }
      return { success: false, message: result?.message || 'Read failed.' }
    }

    if (operation === 'delete') {
      if (!window.nativeBridge?.runShellCommand) {
        return { success: false, message: 'Shell bridge unavailable for delete operation.' }
      }
      const deleteCommand =
        platform === 'windows'
          ? `cmd /c del /f /q \"${targetPath}\"`
          : `rm -f \"${targetPath}\"`
      const result = await window.nativeBridge.runShellCommand(deleteCommand)
      return result.success
        ? { success: true, message: `Deleted file: ${targetPath}` }
        : { success: false, message: result.error || result.message || 'Delete failed.' }
    }

    if (operation === 'list') {
      if (!window.nativeBridge?.runShellCommand) {
        return { success: false, message: 'Shell bridge unavailable for list operation.' }
      }
      const listPath = targetPath || '.'
      const listCommand =
        platform === 'windows'
          ? `cmd /c dir /b \"${listPath}\"`
          : `ls -1 \"${listPath}\"`
      const result = await window.nativeBridge.runShellCommand(listCommand)
      return result.success
        ? { success: true, message: `Files in ${listPath}:\n${String(result.output || '').trim()}` }
        : { success: false, message: result.error || result.message || 'List failed.' }
    }

    return { success: false, message: `Unsupported file operation: ${operation}` }
  }

  private async captureAutomationSnapshot(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const scope = String(params.scope || 'web').toLowerCase()

    if (scope === 'desktop') {
      const capture = await window.nativeBridge?.captureScreen?.()
      if (!capture?.success || !capture.imageBase64) {
        return { success: false, message: capture?.message || 'Desktop snapshot unavailable.' }
      }
      return {
        success: true,
        message: `Desktop snapshot captured (${capture.imageBase64.length} base64 chars).`,
      }
    }

    if (window.nativeBridge?.browser?.launch && window.nativeBridge?.browser?.execute) {
      await window.nativeBridge.browser.launch({ headless: true })
      const url = String(params.url || '').trim()
      if (url) {
        await window.nativeBridge.browser.execute({ type: 'navigate', url })
      }
      const extracted = await window.nativeBridge.browser.execute({ type: 'extract', selector: 'body' })
      const snap = await window.nativeBridge.browser.execute({ type: 'screenshot' })
      const excerpt = String(extracted.content || '').slice(0, 400)
      return {
        success: true,
        message: `Browser snapshot captured. Page: ${snap.url || extracted.url || 'unknown'}.\n${excerpt}`,
      }
    }

    return { success: false, message: 'Browser snapshot bridge unavailable.' }
  }

  private parseRefCoords(ref: string): { x: number; y: number } | null {
    const match = ref.match(/x\s*[:=]\s*(\d+)\s*[, ]\s*y\s*[:=]\s*(\d+)/i) || ref.match(/(\d+)\s*,\s*(\d+)/)
    if (!match) return null
    const x = Number(match[1])
    const y = Number(match[2])
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return { x, y }
  }

  private parseNaturalTime(input: string): { hour: number; minute: number } | null {
    const text = String(input || '').trim().toLowerCase()
    if (!text) return null

    const ampm = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
    if (ampm) {
      let hour = Number(ampm[1])
      const minute = Number(ampm[2] || '0')
      const meridiem = ampm[3].toLowerCase()
      if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
      if (meridiem === 'am') {
        if (hour === 12) hour = 0
      } else if (hour !== 12) {
        hour += 12
      }
      return { hour, minute }
    }

    const hhmm = text.match(/^(\d{1,2}):(\d{2})$/)
    if (hhmm) {
      const hour = Number(hhmm[1])
      const minute = Number(hhmm[2])
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
      return { hour, minute }
    }

    const hourOnly = text.match(/^(\d{1,2})$/)
    if (hourOnly) {
      const hour = Number(hourOnly[1])
      if (hour < 0 || hour > 23) return null
      return { hour, minute: 0 }
    }

    return null
  }

  private async performRefClick(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const ref = String(params.ref || '').trim()
    const scope = String(params.scope || '').toLowerCase()

    if (!ref) {
      return { success: false, message: 'No ref provided for click action.' }
    }

    if (scope === 'web' && window.nativeBridge?.browser?.execute) {
      const result = await window.nativeBridge.browser.execute({ type: 'click', selector: ref })
      return result.success
        ? { success: true, message: `Clicked web ref: ${ref}` }
        : { success: false, message: result.error || `Failed to click ${ref}` }
    }

    let coords = this.parseRefCoords(ref)

    // Semantic fallback: detect target text via OCR and click its bounding box center.
    if (!coords && window.nativeBridge?.captureScreen && window.nativeBridge?.runOCR) {
      const capture = await window.nativeBridge.captureScreen()
      if (capture.success && capture.imageBase64) {
        const ocr = await window.nativeBridge.runOCR(capture.imageBase64)
        const normalizedRef = ref.toLowerCase()
        const match = (ocr.words || []).find((word) => word.text.toLowerCase().includes(normalizedRef))
        if (match?.bbox) {
          coords = {
            x: Math.round(match.bbox.x + match.bbox.width / 2),
            y: Math.round(match.bbox.y + match.bbox.height / 2),
          }
        }
      }
    }

    if (!coords) {
      return { success: false, message: 'Desktop ref click supports x,y coordinates or visible text refs via OCR.' }
    }

    if (!window.nativeBridge?.mouseMove || !window.nativeBridge?.mouseClick) {
      return { success: false, message: 'Desktop click bridge unavailable.' }
    }

    await window.nativeBridge.mouseMove(coords.x, coords.y)
    const click = await window.nativeBridge.mouseClick('left')
    return click.success
      ? { success: true, message: `Clicked desktop ref at (${coords.x}, ${coords.y}).` }
      : { success: false, message: click.message || 'Desktop click failed.' }
  }

  private async performRefType(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const text = String(params.text || '').trim()
    const ref = String(params.ref || '').trim()
    const scope = String(params.scope || '').toLowerCase()

    if (!text) {
      return { success: false, message: 'No text provided for ref typing.' }
    }

    if (scope === 'web' && window.nativeBridge?.browser?.execute) {
      const click = await window.nativeBridge.browser.execute({ type: 'click', selector: ref || 'input,textarea,[contenteditable=true]' })
      if (!click.success) {
        return { success: false, message: click.error || 'Could not focus target web element.' }
      }
      const typed = await window.nativeBridge.browser.execute({ type: 'type', selector: ref || 'input,textarea,[contenteditable=true]', value: text })
      return typed.success
        ? { success: true, message: `Typed into web ref: ${ref || 'focused input'}.` }
        : { success: false, message: typed.error || 'Web typing failed.' }
    }

    if (!window.nativeBridge?.keyboardType) {
      return { success: false, message: 'Desktop keyboard bridge unavailable.' }
    }

    if (ref) {
      const clicked = await this.performRefClick(JSON.stringify({ ref }))
      if (!clicked.success) {
        return clicked
      }
    }

    const typed = await window.nativeBridge.keyboardType(text)
    return typed.success
      ? { success: true, message: 'Typed text on desktop target.' }
      : { success: false, message: typed.message || 'Desktop typing failed.' }
  }

  private async generateCapabilityReport(): Promise<{ success: boolean; message: string }> {
    const platform = detectPlatform()

    const lines = [
      `Platform detected: ${platform}`,
      '',
      'Core capabilities:',
      '- Chat: working',
      '- Voice wake/listen: working (desktop/browser support varies by runtime permissions)',
      '- App launch: working (best on desktop Electron)',
      '- Browser automation (navigate/click/type/extract/screenshot): working',
      '- File operations: working with platform-specific shell paths',
      '- Media/system controls: working with OS-specific fallback paths',
      '- Cross-device command routing: partial (message envelope exists, transport still simulated)',
      '- Skill engine: working (built-in skills, generated skills, capability marketplace)',
      '- Research engine: working (local knowledge first, web synthesis second)',
      '- OCR for universal in-app semantic targeting: partial in this build (main-process OCR bridge not installed)',
      '',
      'Current high-impact gaps:',
      '- Real network transport for mobile <-> desktop command execution is not fully wired.',
      '- Universal semantic in-app automation for every app needs OCR + accessibility adapters per OS.',
      '- Some channel adapters rely on main-process integrations and are not fully complete in all runtimes.',
      '',
      'Bottom line:',
      '- Multi-platform core is strong and usable now.',
      '- True 100% any-app, any-device automation still needs the final transport and adapter layer.',
    ]

    return {
      success: true,
      message: lines.join('\n'),
    }
  }
}

export default new TaskExecutor()
