export type MemoryScopeContract = 'short_term' | 'long_term' | 'semantic' | 'procedural'

export interface MemoryWriteContract {
  key: string
  value: unknown
  scope: MemoryScopeContract
  sourceLayer: string
  confidence: number
  tags: string[]
  timestamp: number
}

export interface MemoryReadContract {
  key: string
  scope: MemoryScopeContract
  requesterLayer: string
  timestamp: number
}

export function validateMemoryWrite(input: unknown): input is MemoryWriteContract {
  if (!input || typeof input !== 'object') return false
  const value = input as Partial<MemoryWriteContract>
  return (
    typeof value.key === 'string' &&
    typeof value.scope === 'string' &&
    typeof value.sourceLayer === 'string' &&
    typeof value.confidence === 'number' &&
    Array.isArray(value.tags) &&
    typeof value.timestamp === 'number'
  )
}
