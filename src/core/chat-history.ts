import { ChatHistory, Message } from '@/types'

const STORAGE_KEY = 'test-model.chat-history'
const MAX_SESSIONS = 25

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function hydrateMessage(message: Message): Message {
  return {
    ...message,
    timestamp: new Date(message.timestamp),
  }
}

function hydrateSession(session: ChatHistory): ChatHistory {
  return {
    ...session,
    createdAt: new Date(session.createdAt),
    updatedAt: new Date(session.updatedAt),
    messages: Array.isArray(session.messages) ? session.messages.map(hydrateMessage) : [],
  }
}

function normalizeSessions(sessions: ChatHistory[]): ChatHistory[] {
  return sessions
    .map(hydrateSession)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, MAX_SESSIONS)
}

export function loadChatHistory(): ChatHistory[] {
  const storage = safeStorage()
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as ChatHistory[]
    return Array.isArray(parsed) ? normalizeSessions(parsed) : []
  } catch {
    return []
  }
}

export function saveChatHistory(sessions: ChatHistory[]): void {
  const storage = safeStorage()
  if (!storage) {
    return
  }

  const normalized = normalizeSessions(sessions)
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}

export function getLatestChatHistory(): ChatHistory | null {
  const sessions = loadChatHistory()
  return sessions[0] || null
}

export function upsertChatHistory(session: ChatHistory): ChatHistory[] {
  const sessions = loadChatHistory()
  const normalizedSession = hydrateSession(session)
  const index = sessions.findIndex((item) => item.id === normalizedSession.id)

  if (index >= 0) {
    sessions[index] = normalizedSession
  } else {
    sessions.unshift(normalizedSession)
  }

  const normalized = normalizeSessions(sessions)
  saveChatHistory(normalized)
  return normalized
}

export function clearChatHistory(): void {
  const storage = safeStorage()
  if (!storage) {
    return
  }

  storage.removeItem(STORAGE_KEY)
}

export function createChatHistorySession(
  messages: Message[],
  agentId = 'main-agent'
): ChatHistory {
  const now = new Date()
  return {
    id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    messages: messages.map(hydrateMessage),
    createdAt: now,
    updatedAt: now,
    agentId,
  }
}
