const FACE_GATE_ENABLED_KEY = 'patrich.voice.face_gate.enabled'
const FACE_GATE_TTL_MS = 30_000

export interface FaceGateDecision {
  allowed: boolean
  reason?: string
}

class FaceGate {
  private lastVerifiedAt = 0

  isEnabled(): boolean {
    return localStorage.getItem(FACE_GATE_ENABLED_KEY) === 'true'
  }

  setEnabled(enabled: boolean): void {
    localStorage.setItem(FACE_GATE_ENABLED_KEY, enabled ? 'true' : 'false')
    if (!enabled) {
      this.lastVerifiedAt = 0
    }
  }

  getStatus(): { enabled: boolean; isFresh: boolean } {
    return {
      enabled: this.isEnabled(),
      isFresh: Date.now() - this.lastVerifiedAt <= FACE_GATE_TTL_MS,
    }
  }

  async authorizeForVoiceCommand(): Promise<FaceGateDecision> {
    if (!this.isEnabled()) {
      return { allowed: true }
    }

    if (Date.now() - this.lastVerifiedAt <= FACE_GATE_TTL_MS) {
      return { allowed: true }
    }

    const verifyFace = (window as any)?.nativeBridge?.vision?.verifyFace
    if (typeof verifyFace === 'function') {
      try {
        const result = await verifyFace()
        if (result?.success) {
          this.lastVerifiedAt = Date.now()
          return { allowed: true }
        }
        return { allowed: false, reason: result?.message || 'Face verification failed.' }
      } catch {
        return { allowed: false, reason: 'Face verification bridge failed.' }
      }
    }

    return { allowed: false, reason: 'Face gate is enabled, but face verification is not configured in this runtime.' }
  }
}

export const faceGate = new FaceGate()
