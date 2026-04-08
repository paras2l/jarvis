export interface SystemEventContract<T = unknown> {
  id: string
  name: string
  source: string
  timestamp: number
  correlationId?: string
  payload: T
}

export interface PerceptionEventPayload {
  channel: 'voice' | 'screen' | 'sensor' | 'cross_modal'
  confidence: number
  summary: string
}

export function validateSystemEvent(input: unknown): input is SystemEventContract {
  if (!input || typeof input !== 'object') return false
  const value = input as Partial<SystemEventContract>
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.source === 'string' &&
    typeof value.timestamp === 'number'
  )
}
