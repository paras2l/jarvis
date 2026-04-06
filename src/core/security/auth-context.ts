export interface AuthContext {
  userId: string
  role: 'user' | 'owner'
  sessionId: string
  commander?: string
  codeword?: string
}

const DEFAULT_AUTH_CONTEXT: AuthContext = {
  userId: 'local-user',
  role: 'user',
  sessionId: 'local-session',
}

function sanitize(input: unknown): AuthContext {
  if (!input || typeof input !== 'object') return DEFAULT_AUTH_CONTEXT
  const raw = input as Partial<AuthContext>
  return {
    userId: typeof raw.userId === 'string' && raw.userId.trim() ? raw.userId : DEFAULT_AUTH_CONTEXT.userId,
    role: raw.role === 'owner' ? 'owner' : 'user',
    sessionId: typeof raw.sessionId === 'string' && raw.sessionId.trim() ? raw.sessionId : DEFAULT_AUTH_CONTEXT.sessionId,
    commander: typeof raw.commander === 'string' ? raw.commander : undefined,
    codeword: typeof raw.codeword === 'string' ? raw.codeword : undefined,
  }
}

export async function getAuthenticatedContext(): Promise<AuthContext> {
  if (typeof window === 'undefined' || !window.nativeBridge?.getAuthContext) {
    return DEFAULT_AUTH_CONTEXT
  }

  try {
    const fromBridge = await window.nativeBridge.getAuthContext()
    return sanitize(fromBridge)
  } catch {
    return DEFAULT_AUTH_CONTEXT
  }
}
