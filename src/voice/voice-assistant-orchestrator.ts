import { detectPlatform } from '@/core/platform/platform-detection'
import { mcpConnector } from '@/core/mcp-connector'
import { naturalCommandLayer, type NCULTask } from '@/core/natural-command-layer'
import taskExecutor from '@/core/task-executor'
import { reflectionEngine } from '@/core/reflection-engine'
import { runtimePolicyStore } from '@/core/runtime-policy'
import type { ExecutionContext } from '@/types'

export type VoiceSpeechIntent =
  | 'confirmation'
  | 'action'
  | 'research'
  | 'memory'
  | 'system'
  | 'conversation'
  | 'error'

export interface VoiceSpeechPlan {
  intent: VoiceSpeechIntent
  tempo: 'fast' | 'normal' | 'slow'
  brevity: 'short' | 'normal' | 'detailed' | 'auto'
  priority: 'low' | 'normal' | 'high'
}

interface VoiceOrchestrationResult {
  handled: boolean
  success: boolean
  speech?: string
  speechPlan?: VoiceSpeechPlan
}

interface PendingConfirmationOutcome {
  type: 'none' | 'response' | 'execute'
  result?: VoiceOrchestrationResult
  command?: string
}

class VoiceAssistantOrchestrator {
  private mcpInitialized = false
  private inFlightCommands = new Set<string>()
  private lastCommandKey = ''
  private lastCommandAt = 0
  private pendingSensitiveCommand: { command: string; expiresAt: number } | null = null

  private readonly DUPLICATE_WINDOW_MS = 1_600
  private readonly SENSITIVE_CONFIRM_WINDOW_MS = 20_000
  private readonly MAX_SPOKEN_RESPONSE_CHARS = 420

  async handle(command: string): Promise<VoiceOrchestrationResult> {
    const trimmed = String(command || '').trim()
    if (!trimmed) {
      return { handled: false, success: false }
    }

    let normalizedCommand = this.normalizeVoiceCommand(trimmed)
    if (!normalizedCommand) {
      return { handled: false, success: false }
    }

    if (this.isDuplicateCommand(normalizedCommand)) {
      return { handled: true, success: true }
    }

    const confirmationOutcome = this.handlePendingConfirmation(normalizedCommand)
    if (confirmationOutcome.type === 'response' && confirmationOutcome.result) {
      return confirmationOutcome.result
    }
    if (confirmationOutcome.type === 'execute' && confirmationOutcome.command) {
      normalizedCommand = confirmationOutcome.command
    }

    if (this.requiresSensitiveConfirmation(normalizedCommand)) {
      this.pendingSensitiveCommand = {
        command: normalizedCommand,
        expiresAt: Date.now() + this.SENSITIVE_CONFIRM_WINDOW_MS,
      }
      return {
        handled: true,
        success: true,
        speech: 'That is a sensitive action. Say confirm to continue or cancel to abort.',
        speechPlan: {
          intent: 'system',
          tempo: 'normal',
          brevity: 'short',
          priority: 'high',
        },
      }
    }

    if (this.inFlightCommands.has(normalizedCommand)) {
      return {
        handled: true,
        success: true,
        speech: 'Already processing that request.',
        speechPlan: {
          intent: 'confirmation',
          tempo: 'fast',
          brevity: 'short',
          priority: 'normal',
        },
      }
    }

    this.inFlightCommands.add(normalizedCommand)

    try {
      return await this.executeCommand(normalizedCommand)
    } catch (error) {
      return {
        handled: true,
        success: false,
        speech: this.polishSpeech(`I hit an error while processing that command. ${String(error || '')}`.trim()),
        speechPlan: {
          intent: 'error',
          tempo: 'slow',
          brevity: 'normal',
          priority: 'high',
        },
      }
    } finally {
      this.inFlightCommands.delete(normalizedCommand)
    }
  }

