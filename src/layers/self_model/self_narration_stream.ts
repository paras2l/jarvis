export type SelfNarrationSource = 'bootstrap' | 'input' | 'outcome' | 'transition' | 'goal' | 'system' | 'reflection' | 'network'

export interface SelfNarrationEntry {
  id: string
  timestamp: number
  source: SelfNarrationSource
  focus: string
  summary: string
  confidence: number
  tags: string[]
}

export interface SelfNarrationStream {
  entries: SelfNarrationEntry[]
  currentThread: string
  lastEventAt: number
  narrative: string
  updatedAt: number
  version: number
}

export interface SelfNarrationInput {
  source: SelfNarrationSource
  focus: string
  summary: string
  confidence: number
  tags?: string[]
}

export type SelfNarrationStateInput = any

const STORAGE_KEY = 'Pixi.self_model.narration_stream.v1'
const MAX_ENTRIES = 120

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

class SelfNarrationStreamEngine {
  private entries: SelfNarrationEntry[] = []
  private version = 1

  constructor() {
    this.hydrate()
  }

  record(input: SelfNarrationInput): SelfNarrationStream {
    const entry: SelfNarrationEntry = {
      id: makeId('self_narration'),
      timestamp: Date.now(),
      source: input.source,
      focus: String(input.focus || 'self_state').slice(0, 80),
      summary: String(input.summary || '').slice(0, 240),
      confidence: clamp01(input.confidence),
      tags: Array.from(new Set((input.tags || []).filter(Boolean))).slice(0, 8),
    }

    this.entries.unshift(entry)
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_ENTRIES)
    }

    this.version += 1
    this.persist()
    return this.getSnapshot()
  }

  composeFromState(state: SelfNarrationStateInput, focus: string, source: SelfNarrationSource): SelfNarrationStream {
    const goalTop = state.goalCompass.goals[0]?.title || 'no_goal'
    const needTop = state.needsScoreboard?.priorityOrder?.[0] || 'none'
    const contradiction = state.contradictionDetector?.subjects?.[0] || 'none'
    const summary = [
      `focus=${focus}`,
      `mood=${state.moodLabel}`,
      `confidence=${state.confidenceCurrent.toFixed(2)}`,
      `goal=${goalTop}`,
      `need=${needTop}`,
      `contradiction=${contradiction}`,
      `status=${state.unifiedState?.status || 'forming'}`,
    ].join(' ; ')

    return this.record({
      source,
      focus,
      summary,
      confidence: state.confidenceCurrent,
      tags: [state.runtimeMode, state.moodLabel, state.currentFocus].filter(Boolean),
    })
  }

  getSnapshot(): SelfNarrationStream {
    const latest = this.entries[0]
    const currentThread = this.entries
      .slice(0, 4)
      .map((entry) => `${entry.source}:${entry.focus}`)
      .join(' -> ')

    return {
      entries: [...this.entries.slice(0, 24)],
      currentThread: currentThread || 'idle',
      lastEventAt: latest?.timestamp ?? 0,
      narrative: latest
        ? `last=${latest.source}:${latest.summary}; thread=${currentThread || 'idle'}`
        : 'No narration yet.',
      updatedAt: Date.now(),
      version: this.version,
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          entries: this.entries,
          version: this.version,
        }),
      )
    } catch {
      // Ignore persistence failures.
    }
  }

  private hydrate(): void {
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<{ entries: SelfNarrationEntry[]; version: number }>
      this.entries = Array.isArray(parsed.entries) ? parsed.entries : []
      this.version = typeof parsed.version === 'number' ? parsed.version : 1
    } catch {
      this.entries = []
      this.version = 1
    }
  }
}

export const selfNarrationStream = new SelfNarrationStreamEngine()

