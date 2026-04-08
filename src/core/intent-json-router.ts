export type IntentDomain = 'open' | 'close' | 'search' | 'system' | 'media' | 'file' | 'automation' | 'chat'

export interface RoutedIntent {
  domain: IntentDomain
  action: string
  confidence: number
  params: Record<string, unknown>
}

function safeJsonParse(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function normalize(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function routeIntentJSON(input: string): RoutedIntent {
  const text = normalize(input)

  // Explicit JSON contract support.
  const raw = safeJsonParse(text)
  if (raw) {
    const intent = String(raw.intent || raw.domain || 'chat').toLowerCase()
    const action = String(raw.action || '').toLowerCase()
    const params = (raw.params && typeof raw.params === 'object' ? raw.params : raw) as Record<string, unknown>

    if (intent === 'open') return { domain: 'open', action: action || 'open_app', confidence: 0.98, params }
    if (intent === 'close') return { domain: 'close', action: action || 'close_app', confidence: 0.98, params }
    if (intent === 'search') return { domain: 'search', action: action || 'web_search', confidence: 0.98, params }
    if (intent === 'system') return { domain: 'system', action: action || 'system_control', confidence: 0.98, params }
    if (intent === 'media') return { domain: 'media', action: action || 'media_control', confidence: 0.98, params }
    if (intent === 'file') return { domain: 'file', action: action || 'file_operation', confidence: 0.98, params }
    if (intent === 'automation') return { domain: 'automation', action: action || 'browser_snapshot', confidence: 0.98, params }
  }

  const openMatch = text.match(/^(?:open|launch|start)\s+(.+)$/i)
  if (openMatch) {
    return {
      domain: 'open',
      action: 'open_app',
      confidence: 0.95,
      params: { app: openMatch[1].trim() },
    }
  }

  const closeMatch = text.match(/^(?:close|quit|exit|stop)\s+(?:the\s+)?(?:app\s+)?(.+)$/i)
  if (closeMatch) {
    return {
      domain: 'close',
      action: 'close_app',
      confidence: 0.93,
      params: { app: closeMatch[1].trim() },
    }
  }

  const searchMatch = text.match(/^(?:search|google|find)\s+(.+)$/i)
  if (searchMatch) {
    return {
      domain: 'search',
      action: 'web_search',
      confidence: 0.92,
      params: { query: searchMatch[1].trim() },
    }
  }

  if (/\b(snapshot|screen\s*shot|capture\s+screen|browser\s+snapshot)\b/i.test(text)) {
    return {
      domain: 'automation',
      action: 'browser_snapshot',
      confidence: 0.9,
      params: { scope: /desktop|screen/i.test(text) ? 'desktop' : 'web' },
    }
  }

  const clickRef = text.match(/^(?:click|tap)\s+(?:on\s+)?(?:ref\s+)?(.+)$/i)
  if (clickRef) {
    return {
      domain: 'automation',
      action: 'desktop_ref_click',
      confidence: 0.9,
      params: { ref: clickRef[1].trim() },
    }
  }

  const typeRef = text.match(/^(?:type|enter|write)\s+(.+?)\s+(?:in|into|on)\s+(?:ref\s+)?(.+)$/i)
  if (typeRef) {
    return {
      domain: 'automation',
      action: 'desktop_ref_type',
      confidence: 0.9,
      params: { text: typeRef[1].trim(), ref: typeRef[2].trim() },
    }
  }

  const systemOp = text.match(/\b(volume\s+up|volume\s+down|mute|unmute|lock\s+screen|sleep|shutdown|restart)\b/i)
  if (systemOp) {
    return {
      domain: 'system',
      action: 'system_control',
      confidence: 0.9,
      params: { operation: systemOp[1].toLowerCase() },
    }
  }

  const mediaOp = text.match(/\b(play|pause|resume|next|previous|prev|stop)\b/i)
  if (mediaOp && /\b(song|music|track|media|video|playback)\b/i.test(text)) {
    return {
      domain: 'media',
      action: 'media_control',
      confidence: 0.88,
      params: { operation: mediaOp[1].toLowerCase() },
    }
  }

  const readFile = text.match(/^read\s+file\s+(.+)$/i)
  if (readFile) {
    return {
      domain: 'file',
      action: 'file_operation',
      confidence: 0.9,
      params: { operation: 'read', path: readFile[1].trim() },
    }
  }

  const writeFile = text.match(/^write\s+file\s+(.+?)\s+with\s+(.+)$/i)
  if (writeFile) {
    return {
      domain: 'file',
      action: 'file_operation',
      confidence: 0.9,
      params: { operation: 'write', path: writeFile[1].trim(), content: writeFile[2].trim() },
    }
  }

  const deleteFile = text.match(/^(?:delete|remove)\s+file\s+(.+)$/i)
  if (deleteFile) {
    return {
      domain: 'file',
      action: 'file_operation',
      confidence: 0.9,
      params: { operation: 'delete', path: deleteFile[1].trim() },
    }
  }

  const listFiles = text.match(/^(?:list|show)\s+files(?:\s+in\s+(.+))?$/i)
  if (listFiles) {
    return {
      domain: 'file',
      action: 'file_operation',
      confidence: 0.86,
      params: { operation: 'list', path: (listFiles[1] || '.').trim() },
    }
  }

  return {
    domain: 'chat',
    action: 'knowledge_query',
    confidence: 0.4,
    params: { query: text },
  }
}
