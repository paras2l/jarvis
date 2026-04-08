export type AutonomyMode = 'observe' | 'assist' | 'autonomous'
export type VoiceBackend = 'native' | 'whisper'
export type OrchestrationFramework = 'native' | 'langgraph' | 'autogen'

export interface RuntimePolicy {
  autonomyMode: AutonomyMode
  loopIntervalMs: number
  voiceBackend: VoiceBackend
  orchestrationFramework: OrchestrationFramework
  proactiveVoice: boolean
  allowVoiceCommandExecution: boolean
  allowPredictionActions: boolean
  allowCuriosityLearning: boolean
}

const RUNTIME_POLICY_KEY = 'Pixi.runtime.policy'

const DEFAULT_POLICY: RuntimePolicy = {
  autonomyMode: 'assist',
  loopIntervalMs: 12_000,
  voiceBackend: 'native',
  orchestrationFramework: 'native',
  proactiveVoice: true,
  allowVoiceCommandExecution: true,
  allowPredictionActions: true,
  allowCuriosityLearning: true,
}

function clampLoopInterval(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_POLICY.loopIntervalMs
  return Math.min(120_000, Math.max(4_000, Math.round(ms)))
}

class RuntimePolicyStore {
  private policy: RuntimePolicy = this.load()

  get(): RuntimePolicy {
    return { ...this.policy }
  }

  update(partial: Partial<RuntimePolicy>): RuntimePolicy {
    this.policy = {
      ...this.policy,
      ...partial,
      loopIntervalMs: clampLoopInterval(partial.loopIntervalMs ?? this.policy.loopIntervalMs),
    }
    localStorage.setItem(RUNTIME_POLICY_KEY, JSON.stringify(this.policy))
    return this.get()
  }

  reset(): RuntimePolicy {
    this.policy = { ...DEFAULT_POLICY }
    localStorage.setItem(RUNTIME_POLICY_KEY, JSON.stringify(this.policy))
    return this.get()
  }

  private load(): RuntimePolicy {
    try {
      const raw = localStorage.getItem(RUNTIME_POLICY_KEY)
      if (!raw) return { ...DEFAULT_POLICY }
      const parsed = JSON.parse(raw) as Partial<RuntimePolicy>
      return {
        autonomyMode:
          parsed.autonomyMode === 'observe' ||
          parsed.autonomyMode === 'assist' ||
          parsed.autonomyMode === 'autonomous'
            ? parsed.autonomyMode
            : DEFAULT_POLICY.autonomyMode,
        loopIntervalMs: clampLoopInterval(parsed.loopIntervalMs ?? DEFAULT_POLICY.loopIntervalMs),
        voiceBackend: parsed.voiceBackend === 'whisper' ? 'whisper' : 'native',
        orchestrationFramework:
          parsed.orchestrationFramework === 'langgraph' || parsed.orchestrationFramework === 'autogen'
            ? parsed.orchestrationFramework
            : 'native',
        proactiveVoice: Boolean(parsed.proactiveVoice ?? DEFAULT_POLICY.proactiveVoice),
        allowVoiceCommandExecution: Boolean(
          parsed.allowVoiceCommandExecution ?? DEFAULT_POLICY.allowVoiceCommandExecution,
        ),
        allowPredictionActions: Boolean(
          parsed.allowPredictionActions ?? DEFAULT_POLICY.allowPredictionActions,
        ),
        allowCuriosityLearning: Boolean(
          parsed.allowCuriosityLearning ?? DEFAULT_POLICY.allowCuriosityLearning,
        ),
      }
    } catch {
      return { ...DEFAULT_POLICY }
    }
  }
}

export const runtimePolicyStore = new RuntimePolicyStore()

