/**
 * APIConfigStorage - Secure localStorage persistence for API keys
 * Handles encryption, validation, and typed access to API credentials
 */

import type { APIConfig, APIProvider } from '../types'

const STORAGE_KEY = 'Pixi_api_configs'
const ENCRYPTION_SALT = 'Pixi_v4_sentinel' // Simple XOR (TODO: use libsodium in prod)

export class APIConfigStorage {
  /**
   * Save API configuration with basic encryption
   */
  static saveConfig(config: APIConfig): boolean {
    try {
      const configs = this.loadAll()
      configs[config.id] = config
      
      const encrypted = this.encrypt(JSON.stringify(Object.values(configs)))
      localStorage.setItem(STORAGE_KEY, encrypted)
      
      return true
    } catch (err) {
      console.error('[APIConfigStorage] Save failed:', err)
      return false
    }
  }

  /**
   * Load single API configuration by ID
   */
  static loadConfig(id: string): APIConfig | null {
    try {
      const configs = this.loadAll()
      return configs[id] || null
    } catch (err) {
      console.error('[APIConfigStorage] Load failed:', err)
      return null
    }
  }

  /**
   * Load all API configurations
   */
  static loadAll(): Record<string, APIConfig> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      
      const decrypted = this.decrypt(raw)
      const configs: APIConfig[] = JSON.parse(decrypted)
      
      return configs.reduce((acc, cfg) => ({
        ...acc,
        [cfg.id]: cfg
      }), {})
    } catch (err) {
      console.error('[APIConfigStorage] LoadAll failed:', err)
      return {}
    }
  }

  /**
   * Get all configs for a specific provider
   */
  static getByProvider(provider: APIProvider): APIConfig[] {
    try {
      const configs = this.loadAll()
      return Object.values(configs).filter(cfg => cfg.provider === provider)
    } catch (err) {
      console.error('[APIConfigStorage] GetByProvider failed:', err)
      return []
    }
  }

  /**
   * Check if API key is configured
   */
  static hasConfig(id: string): boolean {
    return this.loadConfig(id) !== null
  }

  /**
   * Delete API configuration
   */
  static deleteConfig(id: string): boolean {
    try {
      const configs = this.loadAll()
      delete configs[id]
      
      const encrypted = this.encrypt(JSON.stringify(Object.values(configs)))
      localStorage.setItem(STORAGE_KEY, encrypted)
      
      return true
    } catch (err) {
      console.error('[APIConfigStorage] Delete failed:', err)
      return false
    }
  }

  /**
   * Clear all configurations
   */
  static clear(): boolean {
    try {
      localStorage.removeItem(STORAGE_KEY)
      return true
    } catch (err) {
      console.error('[APIConfigStorage] Clear failed:', err)
      return false
    }
  }

  /**
   * Validate API key format for provider
   */
  static validateKey(provider: APIProvider, key: string): boolean {
    const patterns: Record<APIProvider, RegExp> = {
      'nvidia': /^[a-zA-Z0-9\-]{20,}$/, // NVIDIA API keys are alphanumeric with dashes
      'huggingface': /^hf_[a-zA-Z0-9]{34,}$/, // HF tokens start with hf_
      'replicate': /^[a-zA-Z0-9\-]{20,}$/, // Similar to NVIDIA
      'openai': /^sk-[a-zA-Z0-9\-]{20,}$/, // OpenAI keys start with sk-
      'custom': /^.{10,}$/, // Custom endpoints: at least 10 chars
    }
    
    const pattern = patterns[provider]
    if (!pattern) return false
    
    return pattern.test(key)
  }

  /**
   * Simple XOR encryption (use real encryption in production)
   */
  private static encrypt(data: string): string {
    let encrypted = ''
    for (let i = 0; i < data.length; i++) {
      const charCode = data.charCodeAt(i)
      const saltCode = ENCRYPTION_SALT.charCodeAt(i % ENCRYPTION_SALT.length)
      encrypted += String.fromCharCode(charCode ^ saltCode)
    }
    return btoa(encrypted) // Base64 encode
  }

  /**
   * Simple XOR decryption
   */
  private static decrypt(encrypted: string): string {
    try {
      const decoded = atob(encrypted)
      let decrypted = ''
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i)
        const saltCode = ENCRYPTION_SALT.charCodeAt(i % ENCRYPTION_SALT.length)
        decrypted += String.fromCharCode(charCode ^ saltCode)
      }
      return decrypted
    } catch {
      throw new Error('Decryption failed: invalid data')
    }
  }
}

