import { mcpConnector, type MCPCallResult } from '@/core/mcp-connector'
import { multimodalVision } from '@/vision/multimodal-vision'

export type VoiceToolIntent = 'action' | 'research' | 'memory' | 'system'

export interface VoiceToolBackendResult {
  handled: boolean
  success: boolean
  summary?: string
  intent?: VoiceToolIntent
  error?: string
  toolName?: string
}

class VoiceToolBackend {
  private mcpInitialized = false

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  }

  async execute(command: string, signal?: AbortSignal): Promise<VoiceToolBackendResult> {
    if (signal?.aborted) {
      return { handled: true, success: false, error: 'Command cancelled.' }
    }

    await this.ensureMcpInitialized()
    this.throwIfAborted(signal)

    const selectedTool = this.pickPreferredTool(command)
    const likelyToolRequest = this.looksLikeToolRequest(command)
    const matchedTool = selectedTool
      ? mcpConnector.getAllTools().find((tool) => tool.name === selectedTool) || null
      : mcpConnector.findToolForRequest(command)

    if (!likelyToolRequest && !matchedTool) {
      return { handled: false, success: false }
    }

    if (!matchedTool) {
      const fallback = await this.runStructuredFallback(selectedTool, command, signal)
      if (fallback) return fallback
      return {
        handled: true,
        success: false,
        error: 'No matching MCP tool is available for this request.',
      }
    }

    const args = this.buildToolArgs(matchedTool.name, command)
    const result = await mcpConnector.callTool(matchedTool.name, args, signal)
    return this.mapToolCallResult(result)
  }

  private async ensureMcpInitialized(): Promise<void> {
    if (this.mcpInitialized) return
    this.mcpInitialized = true

    try {
      await mcpConnector.registerPopularServers()
    } catch {
      // Keep tool flow alive even if MCP bootstrap fails.
    }
  }

  private looksLikeToolRequest(command: string): boolean {
    const lower = command.toLowerCase()
    return /(news|headline|search|fetch|url|file|folder|directory|database|query|remember|recall|time|system|read|write|list|table|web|website|monitor|world)/.test(lower)
  }

  private pickPreferredTool(command: string): string | null {
    const lower = command.toLowerCase()
    const available = new Set(mcpConnector.listToolNames())

    const choose = (toolName: string): string | null => (available.has(toolName) ? toolName : null)

    if (/(scan\s+screen|analyze\s+screen|read\s+screen|what\s+is\s+on\s+screen|ocr)/.test(lower)) return choose('analyze_screen') || 'analyze_screen'
    if (/(world\s+news|global\s+news|latest\s+news|news\s+update)/.test(lower)) return choose('get_world_news') || 'get_world_news'
    if (/(world\s+monitor|global\s+monitor|open\s+monitor)/.test(lower)) return choose('open_world_monitor') || 'open_world_monitor'
    if (/(system\s+info|device\s+info|machine\s+info|pc\s+info)/.test(lower)) return choose('get_system_info') || 'get_system_info'

    if (/(read|open|show).*(file|document|txt|json|md)\b/.test(lower)) return choose('read_file')
    if (/(write|save|create).*(file|document|txt|json|md)\b/.test(lower)) return choose('write_file')
    if (/(list|show).*(directory|folder|files)\b/.test(lower)) return choose('list_directory')
    if (/(search|find).*(file|folder|directory)\b/.test(lower)) return choose('search_files')
    if (/(fetch|open|visit|read).*(https?:\/\/|website|url|web page)\b/.test(lower)) return choose('fetch_url')
    if (/(search|look up|google|bing|web)\b/.test(lower)) return choose('search_web') || 'search_web'
    if (/(select|query|sql|database|table|rows)\b/.test(lower)) return choose('query_db')
    if (/(insert|update|delete).*(database|table|row|sql)\b/.test(lower)) return choose('execute_db')
    if (/(remember|store|save).*(fact|memory|note)?\b/.test(lower)) return choose('remember')
    if (/(recall|remember|retrieve|what do you know)\b/.test(lower)) return choose('recall')

    return null
  }

  private buildToolArgs(toolName: string, command: string): Record<string, unknown> {
    const lower = command.toLowerCase().trim()

    if (toolName === 'get_world_news') {
      return { category: 'world', limit: 8 }
    }

    if (toolName === 'analyze_screen') {
      return { scope: 'desktop', mode: 'ocr+summary' }
    }

    if (toolName === 'open_world_monitor') {
      return { section: 'world' }
    }

    if (toolName === 'get_system_info') {
      return { detail: 'standard' }
    }

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

  private async runStructuredFallback(toolName: string | null, command: string, signal?: AbortSignal): Promise<VoiceToolBackendResult | null> {
    this.throwIfAborted(signal)

    if (toolName === 'search_web') {
      const query = command.replace(/^(search|find|look up)\s+/i, '').trim() || command
      const result = await mcpConnector.callTool('fetch_url', {
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      }, signal)
      return this.mapToolCallResult(result, 'search_web')
    }

    if (toolName === 'analyze_screen') {
      const analysis = await multimodalVision.analyzeCurrentScreen('Summarize visible UI, key actions, and any warnings.')
      this.throwIfAborted(signal)
      const response = [
        `Screen summary: ${analysis.summary}`,
        analysis.ocrText ? `OCR: ${analysis.ocrText.slice(0, 300)}` : 'OCR: none detected',
        `Confidence: ${Math.round(analysis.confidence * 100)}%`,
      ].join('\n')

      return {
        handled: true,
        success: true,
        summary: response,
        intent: 'research',
        toolName: 'analyze_screen',
      }
    }

    if (toolName === 'get_world_news') {
      const result = await mcpConnector.callTool('fetch_url', {
        url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en',
      }, signal)
      return this.mapToolCallResult(result, 'get_world_news')
    }

    if (toolName === 'open_world_monitor') {
      return {
        handled: true,
        success: true,
        summary: 'World monitor ready. Open this for live global tracking: https://www.worldometers.info/',
        intent: 'research',
        toolName: 'open_world_monitor',
      }
    }

    if (toolName === 'get_system_info' && window.nativeBridge?.monitor?.getSystemInfo) {
      const info = await window.nativeBridge.monitor.getSystemInfo()
      this.throwIfAborted(signal)
      if (!info.success || !info.info) {
        return {
          handled: true,
          success: false,
          error: info.message || 'Could not read system info.',
          toolName: 'get_system_info',
        }
      }

      const payload = info.info
      return {
        handled: true,
        success: true,
        summary: `System: ${payload.platform} ${payload.arch}. Host: ${payload.hostname}. Uptime: ${Math.round(payload.uptime)}s.`,
        intent: 'system',
        toolName: 'get_system_info',
      }
    }

    return null
  }

  private mapToolCallResult(result: MCPCallResult, toolOverride?: string): VoiceToolBackendResult {
    if (!result.success) {
      return {
        handled: true,
        success: false,
        error: result.error || 'Unknown MCP tool error.',
        toolName: toolOverride || result.toolName,
      }
    }

    const textParts = result.content
      .map((item) => item.text || '')
      .filter((item) => item.trim().length > 0)

    return {
      handled: true,
      success: true,
      summary: textParts.join('\n').slice(0, 900) || 'Tool execution completed successfully.',
      intent: this.classifyToolIntent(toolOverride || result.toolName),
      toolName: toolOverride || result.toolName,
    }
  }

  private classifyToolIntent(toolName: string): VoiceToolIntent {
    const name = toolName.toLowerCase()
    if (name.includes('remember') || name.includes('recall') || name.includes('memory')) {
      return 'memory'
    }
    if (name.includes('system')) {
      return 'system'
    }
    if (name.includes('query') || name.includes('search') || name.includes('fetch') || name.includes('read') || name.includes('news') || name.includes('monitor')) {
      return 'research'
    }
    return 'action'
  }
}

export const voiceToolBackend = new VoiceToolBackend()