  private async executeCommand(command: string): Promise<VoiceOrchestrationResult> {
    await this.ensureMcpInitialized()

    const mcpResult = await this.tryMcpFirst(command)
    if (mcpResult.handled) {
      return mcpResult
    }

    const nculTask = await naturalCommandLayer.interpret(command)

    if (!this.isConversationalIntent(nculTask) && nculTask.confidence < 0.56) {
      return {
        handled: true,
        success: false,
        speech: this.polishSpeech('I am not confident about that command. Please rephrase with more detail.'),
        speechPlan: {
          intent: 'conversation',
          tempo: 'slow',
          brevity: 'normal',
          priority: 'normal',
        },
      }
    }

    if (this.isConversationalIntent(nculTask)) {
      const response = await naturalCommandLayer.createAdaptiveResponse(
        command,
        {
          silentMode: runtimePolicyStore.get().proactiveVoice === false,
        },
      )
      return {
        handled: true,
        success: true,
        speech: this.polishSpeech(response),
        speechPlan: {
          intent: 'conversation',
          tempo: 'slow',
          brevity: 'detailed',
          priority: 'normal',
        },
      }
    }

    const taskResult = await taskExecutor.executeNaturalTask(nculTask, this.buildExecutionContext())
    const success = taskResult.status === 'completed'
    const summary = this.summarizeTaskOutcome(taskResult)

    await reflectionEngine.reflectTask(taskResult.id, {
      success,
      output: success ? summary : undefined,
      error: success ? undefined : summary,
    })

    return {
      handled: true,
      success,
      speech: this.polishSpeech(success ? `Done. ${summary}` : `I could not complete that. ${summary}`),
      speechPlan: {
        intent: this.classifyIntentFromTask(nculTask),
        tempo: success ? 'fast' : 'normal',
        brevity: success ? 'auto' : 'normal',
        priority: success ? 'normal' : 'high',
      },
    }
  }

  private async ensureMcpInitialized(): Promise<void> {
    if (this.mcpInitialized) return
    this.mcpInitialized = true

    try {
      await mcpConnector.registerPopularServers()
    } catch {
      // Keep voice flow alive even if MCP bootstrap fails.
    }
  }

  private async tryMcpFirst(command: string): Promise<VoiceOrchestrationResult> {
    const selectedTool = this.pickToolForCommand(command)
    const likelyToolRequest = this.looksLikeToolRequest(command)
    const matchedTool = selectedTool ? mcpConnector.getAllTools().find((tool) => tool.name === selectedTool) || null : mcpConnector.findToolForRequest(command)

    if (!likelyToolRequest && !matchedTool) {
      return { handled: false, success: false }
    }

    if (!matchedTool) {
      return {
        handled: true,
        success: false,
        speech: this.polishSpeech('I could not find a matching MCP tool for that request.'),
        speechPlan: {
          intent: 'error',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'high',
        },
      }
    }

    const args = this.buildToolArgs(matchedTool.name, command)
    const result = await mcpConnector.callTool(matchedTool.name, args)

    if (!result.success) {
      return {
        handled: true,
        success: false,
        speech: this.polishSpeech(`Tool execution failed. ${result.error || 'Unknown MCP error.'}`),
        speechPlan: {
          intent: 'error',
          tempo: 'normal',
          brevity: 'normal',
          priority: 'high',
        },
      }
    }

    const textParts = result.content
      .map((item) => item.text || '')
      .filter((item) => item.trim().length > 0)

    const summary = textParts.join('\n').slice(0, 700)
    const mcpIntent = this.classifyToolIntent(matchedTool.name)
    return {
      handled: true,
      success: true,
      speech: this.polishSpeech(summary || 'The tool finished successfully.'),
      speechPlan: {
        intent: mcpIntent,
        tempo: mcpIntent === 'research' ? 'slow' : 'normal',
        brevity: mcpIntent === 'research' ? 'detailed' : 'normal',
        priority: 'normal',
      },
    }
  }

  private looksLikeToolRequest(command: string): boolean {
    const lower = command.toLowerCase()
    return /(news|headline|search|fetch|url|file|folder|directory|database|query|remember|recall|time|system|read|write|list|table|web|website)/.test(lower)
  }

