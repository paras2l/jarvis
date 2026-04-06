/**
 * APIRegistry - Central registry for all configured APIs
 * Provides add/get/list/validate operations for API configurations
 */

import type { APIConfig, APIProvider } from '../types'
import { APIConfigStorage } from './api-config-storage'

export interface RegistryConfig {
  maxRetries: number
  timeoutMs: number
  fallbackPriority: APIProvider[]
}

export class APIRegistry {
  private configs: Map<string, APIConfig> = new Map()
  private registryConfig: RegistryConfig

  constructor(config: Partial<RegistryConfig> = {}) {
    this.registryConfig = {
      maxRetries: config.maxRetries ?? 3,
      timeoutMs: config.timeoutMs ?? 30000,
      fallbackPriority: config.fallbackPriority ?? [
        'nvidia', 'huggingface', 'replicate', 'custom'
      ]
    }
    
    this.loadConfigs()
  }

  /**
   * Load all saved configs from storage
   */
  private loadConfigs(): void {
    const saved = APIConfigStorage.loadAll()
    Object.values(saved).forEach(cfg => {
      this.configs.set(cfg.id, cfg)
    })
  }

  /**
   * Add or update API configuration
   */
  addConfig(provider: APIProvider, apiKey: string, name?: string): APIConfig {
    // Validate key format
    if (!APIConfigStorage.validateKey(provider, apiKey)) {
      throw new Error(`Invalid API key format for provider: ${provider}`)
    }

    const config: APIConfig = {
      id: `${provider}-${Date.now()}`,
      provider,
      apiKey,
      name: name || `${provider} API (${new Date().toLocaleDateString()})`,
      createdAt: new Date().toISOString(),
      lastUsed: null
    }

    this.configs.set(config.id, config)
    
    // Persist to storage
    APIConfigStorage.saveConfig(config)

    return config
  }

  /**
   * Get config by ID
   */
  getConfig(id: string): APIConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * Get all configs for a provider
   */
  getConfigsByProvider(provider: APIProvider): APIConfig[] {
    return Array.from(this.configs.values()).filter(
      cfg => cfg.provider === provider
    )
  }

  /**
   * List all registered configurations
   */
  listAllConfigs(): APIConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * Get available providers (those with registered config)
   */
  getAvailableProviders(): APIProvider[] {
    const providers = new Set(
      Array.from(this.configs.values()).map(cfg => cfg.provider)
    )
    return Array.from(providers)
  }

  /**
   * Update last-used timestamp (for analytics)
   */
  recordUsage(id: string): void {
    const config = this.configs.get(id)
    if (config) {
      config.lastUsed = new Date().toISOString()
      APIConfigStorage.saveConfig(config)
    }
  }

  /**
   * Delete configuration
   */
  deleteConfig(id: string): boolean {
    const success = this.configs.delete(id)
    if (success) {
      APIConfigStorage.deleteConfig(id)
    }
    return success
  }

  /**
   * Get next fallback provider (for error handling)
   */
  getNextFallback(currentProvider: APIProvider): APIProvider | null {
    const index = this.registryConfig.fallbackPriority.indexOf(currentProvider)
    for (let i = index + 1; i < this.registryConfig.fallbackPriority.length; i++) {
      const provider = this.registryConfig.fallbackPriority[i]
      if (this.getConfigsByProvider(provider).length > 0) {
        return provider
      }
    }
    return null
  }

  /**
   * Quick check: do we have any configured APIs?
   */
  hasConfigs(): boolean {
    return this.configs.size > 0
  }

  /**
   * Get registry settings
   */
  getRegistryConfig(): RegistryConfig {
    return { ...this.registryConfig }
  }

  /**
   * Update registry settings
   */
  updateRegistryConfig(config: Partial<RegistryConfig>): void {
    this.registryConfig = {
      ...this.registryConfig,
      ...config
    }
  }

  /**
   * Clear all configurations (DANGER: use with caution)
   */
  clearAll(): void {
    this.configs.clear()
    APIConfigStorage.clear()
  }
}

// Export singleton instance
export const apiRegistry = new APIRegistry()
