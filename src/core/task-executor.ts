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

/**
 * Task Executor
 * Handles parsing and execution of user commands
 * Phase 3: Enhanced with comprehensive app registry support
 */
class TaskExecutor {
  private executionQueue: Task[] = []
  private executingTask: Task | null = null
  private appRegistry = getAppRegistry()

  /**
   * Parse user command
   * Phase 3: Extracts device targets from natural language
   */
  parseCommand(input: string): ParsedCommand {
    const lowerInput = input.toLowerCase()
    
    // Extract device target if specified (e.g., "on phone", "on my mobile", "on laptop")
    const targetDevice = this.extractDeviceTarget(input)

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
    task.status = 'executing'
    this.executingTask = task

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
      } else {
        task.status = 'failed'
        task.error = result?.message || 'Task execution failed'
      }
      task.completedAt = new Date()
    } catch (error) {
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : 'Unknown error'
      task.completedAt = new Date()
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

    return {
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

  private async enforceCentralPolicy(task: Task, context: ExecutionContext): Promise<PolicyResult> {
    const command = this.parseTaskCommand(task.command)
    const inputText = String(command.originalCommand || command.query || task.command || '')
    const normalized = inputText.toLowerCase()
    const auth = await getAuthenticatedContext()

    const decision = await policyGateway.decide({
      requestId: `tx_${task.id}_${Date.now()}`,
      agentId: context.agentId,
      action: task.type,
      command: inputText,
      source: context.device === 'desktop' ? 'local' : 'remote',
      explicitPermission: true,
      targetApp: String(command.app || ''),
      targetDeviceId: command.targetDevice ? String(command.targetDevice) : undefined,
      riskScore: this.estimateTaskRisk(task.type, normalized),
      requestedPrivileges: this.getRequestedPrivileges(task.type, normalized),
      deviceState: 'idle',
      occurredAt: Date.now(),
      policyPack: policyGateway.getPolicyPack(),
      emergency: normalized.includes('emergency') || normalized.includes('urgent'),
      commander: auth.commander,
      codeword: auth.codeword,
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

    if (!launchOrchestrator.getPermissionState().uiAutomation) {
      return {
        success: false,
        message: 'UI automation is disabled. Open Permission Center and enable it first.',
      }
    }

    if (!targetApp) {
      return {
        success: false,
        message: `No screen-control target was detected for ${context.platform}.`,
      }
    }

    if (typeof window === 'undefined' || !window.nativeBridge?.openAppAssistive) {
      return {
        success: false,
        message: 'Assistive screen control is unavailable in this runtime.',
      }
    }

    const result = await window.nativeBridge.openAppAssistive(targetApp)
    return {
      success: result.success,
      message: result.message,
    }
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
}

export default new TaskExecutor()