  private pickToolForCommand(command: string): string | null {
    const lower = command.toLowerCase()
    const available = new Set(mcpConnector.listToolNames())

    const choose = (toolName: string): string | null => (available.has(toolName) ? toolName : null)

    if (/(read|open|show).*(file|document|txt|json|md)\b/.test(lower)) return choose('read_file')
    if (/(write|save|create).*(file|document|txt|json|md)\b/.test(lower)) return choose('write_file')
    if (/(list|show).*(directory|folder|files)\b/.test(lower)) return choose('list_directory')
    if (/(search|find).*(file|folder|directory)\b/.test(lower)) return choose('search_files')
    if (/(fetch|open|visit|read).*(https?:\/\/|website|url|web page)\b/.test(lower)) return choose('fetch_url')
    if (/(search|look up|google|bing|web)\b/.test(lower)) return choose('search_web')
    if (/(select|query|sql|database|table|rows)\b/.test(lower)) return choose('query_db')
    if (/(insert|update|delete).*(database|table|row|sql)\b/.test(lower)) return choose('execute_db')
    if (/(remember|store|save).*(fact|memory|note)?\b/.test(lower)) return choose('remember')
    if (/(recall|remember|retrieve|what do you know)\b/.test(lower)) return choose('recall')

    return null
  }

  private buildToolArgs(toolName: string, command: string): Record<string, unknown> {
    const lower = command.toLowerCase().trim()

    if (toolName === 'fetch_url') {
      const urlMatch = command.match(/https?:\/\/\S+/i)
      return { url: urlMatch ? urlMatch[0] : command }
    }

    if (toolName === 'search_files') {
      return {
        path: '.',
        pattern: lower.replace(/^(search|find)\s+/, ''),
      }
    }

    if (toolName === 'read_file') {
      return {
        path: command.replace(/^(read|open|show)\s+/i, '').trim(),
      }
    }

    if (toolName === 'write_file') {
      const pathMatch = command.match(/(?:to|in)\s+([\w./\\-]+\.[a-z0-9]+)/i)
      return {
        path: pathMatch ? pathMatch[1] : 'voice-output.txt',
        content: command,
      }
    }

    if (toolName === 'list_directory') {
      const folderMatch = command.match(/(?:in|inside)\s+([\w./\\-]+)/i)
      return {
        path: folderMatch ? folderMatch[1] : '.',
      }
    }

    if (toolName === 'list_tables') {
      return {}
    }

    if (toolName === 'fetch_markdown') {
      const urlMatch = command.match(/https?:\/\/\S+/i)
      return { url: urlMatch ? urlMatch[0] : command }
    }

    if (toolName === 'query_db' || toolName === 'execute_db') {
      return {
        query: command,
      }
    }

    if (toolName === 'remember' || toolName === 'recall') {
      return {
        query: command,
        content: command,
      }
    }

    if (toolName === 'search_web') {
      return {
        query: command.replace(/^(search|find|look up)\s+/i, '').trim(),
      }
    }

    return { query: command }
  }

  private isConversationalIntent(task: NCULTask): boolean {
    return task.intent === 'chat' || task.intent === 'knowledge_query'
  }

  private classifyIntentFromTask(task: NCULTask): VoiceSpeechIntent {
    switch (task.intent) {
      case 'open_app':
      case 'perform_task':
      case 'multi_task':
        return 'action'
      case 'web_search':
      case 'knowledge_query':
        return 'research'
      case 'system_command':
        return 'system'
      case 'chat':
      default:
        return 'conversation'
    }
  }

  private classifyToolIntent(toolName: string): VoiceSpeechIntent {
    const name = toolName.toLowerCase()
    if (name.includes('remember') || name.includes('recall') || name.includes('memory')) {
      return 'memory'
    }
    if (name.includes('query') || name.includes('search') || name.includes('fetch') || name.includes('read')) {
      return 'research'
    }
    if (name.includes('execute') || name.includes('write') || name.includes('list')) {
      return 'action'
    }
    return 'action'
  }

  private normalizeVoiceCommand(command: string): string {
    let normalized = command.trim().toLowerCase()
    normalized = normalized.replace(/[!?.,]+$/g, '').trim()
    normalized = normalized.replace(/^(please|jarvis|patrich|patrick)\s+/i, '').trim()
    normalized = normalized.replace(/\s+/g, ' ')
    return normalized
  }

