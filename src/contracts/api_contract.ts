export interface ApiRequestContract {
  requestId: string
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  metadata?: Record<string, unknown>
  timestamp: number
}

export interface ApiResponseContract {
  requestId: string
  ok: boolean
  statusCode: number
  data?: unknown
  error?: string
  latencyMs: number
  timestamp: number
}

export function createApiRequest(
  endpoint: string,
  method: ApiRequestContract['method'],
  body?: unknown,
): ApiRequestContract {
  return {
    requestId: `api_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    endpoint,
    method,
    body,
    timestamp: Date.now(),
  }
}
