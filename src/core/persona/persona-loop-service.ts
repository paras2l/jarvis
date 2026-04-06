import { feedbackService } from './feedback-service'

export interface PersonaState {
  warmth: number
  formality: number
  proactivity: number
  confidence: number
  repetitionGuard: number
  interruptionSensitivity: number
}

class PersonaLoopService {
  private state: PersonaState = {
    warmth: 0.75,
    formality: 0.35,
    proactivity: 0.7,
    confidence: 0.8,
    repetitionGuard: 0.7,
    interruptionSensitivity: 0.75,
  }

  tune(): PersonaState {
    const score = feedbackService.score()
    if (score > 0.7) {
      this.state.proactivity = Math.min(1, this.state.proactivity + 0.05)
      this.state.warmth = Math.min(1, this.state.warmth + 0.03)
      this.state.repetitionGuard = Math.min(1, this.state.repetitionGuard + 0.02)
    } else if (score < 0.4) {
      this.state.proactivity = Math.max(0.3, this.state.proactivity - 0.08)
      this.state.formality = Math.min(0.7, this.state.formality + 0.05)
      this.state.interruptionSensitivity = Math.min(1, this.state.interruptionSensitivity + 0.05)
    }

    return { ...this.state }
  }

  getState(): PersonaState {
    return { ...this.state }
  }
}

export const personaLoopService = new PersonaLoopService()