  private isDuplicateCommand(command: string): boolean {
    const now = Date.now()
    const duplicate = this.lastCommandKey === command && now - this.lastCommandAt <= this.DUPLICATE_WINDOW_MS
    this.lastCommandKey = command
    this.lastCommandAt = now
    return duplicate
  }

  private handlePendingConfirmation(command: string): PendingConfirmationOutcome {
    if (!this.pendingSensitiveCommand) {
      return { type: 'none' }
    }

    const now = Date.now()
    if (now > this.pendingSensitiveCommand.expiresAt) {
      this.pendingSensitiveCommand = null
      return { type: 'none' }
    }

    if (this.isCancelPhrase(command)) {
      this.pendingSensitiveCommand = null
      return {
        type: 'response',
        result: {
          handled: true,
          success: true,
          speech: 'Cancelled.',
          speechPlan: {
            intent: 'confirmation',
            tempo: 'fast',
            brevity: 'short',
            priority: 'normal',
          },
        },
      }
    }

    if (this.isConfirmationPhrase(command)) {
      const pending = this.pendingSensitiveCommand.command
      this.pendingSensitiveCommand = null
      return {
        type: 'execute',
        command: pending,
      }
    }

    return {
      type: 'response',
      result: {
        handled: true,
        success: false,
        speech: 'A sensitive command is pending. Say confirm to continue or cancel to abort.',
        speechPlan: {
          intent: 'system',
          tempo: 'normal',
          brevity: 'short',
          priority: 'high',
        },
      },
    }
  }

  private isConfirmationPhrase(command: string): boolean {
    return /^(confirm|yes|do it|proceed|continue|approved?)\b/.test(command)
  }

  private isCancelPhrase(command: string): boolean {
    return /^(cancel|stop|never mind|abort|dont|do not)\b/.test(command)
  }

  private requiresSensitiveConfirmation(command: string): boolean {
    if (/\bconfirm\b/.test(command)) return false
    return /(shutdown|restart|sleep|power off|format|wipe|factory reset|delete all|erase|clear all)/.test(command)
  }

  private buildExecutionContext(): ExecutionContext {
    const platform = detectPlatform()
    const runtimePlatform =
      platform === 'windows' || platform === 'macos' || platform === 'linux' || platform === 'android' || platform === 'ios'
        ? platform
        : 'windows'

    const device: 'desktop' | 'mobile' =
      runtimePlatform === 'android' || runtimePlatform === 'ios' ? 'mobile' : 'desktop'

    return {
      userId: 'voice-user',
      agentId: 'voice-agent',
      taskId: `voice_task_${Date.now()}`,
      device,
      platform: runtimePlatform,
    }
  }

  private summarizeTaskOutcome(taskResult: { status: string; result?: unknown; error?: string }): string {
    if (typeof taskResult.result === 'string' && taskResult.result.trim()) {
      return taskResult.result.trim()
    }

    if (taskResult.result && typeof taskResult.result === 'object') {
      const asRecord = taskResult.result as Record<string, unknown>
      if (typeof asRecord.message === 'string' && asRecord.message.trim()) {
        return asRecord.message.trim()
      }
      if (typeof asRecord.output === 'string' && asRecord.output.trim()) {
        return asRecord.output.trim()
      }
    }

    if (taskResult.status === 'completed') {
      return 'Task completed.'
    }

    return taskResult.error || 'Task execution failed.'
  }

  private polishSpeech(raw: string): string {
    let text = String(raw || '').trim()
    if (!text) return ''

    text = text.replace(/```[\s\S]*?```/g, ' details omitted ')
    text = text.replace(/`([^`]+)`/g, '$1')
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    text = text.replace(/https?:\/\/\S+/gi, 'link')
    text = text.replace(/[\r\n]+/g, '. ')
    text = text.replace(/\s+/g, ' ').trim()

    if (text.length > this.MAX_SPOKEN_RESPONSE_CHARS) {
      text = text.slice(0, this.MAX_SPOKEN_RESPONSE_CHARS)
      text = text.replace(/\s+\S*$/, '').trim()
      text = `${text}.`
    }

    return text
  }
}

export const voiceAssistantOrchestrator = new VoiceAssistantOrchestrator()
