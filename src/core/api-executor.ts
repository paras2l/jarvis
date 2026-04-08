/**
 * APIExecutor - Parallel API execution with fallback chains
 * Executes multiple APIs concurrently, aggregates results, handles errors
 */

import type { APIConfig, APIProvider } from '../types'
import { APISelector, type SelectionResult } from './api-selector'
import { apiRegistry } from './api-registry'

export interface APIResponse {
  provider: APIProvider
  configId: string
  success: boolean
  data?: unknown
  error?: string
  executionTimeMs: number
}

export interface ExecutionOptions {
  parallel?: boolean
  timeout?: number
  recordUsage?: boolean
  aggregatorFn?: (responses: APIResponse[]) => unknown
}

export class APIExecutor {
  /**
   * Execute query using intelligent API selection and fallback
   */
  static async executeQuery(
    query: string,
    options: ExecutionOptions = {}
  ): Promise<{ result: unknown; stats: APIResponse[] }> {
    // Select appropriate API(s)
    const selections = APISelector.selectAPIs(query)

    const parallel = options.parallel ?? true
    const timeout = options.timeout ?? apiRegistry.getRegistryConfig().timeoutMs
    const recordUsage = options.recordUsage ?? true
    const aggregator = options.aggregatorFn ?? this.defaultAggregator

    const allResponses: APIResponse[] = []

    // Execute selections
    if (parallel) {
      // Execute all selections in parallel
      const executionPromises = selections.map(selection =>
        this.executeSelection(selection, query, timeout, recordUsage)
      )

      const batchResults = await Promise.allSettled(executionPromises)
      
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          allResponses.push(...result.value)
        }
      })
    } else {
      // Execute sequentially with fallback
      for (const selection of selections) {
        const responses = await this.executeSelection(selection, query, timeout, recordUsage)
        allResponses.push(...responses)

        // If primary succeeded, don't try fallbacks
        if (responses[0]?.success) {
          break
        }
      }
    }

    // Aggregate results
    const successResponses = allResponses.filter(r => r.success)
    const result = successResponses.length > 0
      ? aggregator(successResponses)
      : { error: 'All APIs failed', details: allResponses }

    return { result, stats: allResponses }
  }

  /**
   * Execute a single API selection with its fallbacks
   */
  private static async executeSelection(
    selection: SelectionResult,
    query: string,
    timeout: number,
    recordUsage: boolean
  ): Promise<APIResponse[]> {
    const responses: APIResponse[] = []

    // Try primary
    const primaryResponse = await this.executeAPI(
      selection.primary,
      query,
      timeout
    )
    responses.push(primaryResponse)

    if (recordUsage) {
      apiRegistry.recordUsage(selection.primary.id)
    }

    if (primaryResponse.success) {
      return responses
    }

    // Try fallbacks
    for (const fallback of selection.fallbacks) {
      const fallbackResponse = await this.executeAPI(fallback, query, timeout)
      responses.push(fallbackResponse)

      if (recordUsage) {
        apiRegistry.recordUsage(fallback.id)
      }

      if (fallbackResponse.success) {
        return responses
      }
    }

    return responses
  }

  /**
   * Execute single API call with timeout
   */
  private static async executeAPI(
    config: APIConfig,
    query: string,
    timeout: number
  ): Promise<APIResponse> {
    const startTime = performance.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(this.buildEndpoint(config), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'User-Agent': 'Pixi/v4.0'
        },
        body: JSON.stringify({ query, model: this.getDefaultModel(config.provider) }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()

      return {
        provider: config.provider,
        configId: config.id,
        success: true,
        data,
        executionTimeMs: performance.now() - startTime
      }
    } catch (error) {
      return {
        provider: config.provider,
        configId: config.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime
      }
    }
  }

  /**
   * Build API endpoint based on provider
   */
  private static buildEndpoint(config: APIConfig): string {
    const endpoints: Record<APIProvider, string> = {
      'nvidia': 'https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions',
      'huggingface': 'https://api-inference.huggingface.co/models/',
      'replicate': 'https://api.replicate.com/v1/predictions',
      'openai': 'https://api.openai.com/v1/chat/completions',
      'custom': config.apiKey.startsWith('http') ? config.apiKey : 'http://localhost:8000/api/query'
    }
    return endpoints[config.provider]
  }

  /**
   * Get default model for provider
   */
  private static getDefaultModel(provider: APIProvider): string {
    const models: Record<APIProvider, string> = {
      'nvidia': 'llama-2-70b', // NVIDIA NIM default
      'huggingface': 'meta-llama/Llama-2-70b',
      'replicate': 'meta/llama-2-70b-chat',
      'openai': 'gpt-4-turbo',
      'custom': 'default'
    }
    return models[provider]
  }

  /**
   * Default response aggregator
   */
  private static defaultAggregator(responses: APIResponse[]): unknown {
    if (responses.length === 0) {
      return { error: 'No successful responses' }
    }

    if (responses.length === 1) {
      return responses[0].data
    }

    // For multiple responses, merge intelligently
    return {
      primary: responses[0].data,
      sources: responses.map(r => ({
        provider: r.provider,
        data: r.data,
        executionTimeMs: r.executionTimeMs
      })),
      aggregatedAt: new Date().toISOString()
    }
  }
}

