/**
 * Local LLM Engine â€” Feature #1
 *
 * Connects to Ollama running locally at http://localhost:11434
 * Runs models like Qwen3:8b, Llama3, Mistral, DeepSeek-Coder for FREE.
 *
 * This is the core that kills 80%+ of cloud API costs.
 * The agent thinks locally first â€” cloud is only the fallback.
 *
 * Inspired by OpenPixi's local-first philosophy (Stanford).
 * Re-architected from scratch for our Electron/TypeScript stack.
 */

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface LocalLLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LocalLLMResponse {
  content: string
  model: string
  latencyMs: number
  tokensUsed?: number
  source: 'local' | 'unavailable'
}

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  parameterSize?: string
}

// â”€â”€ Supported Models (priority order) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MODEL_PRIORITY = [
  'qwen3:8b',         // Best reasoning, relatively small
  'qwen3:4b',         // Faster, still good
  'mistral:7b',       // General purpose
  'llama3:8b',        // Meta's model
  'deepseek-coder:6.7b', // For code tasks
  'phi3:mini',        // Tiny but capable
  'llama3.2:3b',      // Very fast
]

const OLLAMA_BASE = 'http://localhost:11434'

// â”€â”€ LocalLLMEngine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class LocalLLMEngine {
  private availableModels: string[] = []
  private activeModel: string | null = null
  private isOnline = false
  private lastHealthCheck = 0
  private readonly HEALTH_INTERVAL = 30_000  // recheck every 30s

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Query the local LLM. Falls back gracefully if Ollama is not running.
   * Returns `source: 'unavailable'` so the caller can try cloud.
   */
  async query(
    prompt: string,
    options: {
      model?: string
      system?: string
      temperature?: number
      maxTokens?: number
    } = {}
  ): Promise<LocalLLMResponse> {
    await this.ensureHealthy()

    if (!this.isOnline || !this.activeModel) {
      return {
        content: '',
        model: 'none',
        latencyMs: 0,
        source: 'unavailable',
      }
    }

    const model = options.model || this.activeModel
    const messages: LocalLLMMessage[] = []

    if (options.system) {
      messages.push({ role: 'system', content: options.system })
    }
    messages.push({ role: 'user', content: prompt })

    const start = Date.now()
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.3,
            num_predict: options.maxTokens ?? 2048,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      })

      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)

      const json = await res.json() as {
        message?: { content?: string }
        prompt_eval_count?: number
        eval_count?: number
      }

      return {
        content: json.message?.content ?? '',
        model,
        latencyMs: Date.now() - start,
        tokensUsed: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
        source: 'local',
      }
    } catch (err) {
      console.warn('[LocalLLM] Query failed:', err)
      this.isOnline = false
      return { content: '', model, latencyMs: Date.now() - start, source: 'unavailable' }
    }
  }

  /**
   * Stream a response token-by-token (for real-time UI updates).
   */
  async *stream(
    prompt: string,
    system?: string,
    model?: string
  ): AsyncGenerator<string> {
    await this.ensureHealthy()
    if (!this.isOnline || !this.activeModel) return

    const useModel = model || this.activeModel
    const messages: LocalLLMMessage[] = []
    if (system) messages.push({ role: 'system', content: system })
    messages.push({ role: 'user', content: prompt })

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: useModel, messages, stream: true }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok || !res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const json = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
            if (json.message?.content) yield json.message.content
            if (json.done) return
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      console.warn('[LocalLLM] Stream failed:', err)
    }
  }

  /**
   * Check if Ollama is running and which models are available.
   */
  async checkHealth(): Promise<{ online: boolean; models: string[]; activeModel: string | null }> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) throw new Error('Not reachable')

      const json = await res.json() as { models?: OllamaModel[] }
      this.availableModels = (json.models ?? []).map(m => m.name)
      this.isOnline = true
      this.lastHealthCheck = Date.now()

      // Pick the best available model from priority list
      this.activeModel = null
      for (const preferred of MODEL_PRIORITY) {
        if (this.availableModels.some(m => m.startsWith(preferred.split(':')[0]))) {
          this.activeModel = this.availableModels.find(m => m.startsWith(preferred.split(':')[0])) ?? null
          break
        }
      }

      // Fallback: just use whatever is installed
      if (!this.activeModel && this.availableModels.length > 0) {
        this.activeModel = this.availableModels[0]
      }

      console.log(`[LocalLLM] âœ… Online. Active: ${this.activeModel}. Available: ${this.availableModels.join(', ')}`)
      return { online: true, models: this.availableModels, activeModel: this.activeModel }
    } catch {
      this.isOnline = false
      this.activeModel = null
      console.log('[LocalLLM] âš¡ Ollama not running â€” cloud fallback active')
      return { online: false, models: [], activeModel: null }
    }
  }

  /**
   * Pull a model from ollama registry (downloads it locally).
   * e.g. localLLM.pullModel('qwen3:8b')
   */
  async pullModel(modelName: string, onProgress?: (pct: number) => void): Promise<boolean> {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: true }),
      })
      if (!res.ok || !res.body) return false

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let done = false

      while (!done) {
        const { done: d, value } = await reader.read()
        done = d
        if (value) {
          const lines = decoder.decode(value).split('\n').filter(Boolean)
          for (const line of lines) {
            try {
              const j = JSON.parse(line) as { status?: string; completed?: number; total?: number }
              if (j.completed && j.total && onProgress) {
                onProgress(Math.round((j.completed / j.total) * 100))
              }
            } catch { /* skip */ }
          }
        }
      }
      await this.checkHealth() // refresh model list
      return true
    } catch {
      return false
    }
  }

  /**
   * Get a simple one-shot answer. Best for quick queries.
   * Returns raw string content.
   */
  async ask(question: string, systemPrompt?: string): Promise<string> {
    const res = await this.query(question, { system: systemPrompt })
    return res.content
  }

  getStatus(): { online: boolean; activeModel: string | null; availableModels: string[] } {
    return {
      online: this.isOnline,
      activeModel: this.activeModel,
      availableModels: this.availableModels,
    }
  }

  setModel(modelName: string): void {
    if (this.availableModels.includes(modelName)) {
      this.activeModel = modelName
      console.log(`[LocalLLM] Switched to: ${modelName}`)
    }
  }

  // â”€â”€ Private â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async ensureHealthy(): Promise<void> {
    const now = Date.now()
    if (now - this.lastHealthCheck > this.HEALTH_INTERVAL) {
      await this.checkHealth()
    }
  }
}

export const localLLM = new LocalLLMEngine()

// Auto health-check on load (non-blocking)
localLLM.checkHealth().catch(() => { /* silent */ })

