export interface UserHabit {
  key: string
  value: string
  confidence: number
  updatedAt: number
}

const PROFILE_KEY = 'patrich.user.profile'

class UserProfile {
  private habits = new Map<string, UserHabit>()

  constructor() {
    this.load()
  }

  updateHabit(key: string, value: string, confidence = 0.6): void {
    this.habits.set(key, {
      key,
      value,
      confidence,
      updatedAt: Date.now(),
    })
    this.persist()
  }

  getHabit(key: string): UserHabit | undefined {
    return this.habits.get(key)
  }

  listHabits(): UserHabit[] {
    return Array.from(this.habits.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private persist(): void {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(this.listHabits()))
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(PROFILE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as UserHabit[]
      if (!Array.isArray(parsed)) return
      this.habits = new Map(parsed.map((habit) => [habit.key, habit]))
    } catch {
      this.habits = new Map()
    }
  }
}

export const userProfile = new UserProfile()
