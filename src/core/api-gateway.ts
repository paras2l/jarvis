import { ConnectedAPI } from '@/types'

/**
 * API Gateway
 * Manages multiple API integrations and routing
 */
class APIGateway {
  private apis: Map<string, ConnectedAPI> = new Map()

  /**
   * Register an API
   */
  registerAPI(api: ConnectedAPI): void {
    this.apis.set(api.id, api)
  }

  /**
   * Register a batch of APIs.
   */
  registerAPIs(apis: ConnectedAPI[]): void {
    for (const api of apis) {
      this.registerAPI(api)
    }
  }

  /**
   * Get API by ID
   */
  getAPI(apiId: string): ConnectedAPI | undefined {
    return this.apis.get(apiId)
  }

  /**
   * Get APIs by type
   */
  getAPIsByType(type: 'knowledge' | 'action' | 'both'): ConnectedAPI[] {
    return Array.from(this.apis.values()).filter(
      (api) => api.type === type || api.type === 'both'
    )
  }

  /**
   * Get all enabled APIs
   */
  getEnabledAPIs(): ConnectedAPI[] {
    return Array.from(this.apis.values()).filter((api) => api.enabled)
  }

  private resolveAPIs(type: 'knowledge' | 'action' | 'both', apiId?: string): ConnectedAPI[] {
    if (apiId) {
      const api = this.getAPI(apiId)
      return api && api.enabled && (api.type === type || api.type === 'both') ? [api] : []
    }

    return this.getAPIsByType(type).filter((api) => api.enabled)
  }

  private async callAPI(
    api: ConnectedAPI,
    body: Record<string, unknown>
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    try {
      const response = await fetch(api.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(api.apiKey && { Authorization: `Bearer ${api.apiKey}` }),
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        return { ok: false, error: `API error: ${response.status} ${response.statusText}` }
      }

      return { ok: true, data: await response.json() }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown API failure',
      }
    }
  }

  /**
   * Call API for knowledge query
   */
  async queryKnowledge(query: string, apiId?: string): Promise<unknown> {
    const apis = this.resolveAPIs('knowledge', apiId)

    if (apis.length === 0) {
      return { error: 'No knowledge APIs available' }
    }

    const failures: Array<{ apiId: string; message: string }> = []

    for (const api of apis) {
      const result = await this.callAPI(api, { query })
      if (result.ok) {
        return {
          apiId: api.id,
          apiName: api.name,
          data: result.data,
        }
      }

      failures.push({
        apiId: api.id,
        message: result.error || 'Unknown API failure',
      })
    }

    return {
      error: 'Failed to query knowledge base',
      failures,
    }
  }

  /**
   * Call API for action execution
   */
  async executeAction(
    action: string,
    params: Record<string, unknown>,
    apiId?: string
  ): Promise<unknown> {
    const apis = this.resolveAPIs('action', apiId)

    if (apis.length === 0) {
      return { error: 'No action APIs available' }
    }

    const failures: Array<{ apiId: string; message: string }> = []

    for (const api of apis) {
      const result = await this.callAPI(api, { action, params })
      if (result.ok) {
        return {
          apiId: api.id,
          apiName: api.name,
          data: result.data,
        }
      }

      failures.push({
        apiId: api.id,
        message: result.error || 'Unknown API failure',
      })
    }

    return {
      error: 'Failed to execute action',
      failures,
    }
  }

  /**
   * Enable/disable API
   */
  toggleAPI(apiId: string, enabled: boolean): boolean {
    const api = this.getAPI(apiId)
    if (!api) return false

    api.enabled = enabled
    return true
  }

  /**
   * Remove API
   */
  removeAPI(apiId: string): boolean {
    return this.apis.delete(apiId)
  }

  /**
   * Get all APIs
   */
  getAllAPIs(): ConnectedAPI[] {
    return Array.from(this.apis.values())
  }
}

export default new APIGateway()
