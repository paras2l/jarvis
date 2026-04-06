/**
 * APISelector - Intelligent query routing to best API(s)
 * Analyzes intent and selects optimal API configuration(s) for execution
 */

import type { APIConfig, APIProvider } from '../types'
import { apiRegistry } from './api-registry'

export interface SelectionResult {
  primary: APIConfig
  fallbacks: APIConfig[]
  reasoning: string
  priority: 'execution' | 'knowledge' | 'creative' | 'mixed'
}

export class APISelector {
  /**
   * Analyze query and select appropriate APIs
   */
  static selectAPIs(query: string): SelectionResult[] {
    const intent = this.analyzeIntent(query)
    const results: SelectionResult[] = []

    // Get available providers
    const availableProviders = apiRegistry.getAvailableProviders()
    
    if (availableProviders.length === 0) {
      throw new Error('No API configurations available')
    }

    // Route based on intent
    switch (intent) {
      case 'execution':
        // Code execution, terminal commands, system tasks
        results.push(this.selectExecutionAPI(availableProviders))
        break
      case 'knowledge':
        // Research, QA, context retrieval
        results.push(this.selectKnowledgeAPI(availableProviders))
        break
      case 'creative':
        // Image generation, video, voice synthesis
        results.push(this.selectCreativeAPI(availableProviders))
        break
      case 'mixed':
        // Complex multi-modal task
        results.push(this.selectExecutionAPI(availableProviders))
        results.push(this.selectKnowledgeAPI(availableProviders))
        break
      default:
        // Default: use all available
        const primary = availableProviders[0]
        const config = apiRegistry.getConfigsByProvider(primary)?.[0]
        if (!config) throw new Error(`No config for ${primary}`)
        results.push({
          primary: config,
          fallbacks: this.getFallbackConfigs(primary),
          reasoning: 'Default routing (mixed intent)',
          priority: 'mixed'
        })
    }

    return results
  }

  /**
   * Analyze query intent keywords
   */
  private static analyzeIntent(query: string): string {
    const lower = query.toLowerCase()

    // Execution indicators
    if (
      lower.includes('run') || 
      lower.includes('execute') || 
      lower.includes('command') ||
      lower.includes('shell') ||
      lower.includes('script') ||
      lower.includes('terminal')
    ) {
      return 'execution'
    }

    // Creative indicators
    if (
      lower.includes('generate') || 
      lower.includes('image') || 
      lower.includes('video') ||
      lower.includes('draw') ||
      lower.includes('create visual') ||
      lower.includes('voice')
    ) {
      return 'creative'
    }

    // Knowledge indicators
    if (
      lower.includes('explain') || 
      lower.includes('what') || 
      lower.includes('research') ||
      lower.includes('learn') ||
      lower.includes('tell me') ||
      lower.includes('summarize') ||
      lower.includes('analyze')
    ) {
      return 'knowledge'
    }

    // Multi-task
    if (query.split('.').length > 2 || query.split('and').length > 2) {
      return 'mixed'
    }

    return 'knowledge' // Default to knowledge
  }

  /**
   * Select best API for code execution
   */
  private static selectExecutionAPI(available: APIProvider[]): SelectionResult {
    // Preferred order: nvidia (has execution models) > custom > others
    const preference = ['custom', 'nvidia', 'huggingface', 'replicate']
    
    for (const provider of preference) {
      const configs = apiRegistry.getConfigsByProvider(provider as APIProvider)
      if (configs.length > 0) {
        return {
          primary: configs[0],
          fallbacks: this.getFallbackConfigs(provider as APIProvider),
          reasoning: `Selected ${provider} for code execution`,
          priority: 'execution'
        }
      }
    }

    // Fallback to first available
    const provider = available[0]
    const config = apiRegistry.getConfigsByProvider(provider)?.[0]
    if (!config) throw new Error(`No config for ${provider}`)
    
    return {
      primary: config,
      fallbacks: this.getFallbackConfigs(provider),
      reasoning: 'Fallback to first available',
      priority: 'execution'
    }
  }

  /**
   * Select best API for knowledge/research
   */
  private static selectKnowledgeAPI(available: APIProvider[]): SelectionResult {
    // Preferred order: nvidia > huggingface > replicate > custom
    const preference = ['nvidia', 'huggingface', 'replicate', 'custom']
    
    for (const provider of preference) {
      const configs = apiRegistry.getConfigsByProvider(provider as APIProvider)
      if (configs.length > 0) {
        return {
          primary: configs[0],
          fallbacks: this.getFallbackConfigs(provider as APIProvider),
          reasoning: `Selected ${provider} for knowledge queries`,
          priority: 'knowledge'
        }
      }
    }

    // Fallback to first available
    const provider = available[0]
    const config = apiRegistry.getConfigsByProvider(provider)?.[0]
    if (!config) throw new Error(`No config for ${provider}`)
    
    return {
      primary: config,
      fallbacks: this.getFallbackConfigs(provider),
      reasoning: 'Fallback to first available',
      priority: 'knowledge'
    }
  }

  /**
   * Select best API for creative tasks
   */
  private static selectCreativeAPI(available: APIProvider[]): SelectionResult {
    // Preferred order: replicate (models) > nvidia > custom
    const preference = ['replicate', 'nvidia', 'custom', 'huggingface']
    
    for (const provider of preference) {
      const configs = apiRegistry.getConfigsByProvider(provider as APIProvider)
      if (configs.length > 0) {
        return {
          primary: configs[0],
          fallbacks: this.getFallbackConfigs(provider as APIProvider),
          reasoning: `Selected ${provider} for creative generation`,
          priority: 'creative'
        }
      }
    }

    // Fallback to first available
    const provider = available[0]
    const config = apiRegistry.getConfigsByProvider(provider)?.[0]
    if (!config) throw new Error(`No config for ${provider}`)
    
    return {
      primary: config,
      fallbacks: this.getFallbackConfigs(provider),
      reasoning: 'Fallback to first available',
      priority: 'creative'
    }
  }

  /**
   * Get fallback APIs for a provider
   */
  private static getFallbackConfigs(provider: APIProvider): APIConfig[] {
    const fallbacks = []
    let current = provider
    
    while (true) {
      const next = apiRegistry.getNextFallback(current)
      if (!next) break
      
      const configs = apiRegistry.getConfigsByProvider(next)
      if (configs.length > 0) {
        fallbacks.push(configs[0])
      }
      
      current = next
    }
    
    return fallbacks
  }
}
