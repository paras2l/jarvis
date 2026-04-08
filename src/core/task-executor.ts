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
import { naturalCommandLayer } from '@/core/natural-command-layer'
import type { NCULTask } from '@/core/natural-command-layer'
import { selfModelLayer } from '@/layers/self_model/self_model_layer'
import { metacognitionLayer } from '@/layers/metacognition/metacognition_layer'
import { narrativeMemory } from '@/layers/identity_continuity/narrative_memory'
import { relationshipTracker } from '@/layers/identity_continuity/relationship_tracker'
import { intentionalAgencyLayer } from '@/layers/intentional_agency/agency_core'

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
    const decoded = this.parseTaskCommand(task.command)
    const nculSource = String(
      decoded.originalCommand || decoded.query || decoded.instruction || decoded.app || decoded.action || task.command,
    ).trim()
    const nculTask = await naturalCommandLayer.interpret(nculSource || task.command)
    const calibratedConfidence = await metacognitionLayer.calibrateCommandConfidence(
      nculSource || task.command,
      nculTask.confidence,
    )
    const executionThreshold = metacognitionLayer.getExecutionThreshold()
    const evaluatedTask: NCULTask = {
      ...nculTask,
      confidence: calibratedConfidence,
    }

    if (evaluatedTask.confidence < executionThreshold && task.type !== 'custom') {
      task.status = 'failed'
      task.error = `Low-confidence command (${evaluatedTask.confidence.toFixed(2)}). Please clarify your intent.`
      task.result = { success: false, message: task.error }
      task.completedAt = new Date()
      await this.logCommandOutcome(nculSource || task.command, false, task.error)
      await selfModelLayer.onActionOutcome({
        taskId: task.id,
        success: false,
        summary: task.error,
        confidenceHint: evaluatedTask.confidence,
      })
      await narrativeMemory.append({
        type: 'task',
        summary: `Task blocked by low confidence: ${task.error}`,
        source: 'task-executor',
        importance: 0.8,
        metadata: {
          taskId: task.id,
          confidence: evaluatedTask.confidence,
          threshold: executionThreshold,
        },
      })
      return task
    }

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
      await this.logCommandOutcome(nculSource || task.command, false, loopBlockedReason)
      await selfModelLayer.onActionOutcome({
        taskId: task.id,
        success: false,
        summary: loopBlockedReason,
      })
      await narrativeMemory.append({
        type: 'task',
        summary: `Task blocked by loop guard: ${loopBlockedReason}`,
        source: 'task-executor',
        importance: 0.75,
        metadata: { taskId: task.id },
      })
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
        await this.logCommandOutcome(
          nculSource || task.command,
          true,
          result?.message || 'Task completed successfully.',
        )
        await selfModelLayer.onActionOutcome({
          taskId: task.id,
          success: true,
          summary: result?.message || 'Task completed',
          confidenceHint: evaluatedTask.confidence,
        })
        await narrativeMemory.append({
          type: 'task',
          summary: `Task completed: ${result?.message || task.id}`,
          source: 'task-executor',
          importance: 0.7,
          metadata: { taskId: task.id, command: nculSource || task.command },
        })
        await relationshipTracker
          .resolvePromiseFromTaskEvidence(
            task.id,
            `${nculSource || task.command} ${result?.message || ''}`,
            'completed',
          )
          .catch(() => false)
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
        await this.logCommandOutcome(
          nculSource || task.command,
          false,
          task.error || 'Task execution failed',
        )
        await selfModelLayer.onActionOutcome({
          taskId: task.id,
          success: false,
          summary: task.error || 'Task execution failed',
          confidenceHint: evaluatedTask.confidence,
        })
        await narrativeMemory.append({
          type: 'task',
          summary: `Task failed: ${task.error || 'Task execution failed'}`,
          source: 'task-executor',
          importance: 0.85,
          metadata: { taskId: task.id, command: nculSource || task.command },
        })
        await relationshipTracker
          .resolvePromiseFromTaskEvidence(
            task.id,
            `${nculSource || task.command} ${task.error || ''}`,
            'broken',
          )
          .catch(() => false)
      }
      task.completedAt = new Date()
      this.logReactiveActionToAgency(nculSource || task.command, result?.success ?? false)
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
      await this.logCommandOutcome(
        nculSource || task.command,
        false,
        task.error,
      )
      await selfModelLayer.onActionOutcome({
        taskId: task.id,
        success: false,
        summary: task.error,
        confidenceHint: evaluatedTask.confidence,
      })
      await narrativeMemory.append({
        type: 'system',
        summary: `Task executor exception: ${task.error}`,
        source: 'task-executor',
        importance: 0.9,
        metadata: { taskId: task.id },
      })
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
        priority: Math.round(parsed.confidence * 100),
      },
      'task-executor',
    )

    return task
  }

  async executeNaturalTask(nculTask: NCULTask, context: ExecutionContext): Promise<Task> {
    const actionMap: Record<string, { intent: string; action: string; subAgentRequired: boolean }> = {
      open_app: { intent: 'app_launch', action: 'launch_app', subAgentRequired: false },
      web_search: { intent: 'query', action: 'web_search', subAgentRequired: false },
      knowledge_query: { intent: 'query', action: 'knowledge_query', subAgentRequired: false },
      chat: { intent: 'query', action: 'knowledge_query', subAgentRequired: false },
      perform_task: { intent: 'query', action: 'open_and_control', subAgentRequired: true },
      system_command: { intent: 'query', action: 'system_control', subAgentRequired: false },
      multi_task: { intent: 'multi_action', action: 'open_and_control', subAgentRequired: true },
    }

    const mapped = actionMap[nculTask.intent] || {
      intent: 'query',
      action: 'knowledge_query',
      subAgentRequired: false,
    }

    const parsed: ParsedCommand = {
      intent: mapped.intent,
      action: mapped.action,
      parameters: {
        ...(nculTask.params || {}),
        target: nculTask.target,
        query: nculTask.target,
        app: nculTask.target,
        nculConfidence: nculTask.confidence,
      },
      confidence: nculTask.confidence,
      subAgentRequired: mapped.subAgentRequired,
    }

    const task = this.createTask(parsed)
    return this.executeTask(task, context)
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
    const match = input.match(/(?:open|launch|start|run)\s+([a-zA-Z0-9\s._-]+?)(?:\s+(?:on|in|using|for)\b.*|$)/i)
    const appNameRaw = match ? match[1].trim() : ''
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

  private extractSpecialFolderTarget(command: string): string {
    const params = this.parseTaskCommand(command)
    const explicit = String(
      params.folderName ||
        params.folder ||
        params.specialFolder ||
        params.target ||
        params.path ||
        ''
    ).trim()

    if (explicit) {
      return explicit
    }

    const lower = String(command || '').toLowerCase()
    const directMatch = lower.match(
      /\b(?:open|show|reveal|launch|go to|open the|show the)\s+(?:my\s+|the\s+)?(recycle bin|trash|desktop|downloads?|documents?|pictures?|photos?|music|videos?|home|app data|appdata|user data)\b/
    )

    if (directMatch?.[1]) {
      return directMatch[1]
    }

    if (/\b(recycle bin|trash)\b/.test(lower)) {
      return 'recycle bin'
    }

    return ''
  }

  private async openSpecialFolder(command: string): Promise<{ success: boolean; message: string }> {
    const folderTarget = this.extractSpecialFolderTarget(command)
    if (!folderTarget) {
      return { success: false, message: 'No special folder target detected.' }
    }

    if (folderTarget.toLowerCase().includes('recycle') || folderTarget.toLowerCase() === 'trash') {
      if (window.nativeBridge?.openRecycleBin) {
        return window.nativeBridge.openRecycleBin()
      }

      if (window.nativeBridge?.openSpecialFolder) {
        return window.nativeBridge.openSpecialFolder('recycle bin')
      }

      return { success: false, message: 'Recycle Bin bridge unavailable.' }
    }

    if (!window.nativeBridge?.openSpecialFolder) {
      return { success: false, message: 'Special folder bridge unavailable.' }
    }

    const result = await window.nativeBridge.openSpecialFolder(folderTarget)
    return result.success
      ? { success: true, message: result.message || `Opened ${folderTarget}.` }
      : { success: false, message: result.message || `Failed to open ${folderTarget}.` }
  }

  private async emptyRecycleBin(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.emptyRecycleBin) {
      return { success: false, message: 'Empty recycle bin bridge unavailable.' }
    }

    const result = await window.nativeBridge.emptyRecycleBin()
    return result.success
      ? { success: true, message: result.message || 'Emptied Recycle Bin.' }
      : { success: false, message: result.message || 'Failed to empty Recycle Bin.' }
  }

  private async showDesktop(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.showDesktop) {
      return { success: false, message: 'Show desktop bridge unavailable.' }
    }

    const result = await window.nativeBridge.showDesktop()
    return result.success
      ? { success: true, message: result.message || 'Showed desktop.' }
      : { success: false, message: result.message || 'Failed to show desktop.' }
  }

  private extractPathTargets(command: string): {
    sourcePath: string
    destinationPath: string
    targetPath: string
    newName: string
    identifier: string
  } {
    const params = this.parseTaskCommand(command)
    const sourcePath = String(params.sourcePath || params.source || params.filePath || params.path || params.target || '').trim()
    const destinationPath = String(params.destination || params.dest || params.to || params.newPath || params.output || '').trim()
    const targetPath = String(params.targetPath || params.path || params.filePath || params.folderPath || params.target || '').trim()
    const newName = String(params.newName || params.name || params.filename || '').trim()
    const identifier = String(params.pid || params.processId || params.process || params.app || params.name || '').trim()
    return { sourcePath, destinationPath, targetPath, newName, identifier }
  }

  private async listDirectory(command: string): Promise<{ success: boolean; message: string }> {
    const { targetPath } = this.extractPathTargets(command)
    const pathTarget = targetPath || String(command || '').replace(/^(?:list|show)\s+(?:contents of|files in|directory of)\s+/i, '').trim() || '.'

    if (window.nativeBridge?.listDir) {
      const result = await window.nativeBridge.listDir(pathTarget)
      if (result.success) {
        const rendered = (result.entries || []).map((item) => (item.isDir ? `[${item.name}]` : item.name))
        return {
          success: true,
          message: rendered.length ? `Contents of ${pathTarget}:\n${rendered.join('\n')}` : `No entries found in ${pathTarget}.`,
        }
      }
    }

    if (!window.nativeBridge?.runShellCommand) {
      return { success: false, message: 'Directory list bridge unavailable.' }
    }

    const platform = detectPlatform()
    const listCommand =
      platform === 'windows'
        ? `cmd /c dir /b "${pathTarget}"`
        : `ls -1 "${pathTarget}"`
    const result = await window.nativeBridge.runShellCommand(listCommand)
    return result.success
      ? { success: true, message: `Contents of ${pathTarget}:\n${String(result.output || '').trim()}` }
      : { success: false, message: result.error || result.message || 'Directory list failed.' }
  }

  private async createFolder(command: string): Promise<{ success: boolean; message: string }> {
    const { targetPath } = this.extractPathTargets(command)
    const parsed = targetPath || (String(command || '').match(/^(?:create|make|new)\s+folder\s+(.+)$/i)?.[1] || '').trim()
    if (!parsed) {
      return { success: false, message: 'No folder path provided.' }
    }

    if (!window.nativeBridge?.createFolder) {
      return { success: false, message: 'Create-folder bridge unavailable.' }
    }

    const result = await window.nativeBridge.createFolder(parsed)
    return result.success
      ? { success: true, message: result.message || `Created folder ${parsed}.` }
      : { success: false, message: result.message || `Failed to create folder ${parsed}.` }
  }

  private async copyPath(command: string): Promise<{ success: boolean; message: string }> {
    const { sourcePath, destinationPath } = this.extractPathTargets(command)
    const matched = String(command || '').match(/^(?:copy)\s+(.+?)\s+to\s+(.+)$/i)
    const source = sourcePath || matched?.[1]?.trim() || ''
    const destination = destinationPath || matched?.[2]?.trim() || ''
    if (!source || !destination) {
      return { success: false, message: 'Copy requires a source and destination path.' }
    }

    if (!window.nativeBridge?.copyPath) {
      return { success: false, message: 'Copy-path bridge unavailable.' }
    }

    const result = await window.nativeBridge.copyPath(source, destination)
    return result.success
      ? { success: true, message: result.message || `Copied ${source} to ${destination}.` }
      : { success: false, message: result.message || 'Copy failed.' }
  }

  private async movePath(command: string): Promise<{ success: boolean; message: string }> {
    const { sourcePath, destinationPath } = this.extractPathTargets(command)
    const matched = String(command || '').match(/^(?:move)\s+(.+?)\s+to\s+(.+)$/i)
    const source = sourcePath || matched?.[1]?.trim() || ''
    const destination = destinationPath || matched?.[2]?.trim() || ''
    if (!source || !destination) {
      return { success: false, message: 'Move requires a source and destination path.' }
    }

    if (!window.nativeBridge?.movePath) {
      return { success: false, message: 'Move-path bridge unavailable.' }
    }

    const result = await window.nativeBridge.movePath(source, destination)
    return result.success
      ? { success: true, message: result.message || `Moved ${source} to ${destination}.` }
      : { success: false, message: result.message || 'Move failed.' }
  }

  private async renamePath(command: string): Promise<{ success: boolean; message: string }> {
    const { sourcePath, newName } = this.extractPathTargets(command)
    const matched = String(command || '').match(/^(?:rename)\s+(.+?)\s+to\s+(.+)$/i)
    const source = sourcePath || matched?.[1]?.trim() || ''
    const renamed = newName || matched?.[2]?.trim() || ''
    if (!source || !renamed) {
      return { success: false, message: 'Rename requires a source path and a new name.' }
    }

    if (!window.nativeBridge?.renamePath) {
      return { success: false, message: 'Rename-path bridge unavailable.' }
    }

    const result = await window.nativeBridge.renamePath(source, renamed)
    return result.success
      ? { success: true, message: result.message || `Renamed ${source} to ${renamed}.` }
      : { success: false, message: result.message || 'Rename failed.' }
  }

  private async deletePath(command: string): Promise<{ success: boolean; message: string }> {
    const { targetPath } = this.extractPathTargets(command)
    const parsed = targetPath || String(command || '').replace(/^(?:delete|remove|trash)\s+/i, '').trim()
    if (!parsed) {
      return { success: false, message: 'No path provided for delete.' }
    }

    if (!window.nativeBridge?.deletePath) {
      return { success: false, message: 'Delete-path bridge unavailable.' }
    }

    const result = await window.nativeBridge.deletePath(parsed)
    return result.success
      ? { success: true, message: result.message || `Deleted ${parsed}.` }
      : { success: false, message: result.message || 'Delete failed.' }
  }

  private async openPathTarget(command: string): Promise<{ success: boolean; message: string }> {
    const { targetPath } = this.extractPathTargets(command)
    const parsed = targetPath || String(command || '').replace(/^(?:open|launch|show|reveal)\s+/i, '').trim()
    if (!parsed) {
      return { success: false, message: 'No path provided to open.' }
    }

    if (!window.nativeBridge?.openPath) {
      return { success: false, message: 'Open-path bridge unavailable.' }
    }

    const result = await window.nativeBridge.openPath(parsed)
    return result.success
      ? { success: true, message: result.message || `Opened ${parsed}.` }
      : { success: false, message: result.message || 'Open failed.' }
  }

  private async terminateProcess(command: string): Promise<{ success: boolean; message: string }> {
    const { identifier } = this.extractPathTargets(command)
    const parsed = identifier || String(command || '').replace(/^(?:kill|terminate|end\s+process|close\s+process)\s+/i, '').trim()
    if (!parsed) {
      return { success: false, message: 'No process identifier provided.' }
    }

    if (!window.nativeBridge?.terminateProcess) {
      return { success: false, message: 'Terminate-process bridge unavailable.' }
    }

    const result = await window.nativeBridge.terminateProcess(parsed)
    return result.success
      ? { success: true, message: result.message || `Terminated ${parsed}.` }
      : { success: false, message: result.message || `Failed to terminate ${parsed}.` }
  }

  private extractWindowTarget(command: string): string {
    const params = this.parseTaskCommand(command)
    const explicit = String(params.app || params.target || params.window || params.name || '').trim()
    if (explicit) {
      return explicit
    }

    const match = String(command || '').match(/^(?:focus|switch to|bring to front|open|activate|select|go to)\s+(?:the\s+)?(.+?)(?:\s+window)?$/i)
    return match?.[1]?.trim() || ''
  }

  private async controlWindow(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const operation = String(params.operation || '').toLowerCase().trim()
    const text = String(command || '').toLowerCase()

    let action: 'minimize' | 'maximize' | 'restore' | 'focus' | 'hide' | 'show' | '' = ''
    if (operation === 'minimize' || /\bminimize\b/.test(text)) action = 'minimize'
    else if (operation === 'maximize' || /\bmaximize\b/.test(text)) action = 'maximize'
    else if (operation === 'restore' || /\brestore\b/.test(text)) action = 'restore'
    else if (operation === 'focus' || /\bfocus\b/.test(text)) action = 'focus'
    else if (operation === 'hide' || /\bhide\b/.test(text)) action = 'hide'
    else if (operation === 'show' || /\bshow\b/.test(text)) action = 'show'

    if (!action) {
      return { success: false, message: 'No window operation detected.' }
    }

    if (!window.nativeBridge?.controlWindow) {
      return { success: false, message: 'Window control bridge unavailable.' }
    }

    const result = await window.nativeBridge.controlWindow(action)
    return result.success
      ? { success: true, message: result.message || `Window ${action}d.` }
      : { success: false, message: result.message || `Failed to ${action} window.` }
  }

  private async listRunningApps(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.listRunningApps) {
      return { success: false, message: 'Running-app list bridge unavailable.' }
    }

    const result = await window.nativeBridge.listRunningApps()
    if (!result.success) {
      return { success: false, message: result.message || 'Failed to list running apps.' }
    }

    const rendered = (result.apps || [])
      .slice(0, 12)
      .map((item) => item.windowTitle ? `${item.name} (${item.windowTitle})` : item.name)

    return {
      success: true,
      message: rendered.length
        ? `Running apps:\n${rendered.join('\n')}`
        : 'No running app entries were found.',
    }
  }

  private async getBrowserState(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.browser?.getState) {
      return { success: false, message: 'Browser state bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.getState()
    return result.success
      ? {
          success: true,
          message: `Browser state:\nTitle: ${result.title || 'unknown'}\nURL: ${result.url || 'unknown'}\nVisible: ${String(Boolean(result.visible))}\nFocused: ${String(Boolean(result.focused))}`,
        }
      : { success: false, message: result.message || 'Failed to read browser state.' }
  }

  private async reloadBrowser(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.browser?.reload) {
      return { success: false, message: 'Browser reload bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.reload()
    return result.success
      ? { success: true, message: `Reloaded browser page${result.title ? `: ${result.title}` : ''}.` }
      : { success: false, message: result.message || 'Failed to reload browser page.' }
  }

  private async openCurrentBrowserPage(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.browser?.openCurrent) {
      return { success: false, message: 'Browser current-page bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.openCurrent()
    return result.success
      ? { success: true, message: result.message || 'Opened current browser page externally.' }
      : { success: false, message: result.message || 'Failed to open current browser page externally.' }
  }

  private async browserNavigate(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const explicitUrl = String(params.url || params.target || params.link || '').trim()
    const query = String(params.query || params.searchQuery || '').trim()
    const target = explicitUrl || (query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : '')

    if (!target) {
      return { success: false, message: 'No browser URL or search query detected.' }
    }

    if (!window.nativeBridge?.browser?.launch || !window.nativeBridge?.browser?.execute) {
      return { success: false, message: 'Browser navigation bridge unavailable.' }
    }

    await window.nativeBridge.browser.launch({ headless: false })
    const result = await window.nativeBridge.browser.execute({ type: 'navigate', url: target })
    return result.success
      ? { success: true, message: `Opened browser page: ${result.url || target}` }
      : { success: false, message: result.error || `Failed to open browser page: ${target}` }
  }

  private async browserExtract(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const selector = String(params.selector || params.query || 'body').trim() || 'body'

    if (!window.nativeBridge?.browser?.execute) {
      return { success: false, message: 'Browser extract bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.execute({ type: 'extract', selector })
    return result.success
      ? { success: true, message: String(result.content || '').slice(0, 1500) || 'No content extracted.' }
      : { success: false, message: result.error || `Failed to extract content from ${selector}.` }
  }

  private async browserScreenshot(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const selector = String(params.selector || 'body').trim() || 'body'

    if (!window.nativeBridge?.browser?.execute) {
      return { success: false, message: 'Browser screenshot bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.execute({ type: 'screenshot', selector })
    return result.success
      ? { success: true, message: `Captured browser screenshot${result.title ? ` for ${result.title}` : ''}.` }
      : { success: false, message: result.error || 'Failed to capture browser screenshot.' }
  }

  private async browserClick(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const selector = String(params.selector || params.ref || params.target || '').trim()
    if (!selector) {
      return { success: false, message: 'No browser selector provided.' }
    }

    if (!window.nativeBridge?.browser?.execute) {
      return { success: false, message: 'Browser click bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.execute({ type: 'click', selector })
    return result.success
      ? { success: true, message: `Clicked browser element: ${selector}` }
      : { success: false, message: result.error || `Failed to click ${selector}.` }
  }

  private async browserType(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const selector = String(params.selector || params.ref || '').trim() || 'input,textarea,[contenteditable=true]'
    const value = String(params.text || params.value || params.message || '').trim()

    if (!value) {
      return { success: false, message: 'No browser text provided.' }
    }

    if (!window.nativeBridge?.browser?.execute) {
      return { success: false, message: 'Browser type bridge unavailable.' }
    }

    const result = await window.nativeBridge.browser.execute({ type: 'type', selector, value })
    return result.success
      ? { success: true, message: `Typed text in browser target: ${selector}` }
      : { success: false, message: result.error || `Failed to type into ${selector}.` }
  }

  // ── Phase 5: Bulk Automation & Content Processing Methods ────────────────
  private async compressPath(command: string): Promise<{ success: boolean; message: string }> {
    const sourceMatch = String(command).match(/^(?:compress|archive|zip)\s+(.+?)\s+(?:to|as|into)\s+(.+)$/i)
    const formatMatch = String(command).match(/(?:format|as|type).*?(zip|gzip|tar\.gz)(?:\b|$)/i)

    const source = sourceMatch?.[1]?.trim() || ''
    const destination = sourceMatch?.[2]?.trim() || ''
    const format = formatMatch?.[1]?.toLowerCase() || 'zip'

    if (!source || !destination) {
      return { success: false, message: 'Please specify source and destination paths.' }
    }

    if (!window.nativeBridge?.bulk?.compressPath) {
      return { success: false, message: 'Compression bridge unavailable.' }
    }

    return window.nativeBridge.bulk.compressPath(source, destination, format as 'zip' | 'tar.gz' | 'gzip')
  }

  private async extractArchive(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:extract|unzip|uncompress)\s+(.+?)\s+(?:to|into)\s+(.+)$/i)
    const archivePath = match?.[1]?.trim() || ''
    const destinationPath = match?.[2]?.trim() || ''

    if (!archivePath || !destinationPath) {
      return { success: false, message: 'Please specify archive and destination paths.' }
    }

    if (!window.nativeBridge?.bulk?.extractArchive) {
      return { success: false, message: 'Extraction bridge unavailable.' }
    }

    return window.nativeBridge.bulk.extractArchive(archivePath, destinationPath)
  }

  private async bulkMoveByPattern(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:bulk\s+)?move\s+(.+?)\s+(?:from|in)\s+(.+?)\s+to\s+(.+)$/i)
    const pattern = match?.[1]?.trim() || ''
    const sourceDir = match?.[2]?.trim() || ''
    const destinationDir = match?.[3]?.trim() || ''
    const useRegex = /regex|pattern|match/.test(command)

    if (!pattern || !sourceDir || !destinationDir) {
      return { success: false, message: 'Please specify pattern, source directory, and destination directory.' }
    }

    if (!window.nativeBridge?.bulk?.bulkMoveByPattern) {
      return { success: false, message: 'Bulk move bridge unavailable.' }
    }

    return window.nativeBridge.bulk.bulkMoveByPattern(sourceDir, pattern, destinationDir, useRegex)
  }

  private async searchFileContent(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:search|grep|find)\s+(?:for\s+)?["\']?(.+?)["\']?\s+(?:in|within)\s+(.+?)(?:\s+(?:files|type).*?([.\w*]+))?$/i)
    const textPattern = match?.[1]?.trim() || ''
    const searchDir = match?.[2]?.trim() || ''
    const fileExtPattern = match?.[3]?.trim() || ''

    if (!textPattern || !searchDir) {
      return { success: false, message: 'Please specify search text and directory.' }
    }

    if (!window.nativeBridge?.bulk?.searchFileContent) {
      return { success: false, message: 'Search bridge unavailable.' }
    }

    return window.nativeBridge.bulk.searchFileContent(searchDir, textPattern, fileExtPattern || '.*')
  }

  private async getFileStats(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:stats|info|metadata|properties)\s+(?:of|for)?\s+(.+)$/i)
    const filePath = match?.[1]?.trim() || ''

    if (!filePath) {
      return { success: false, message: 'Please specify a file path.' }
    }

    if (!window.nativeBridge?.bulk?.getFileStats) {
      return { success: false, message: 'File stats bridge unavailable.' }
    }

    const result = await window.nativeBridge.bulk.getFileStats(filePath)
    if (result.success && result.stats) {
      const s = result.stats
      return {
        success: true,
        message: `File stats: size=${s.size} bytes, modified=${s.modified}, hash=${s.sha256.substring(0, 16)}...`,
      }
    }
    return result
  }

  private async calculateHash(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:hash|checksum)\s+(?:of\s+)?(.+?)(?:\s+using|algorithm)?\s*(sha256|sha512|md5)?$/i)
    const filePath = match?.[1]?.trim() || ''
    const algorithm = match?.[2]?.toLowerCase() || 'sha256'

    if (!filePath) {
      return { success: false, message: 'Please specify a file path.' }
    }

    if (!window.nativeBridge?.bulk?.calculateHash) {
      return { success: false, message: 'Hash calculation bridge unavailable.' }
    }

    return window.nativeBridge.bulk.calculateHash(filePath, algorithm as 'sha256' | 'sha512' | 'md5')
  }

  // ── Phase 6: Advanced Automation & System Monitoring Methods ────────────────
  private async getSystemResources(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.monitor?.getSystemResources) {
      return { success: false, message: 'System resources bridge unavailable.' }
    }

    const result = await window.nativeBridge.monitor.getSystemResources()
    if (result.success && result.resources) {
      const r = result.resources
      return {
        success: true,
        message: `System: ${r.memoryPercent.toFixed(1)}% RAM, load avg ${r.loadAverage.oneMin.toFixed(2)}, uptime ${Math.floor(r.uptime / 3600)}h`,
      }
    }
    return result as any
  }

  private async getDiskUsage(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:disk|storage)\s+(?:of|for)?\s*(.*)$/i)
    const dirPath = match?.[1]?.trim() || '/'

    if (!window.nativeBridge?.monitor?.getDiskUsage) {
      return { success: false, message: 'Disk usage bridge unavailable.' }
    }

    const result = await window.nativeBridge.monitor.getDiskUsage(dirPath)
    if (result.success && result.diskPercent !== undefined) {
      return {
        success: true,
        message: `Disk ${dirPath}: ${result.diskPercent.toFixed(1)}% used (${Math.round(result.diskUsed! / (1024 * 1024 * 1024))}GB / ${Math.round(result.diskTotal! / (1024 * 1024 * 1024))}GB)`,
      }
    }
    return result as any
  }

  private async getSystemInfo(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.monitor?.getSystemInfo) {
      return { success: false, message: 'System info bridge unavailable.' }
    }

    const result = await window.nativeBridge.monitor.getSystemInfo()
    if (result.success && result.info) {
      const i = result.info
      return {
        success: true,
        message: `System: ${i.platform} ${i.arch}, ${i.hostname}, uptime ${Math.floor(i.uptime / 3600)}h`,
      }
    }
    return result as any
  }

  private async getEnvVar(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:get|show|print)?\s*(?:env|environment)?\s*(?:variable)?\s*(.+)$/i)
    const varName = match?.[1]?.trim() || ''

    if (!varName) {
      return { success: false, message: 'Please specify an environment variable name.' }
    }

    if (!window.nativeBridge?.environment?.getEnvVar) {
      return { success: false, message: 'Environment bridge unavailable.' }
    }

    const result = await window.nativeBridge.environment.getEnvVar(varName)
    if (result.success) {
      return {
        success: true,
        message: result.found ? `${varName}=${result.value}` : `Variable '${varName}' not found.`,
      }
    }
    return result as any
  }

  private async setEnvVar(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:set)\s+(?:env|environment)?\s*(?:variable)?\s+(.+?)\s*=\s*(.+)$/i)
    const varName = match?.[1]?.trim() || ''
    const value = match?.[2]?.trim() || ''

    if (!varName || !value) {
      return { success: false, message: 'Please specify variable name and value (name=value).' }
    }

    if (!window.nativeBridge?.environment?.setEnvVar) {
      return { success: false, message: 'Environment bridge unavailable.' }
    }

    return window.nativeBridge.environment.setEnvVar(varName, value)
  }

  private async listEnvVars(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:list|show)\s+(?:env|environment|variables)(?:\s+matching|containing)?\s*(.*)$/i)
    const filterPattern = match?.[1]?.trim() || ''

    if (!window.nativeBridge?.environment?.listEnvVars) {
      return { success: false, message: 'Environment bridge unavailable.' }
    }

    const result = await window.nativeBridge.environment.listEnvVars(filterPattern)
    if (result.success) {
      const varNames = Object.keys(result.variables || {}).slice(0, 20)
      return {
        success: true,
        message: `Found ${result.count} variables${filterPattern ? ` matching '${filterPattern}'` : ''}. First: ${varNames.join(', ')}${result.count! > 20 ? '...' : ''}`,
      }
    }
    return result as any
  }

  private async scheduleTask(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:schedule|run)\s+(?:in|after)?\s*(\d+)\s*(?:ms|milliseconds|s|seconds|m|minutes)\s*(?:command)?\s*(.*)$/i)
    const delayValue = parseInt(match?.[1] || '0')
    const delayUnit = String(command).match(/\b(ms|milliseconds|s|seconds|m|minutes)\b/i)?.[1]?.toLowerCase() || 'ms'
    const taskCommand = match?.[2]?.trim() || ''

    const delayMsMap: Record<string, number> = {
      ms: 1,
      milliseconds: 1,
      s: 1000,
      seconds: 1000,
      m: 60000,
      minutes: 60000,
    }

    const delayMs = delayValue * (delayMsMap[delayUnit] || 1000)

    if (!delayValue || !taskCommand) {
      return { success: false, message: 'Please specify delay and command: "schedule in 5 seconds command echo hello"' }
    }

    if (!window.nativeBridge?.automation?.scheduleTask) {
      return { success: false, message: 'Task scheduling bridge unavailable.' }
    }

    const result = await window.nativeBridge.automation.scheduleTask(delayMs, taskCommand)
    if (result.success) {
      return {
        success: true,
        message: `Task scheduled: ${result.taskId} will execute at ${result.executeAt}`,
      }
    }
    return result as any
  }

  private async cancelTask(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:cancel|stop)\s+(?:task)?\s*(.+)$/i)
    const taskId = match?.[1]?.trim() || ''

    if (!taskId) {
      return { success: false, message: 'Please specify a task ID to cancel.' }
    }

    if (!window.nativeBridge?.automation?.cancelTask) {
      return { success: false, message: 'Task cancellation bridge unavailable.' }
    }

    return window.nativeBridge.automation.cancelTask(taskId)
  }

  private async listScheduledTasks(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.automation?.listScheduledTasks) {
      return { success: false, message: 'Scheduled tasks bridge unavailable.' }
    }

    const result = await window.nativeBridge.automation.listScheduledTasks()
    if (result.success) {
      const taskIds = (result.tasks || []).map((t) => t.taskId)
      return {
        success: true,
        message: result.count === 0 ? 'No scheduled tasks.' : `${result.count} tasks scheduled: ${taskIds.join(', ')}`,
      }
    }
    return result as any
  }

  private async handleNativeBrowserFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'browser_state' || action === 'browser_info' || /\b(browser\s+state|page\s+info|current\s+page)\b/.test(lower)) {
      return this.getBrowserState()
    }

    if (action === 'browser_reload' || action === 'reload_browser' || /\b(?:reload|refresh)\s+(?:browser|page|tab)\b/.test(lower)) {
      return this.reloadBrowser()
    }

    if (action === 'browser_open_current' || /\bopen\s+(?:current|this)\s+page\b/.test(lower)) {
      return this.openCurrentBrowserPage()
    }

    if (action === 'browser_navigate' || action === 'browser_open' || action === 'open_url' || /\b(?:open|go to|navigate to|visit)\b/.test(lower)) {
      return this.browserNavigate(command)
    }

    if (action === 'browser_extract' || /\b(?:extract|read|summarize)\b.*\b(?:page|website|site|article|content)\b/.test(lower)) {
      return this.browserExtract(command)
    }

    if (action === 'browser_screenshot' || /\b(?:screenshot|capture)\b.*\b(?:browser|page|site|tab)\b/.test(lower)) {
      return this.browserScreenshot(command)
    }

    if (action === 'browser_click' || /\bclick\b.*\b(?:browser|page|site|tab)\b/.test(lower)) {
      return this.browserClick(command)
    }

    if (action === 'browser_type' || /\btype\b.*\b(?:browser|page|site|tab)\b/.test(lower)) {
      return this.browserType(command)
    }

    return null
  }

  private async handleNativeBulkFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'bulk_compress' || action === 'compress' || /\b(?:compress|archive|zip|tar)\b/.test(lower)) {
      return this.compressPath(command)
    }

    if (action === 'bulk_extract' || action === 'extract' || action === 'uncompress' || /\b(?:extract|unzip|uncompress|untar)\b/.test(lower)) {
      return this.extractArchive(command)
    }

    if (action === 'bulk_move' || action === 'bulk_move_pattern' || /\bbulk\s+move\b/.test(lower)) {
      return this.bulkMoveByPattern(command)
    }

    if (action === 'bulk_search' || action === 'search_content' || /\b(?:search|grep|find)\b.*\b(?:in|within|across)\b/.test(lower)) {
      return this.searchFileContent(command)
    }

    if (action === 'file_stats' || action === 'file_info' || /\b(?:stats|info|metadata|properties|file)\s+(?:info|stats|metadata)\b/.test(lower)) {
      return this.getFileStats(command)
    }

    if (action === 'calculate_hash' || action === 'hash' || /\b(?:hash|checksum)\b/.test(lower)) {
      return this.calculateHash(command)
    }

    return null
  }

  // ── Phase 7: Advanced System Interaction & Utilities Methods ───────────────
  private async getClipboard(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.clipboard?.getClipboard) {
      return { success: false, message: 'Clipboard bridge unavailable.' }
    }

    const result = await window.nativeBridge.clipboard.getClipboard()
    if (result.success) {
      return {
        success: true,
        message: `Clipboard: ${result.text?.substring(0, 100)}${result.length! > 100 ? '...' : ''}`,
      }
    }
    return result as any
  }

  private async setClipboard(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:copy|set|paste)\s+(?:to\s+clipboard|in\s+clipboard)?\s*(.+)$/i)
    const text = match?.[1]?.trim() || ''

    if (!text) {
      return { success: false, message: 'Please specify text to copy.' }
    }

    if (!window.nativeBridge?.clipboard?.setClipboard) {
      return { success: false, message: 'Clipboard bridge unavailable.' }
    }

    return window.nativeBridge.clipboard.setClipboard(text)
  }

  private async clearClipboard(): Promise<{ success: boolean; message: string }> {
    if (!window.nativeBridge?.clipboard?.clearClipboard) {
      return { success: false, message: 'Clipboard bridge unavailable.' }
    }

    return window.nativeBridge.clipboard.clearClipboard()
  }

  private async moveWindow(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:move|position)\s+(?:window|app)\s+(?:to\s+)?(\d+)\s*[,\s]\s*(\d+)(?:\s+(\d+)\s*[,\s]\s*(\d+))?$/i)
    const x = parseInt(match?.[1] || '0')
    const y = parseInt(match?.[2] || '0')
    const width = match?.[3] ? parseInt(match[3]) : undefined
    const height = match?.[4] ? parseInt(match[4]) : undefined

    if (!x || !y) {
      return { success: false, message: 'Please specify coordinates: "move window to 100 200"' }
    }

    if (!window.nativeBridge?.window?.moveWindow) {
      return { success: false, message: 'Window movement bridge unavailable.' }
    }

    const result = await window.nativeBridge.window.moveWindow(x, y, width, height)
    if (result.success) {
      return { success: true, message: `Window moved to ${result.x}, ${result.y}` }
    }
    return result as any
  }

  private async snapWindow(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:snap|align)\s+(?:window|app)\s+(?:to\s+)?(?:the\s+)?(.+)$/i)
    const edge = (match?.[1]?.trim() || 'center').toLowerCase() as any

    if (!window.nativeBridge?.window?.snapWindow) {
      return { success: false, message: 'Window snapping bridge unavailable.' }
    }

    const result = await window.nativeBridge.window.snapWindow(edge)
    if (result.success) {
      return { success: true, message: `Window snapped to ${result.edge}` }
    }
    return result as any
  }

  private async controlMedia(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:media|music|audio).*?(play|pause|next|previous|stop|volumeup|volumedown|mute)/i)
    const mediaCmd = match?.[1]?.toLowerCase() || 'play'

    if (!window.nativeBridge?.media?.control) {
      return { success: false, message: 'Media control bridge unavailable.' }
    }

    return window.nativeBridge.media.control(mediaCmd as any)
  }

  private async checkConnectivity(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:ping|check|test).*?(?:to\s+)?([a-z0-9\-\.]+)?$/i)
    const host = match?.[1]?.trim() || '8.8.8.8'

    if (!window.nativeBridge?.network?.checkConnectivity) {
      return { success: false, message: 'Network bridge unavailable.' }
    }

    const result = await window.nativeBridge.network.checkConnectivity(host)
    if (result.success) {
      return {
        success: true,
        message: result.reachable ? `Host ${host} is reachable.` : `Host ${host} is not reachable.`,
      }
    }
    return result as any
  }

  private async showNotification(command: string): Promise<{ success: boolean; message: string }> {
    const match = String(command).match(/^(?:notify|notification|alert)\s+(?:"(.+?)"|'(.+?)'|(.+?))\s+(?:"(.+?)"|'(.+?)'|(.+))$/i)
    const title = match?.[1] || match?.[2] || match?.[3] || 'Notification'
    const message = match?.[4] || match?.[5] || match?.[6] || 'Message'

    if (!window.nativeBridge?.notifications?.show) {
      return { success: false, message: 'Notifications bridge unavailable.' }
    }

    return window.nativeBridge.notifications.show(title, message)
  }

  private async handleNativeSystemFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'get_system_resources' || action === 'system_resources' || /\b(?:system|resources|performance|status)\b/.test(lower)) {
      return this.getSystemResources()
    }

    if (action === 'get_disk_usage' || action === 'disk' || /\b(?:disk|storage|space|drive)\b/.test(lower)) {
      return this.getDiskUsage(command)
    }

    if (action === 'get_system_info' || action === 'system_info' || /\bsystem\s+info\b/.test(lower)) {
      return this.getSystemInfo()
    }

    if (action === 'get_env_var' || action === 'env' || /\b(?:get|show|print|echo)\s+(?:env|environment)\b/.test(lower)) {
      return this.getEnvVar(command)
    }

    if (action === 'set_env_var' || /\bset\s+(?:env|environment|variable)\b/.test(lower)) {
      return this.setEnvVar(command)
    }

    if (action === 'list_env_vars' || /\b(?:list|show|print)\s+(?:env|environment|variables)\b/.test(lower)) {
      return this.listEnvVars(command)
    }

    if (action === 'schedule_task' || action === 'schedule' || /\b(?:schedule|run\s+(?:in|after))\b/.test(lower)) {
      return this.scheduleTask(command)
    }

    if (action === 'cancel_task' || action === 'cancel' || /\bcancel\s+(?:task|scheduled)\b/.test(lower)) {
      return this.cancelTask(command)
    }

    if (action === 'list_scheduled_tasks' || /\b(?:list|show)\s+(?:scheduled|pending)\s+tasks\b/.test(lower)) {
      return this.listScheduledTasks()
    }

    return null
  }

  private async handleNativeAdvancedFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'get_clipboard' || action === 'clipboard' || /\b(?:get|read|show)\s+(?:clipboard|copy)\b/.test(lower)) {
      return this.getClipboard()
    }

    if (action === 'set_clipboard' || /\b(?:copy|set|put)\s+(?:to\s+clipboard|in\s+clipboard)\b/.test(lower)) {
      return this.setClipboard(command)
    }

    if (action === 'clear_clipboard' || /\bclear\s+(?:clipboard|copyboard)\b/.test(lower)) {
      return this.clearClipboard()
    }

    if (action === 'move_window' || action === 'position_window' || /\b(?:move|position)\s+(?:window|app|application)\b/.test(lower)) {
      return this.moveWindow(command)
    }

    if (action === 'snap_window' || action === 'snap' || /\b(?:snap|align)\s+(?:window|app|application)\b/.test(lower)) {
      return this.snapWindow(command)
    }

    if (action === 'media_control' || action === 'media' || /\b(?:play|pause|next|previous|music|forward|back)\b/.test(lower)) {
      return this.controlMedia(command)
    }

    if (action === 'check_connectivity' || action === 'connectivity' || /\b(?:ping|check\s+(?:network|connection)|connectivity)\b/.test(lower)) {
      return this.checkConnectivity(command)
    }

    if (action === 'show_notification' || action === 'notify' || /\b(?:notify|notification|alert|send\s+notification)\b/.test(lower)) {
      return this.showNotification(command)
    }

    return null
  }

  private async focusApp(command: string): Promise<{ success: boolean; message: string }> {
    const target = this.extractWindowTarget(command)
    if (!target) {
      return { success: false, message: 'No app name detected for focus command.' }
    }

    if (!window.nativeBridge?.focusApp) {
      return { success: false, message: 'Focus-app bridge unavailable.' }
    }

    const result = await window.nativeBridge.focusApp(target)
    return result.success
      ? { success: true, message: result.message || `Focused ${target}.` }
      : { success: false, message: result.message || `Failed to focus ${target}.` }
  }

  private async revealInFolder(command: string): Promise<{ success: boolean; message: string }> {
    const params = this.parseTaskCommand(command)
    const explicit = String(params.filePath || params.path || params.target || params.item || '').trim()
    let targetPath = explicit

    if (!targetPath) {
      const lower = String(command || '').toLowerCase()
      const pathMatch = command.match(/(?:reveal|show|open)\s+(.+?)\s+(?:in\s+folder|location|containing\s+folder)$/i)
      if (pathMatch?.[1]) {
        targetPath = pathMatch[1].trim()
      } else if (/\b(open|show|reveal)\s+(.+)$/i.test(command) && lower.includes('folder')) {
        targetPath = command.replace(/^(?:reveal|show|open)\s+/i, '').replace(/\s+(?:in\s+folder|location|containing\s+folder)$/i, '').trim()
      }
    }

    if (!targetPath) {
      return { success: false, message: 'No file or folder path detected for reveal command.' }
    }

    if (!window.nativeBridge?.revealInFolder) {
      return { success: false, message: 'Reveal-in-folder bridge unavailable.' }
    }

    const result = await window.nativeBridge.revealInFolder(targetPath)
    return result.success
      ? { success: true, message: result.message || `Revealed ${targetPath}.` }
      : { success: false, message: result.message || `Failed to reveal ${targetPath}.` }
  }

  private async handleNativeUtilityFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (
      action === 'open_special_folder' ||
      action === 'open_recycle_bin' ||
      action === 'open_trash' ||
      /\b(open|show|launch)\s+.*\b(desktop|downloads?|documents?|pictures?|photos?|music|videos?|home|app data|appdata|user data)\b/.test(lower) ||
      /\b(recycle bin|trash)\b/.test(lower)
    ) {
      return this.openSpecialFolder(command)
    }

    if (action === 'empty_recycle_bin' || /\bempty\s+(?:the\s+)?(?:recycle bin|trash)\b/.test(lower)) {
      return this.emptyRecycleBin()
    }

    if (action === 'show_desktop' || /\bshow\s+desktop\b/.test(lower)) {
      return this.showDesktop()
    }

    if (action === 'reveal_in_folder' || /\b(?:reveal|show|open)\b.*\b(?:in\s+folder|location|containing\s+folder)\b/.test(lower)) {
      return this.revealInFolder(command)
    }

    return null
  }

  private async handleNativeWindowFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'list_running_apps' || action === 'running_apps_report' || action === 'app_inventory' || /\b(?:running|open|active)\s+apps\b/.test(lower)) {
      return this.listRunningApps()
    }

    if (action === 'focus_app' || action === 'switch_to_app' || action === 'focus_window' || /\b(?:focus|switch to|bring to front|activate)\b/.test(lower)) {
      return this.focusApp(command)
    }

    if (action === 'window_control' || /\b(?:minimize|maximize|restore|hide)\b.*\bwindow\b/.test(lower)) {
      return this.controlWindow(command)
    }

    return null
  }

  private async handleNativeFileProcessFallback(command: string, action: string): Promise<{ success: boolean; message: string } | null> {
    const lower = String(command || '').toLowerCase()

    if (action === 'create_folder' || /\b(?:create|make|new)\s+folder\b/.test(lower)) {
      return this.createFolder(command)
    }

    if (action === 'copy_path' || /\bcopy\b.*\bto\b/.test(lower)) {
      return this.copyPath(command)
    }

    if (action === 'move_path' || /\bmove\b.*\bto\b/.test(lower)) {
      return this.movePath(command)
    }

    if (action === 'rename_path' || /\brename\b.*\bto\b/.test(lower)) {
      return this.renamePath(command)
    }

    if (action === 'delete_path' || /\b(?:delete|remove|trash)\b/.test(lower)) {
      return this.deletePath(command)
    }

    if (action === 'open_path' || action === 'open_file' || action === 'open_folder' || /\b(?:open|launch|show|reveal)\b/.test(lower)) {
      return this.openPathTarget(command)
    }

    if (action === 'list_directory' || action === 'list_dir' || /\b(?:list|show)\s+(?:contents|files|directory)\b/.test(lower)) {
      return this.listDirectory(command)
    }

    if (action === 'terminate_process' || action === 'kill_process' || /\b(?:kill|terminate|end process|close process)\b/.test(lower)) {
      return this.terminateProcess(command)
    }

    return null
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

    const nativeWindowFallback = await this.handleNativeWindowFallback(command, action)
    if (nativeWindowFallback) {
      return nativeWindowFallback
    }

    const nativeBrowserFallback = await this.handleNativeBrowserFallback(command, action)
    if (nativeBrowserFallback) {
      return nativeBrowserFallback
    }

    const nativeBulkFallback = await this.handleNativeBulkFallback(command, action)
    if (nativeBulkFallback) {
      return nativeBulkFallback
    }

    const nativeSystemFallback = await this.handleNativeSystemFallback(command, action)
    if (nativeSystemFallback) {
      return nativeSystemFallback
    }

    const nativeAdvancedFallback = await this.handleNativeAdvancedFallback(command, action)
    if (nativeAdvancedFallback) {
      return nativeAdvancedFallback
    }

    const nativeUtilityFallback = await this.handleNativeUtilityFallback(command, action)
    if (nativeUtilityFallback) {
      return nativeUtilityFallback
    }

    const nativeFileProcessFallback = await this.handleNativeFileProcessFallback(command, action)
    if (nativeFileProcessFallback) {
      return nativeFileProcessFallback
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
    const destinationPath = String(params.destination || params.dest || params.to || params.newPath || '').trim()
    const newName = String(params.newName || params.name || params.filename || '').trim()
    const platform = detectPlatform()

    if (!targetPath && !['list', 'open', 'create'].includes(operation) && !destinationPath && !newName) {
      return { success: false, message: 'No file path provided.' }
    }

    if (operation === 'create' || operation === 'mkdir' || operation === 'create_folder') {
      if (window.nativeBridge?.createFolder) {
        const result = await window.nativeBridge.createFolder(targetPath)
        return result.success
          ? { success: true, message: result.message || `Created folder: ${targetPath}` }
          : { success: false, message: result.message || 'Create folder failed.' }
      }
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

    if (operation === 'open') {
      if (window.nativeBridge?.openPath) {
        const result = await window.nativeBridge.openPath(targetPath)
        return result.success
          ? { success: true, message: result.message || `Opened ${targetPath}` }
          : { success: false, message: result.message || 'Open failed.' }
      }
    }

    if (operation === 'rename') {
      if (window.nativeBridge?.renamePath) {
        const result = await window.nativeBridge.renamePath(targetPath, newName)
        return result.success
          ? { success: true, message: result.message || `Renamed ${targetPath} to ${newName}` }
          : { success: false, message: result.message || 'Rename failed.' }
      }
    }

    if (operation === 'copy') {
      if (window.nativeBridge?.copyPath) {
        const result = await window.nativeBridge.copyPath(targetPath, destinationPath)
        return result.success
          ? { success: true, message: result.message || `Copied ${targetPath} to ${destinationPath}` }
          : { success: false, message: result.message || 'Copy failed.' }
      }
    }

    if (operation === 'move') {
      if (window.nativeBridge?.movePath) {
        const result = await window.nativeBridge.movePath(targetPath, destinationPath)
        return result.success
          ? { success: true, message: result.message || `Moved ${targetPath} to ${destinationPath}` }
          : { success: false, message: result.message || 'Move failed.' }
      }
    }

    if (operation === 'delete') {
      if (window.nativeBridge?.deletePath) {
        const result = await window.nativeBridge.deletePath(targetPath)
        return result.success
          ? { success: true, message: result.message || `Deleted file: ${targetPath}` }
          : { success: false, message: result.message || 'Delete failed.' }
      }

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
      if (window.nativeBridge?.listDir) {
        const result = await window.nativeBridge.listDir(targetPath || '.')
        if (result.success) {
          const entries = (result.entries || []).map((item) => (item.isDir ? `[${item.name}]` : item.name))
          return { success: true, message: `Files in ${targetPath || '.'}:\n${entries.join('\n')}` }
        }
      }

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

  private async logCommandOutcome(command: string, success: boolean, detail: string): Promise<void> {
    const key = success ? 'ncul_command_success' : 'ncul_command_failure'
    const payload = `${new Date().toISOString()} | ${command} | ${detail}`
    await memoryEngine.rememberFact(`${key}_${Date.now()}`, payload, success ? 'habit' : 'fact')
  }

  private logReactiveActionToAgency(command: string, success: boolean): void {
    void intentionalAgencyLayer.proposeAction({
      description: `User command executed ${success ? 'successfully' : 'with issues'}: ${command}`,
      source: 'task-executor-reactive-feedback',
      context: {
        originalCommand: command,
        success,
      },
    })
  }
}

export default new TaskExecutor()
