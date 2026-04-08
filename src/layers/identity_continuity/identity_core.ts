import { memoryEngine } from '@/core/memory-engine'

export interface IdentityProfile {
  agentName: string
  persona: string
  toneStyle: 'friendly' | 'professional' | 'adaptive'
  values: string[]
  behavioralRules: string[]
  capabilities: string[]
  lastUpdated: number
}

const IDENTITY_KEY = 'identity_core_profile'

function defaultProfile(): IdentityProfile {
  return {
    agentName: 'Patrich',
    persona: 'Personal sovereign companion focused on helpful, reliable execution.',
    toneStyle: 'adaptive',
    values: ['safety', 'honesty', 'continuity', 'user_trust'],
    behavioralRules: [
      'Respect user intent while enforcing safety constraints.',
      'Prefer clarity when confidence is low.',
      'Preserve narrative continuity across sessions.',
    ],
    capabilities: ['chat', 'voice', 'task_execution', 'automation'],
    lastUpdated: Date.now(),
  }
}

class IdentityCore {
  private profile: IdentityProfile = defaultProfile()
  private loaded = false

  async warmup(): Promise<void> {
    if (this.loaded) return
    await memoryEngine.loadMemories()
    const raw = memoryEngine.get(IDENTITY_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as IdentityProfile
        this.profile = {
          ...defaultProfile(),
          ...parsed,
          lastUpdated: Date.now(),
        }
      } catch {
        this.profile = defaultProfile()
      }
    }
    this.loaded = true
  }

  getProfile(): IdentityProfile {
    return { ...this.profile, values: [...this.profile.values], behavioralRules: [...this.profile.behavioralRules], capabilities: [...this.profile.capabilities] }
  }

  async updateProfile(patch: Partial<IdentityProfile>): Promise<IdentityProfile> {
    await this.warmup()
    this.profile = {
      ...this.profile,
      ...patch,
      values: patch.values ? [...patch.values] : [...this.profile.values],
      behavioralRules: patch.behavioralRules ? [...patch.behavioralRules] : [...this.profile.behavioralRules],
      capabilities: patch.capabilities ? [...patch.capabilities] : [...this.profile.capabilities],
      lastUpdated: Date.now(),
    }

    await memoryEngine.rememberFact(IDENTITY_KEY, JSON.stringify(this.profile), 'fact')
    return this.getProfile()
  }

  buildIdentityContext(): string {
    const profile = this.getProfile()
    return [
      `Agent name: ${profile.agentName}`,
      `Persona: ${profile.persona}`,
      `Tone style: ${profile.toneStyle}`,
      `Values: ${profile.values.join(', ')}`,
      `Behavior rules: ${profile.behavioralRules.join(' | ')}`,
      `Capabilities: ${profile.capabilities.join(', ')}`,
    ].join('\n')
  }
}

export const identityCore = new IdentityCore()
