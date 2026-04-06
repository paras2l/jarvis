class QuarantineRegistry {
  private quarantined: Set<string> = new Set()

  add(id: string): void {
    this.quarantined.add(id)
  }

  remove(id: string): void {
    this.quarantined.delete(id)
  }

  isQuarantined(id: string): boolean {
    return this.quarantined.has(id)
  }

  list(): string[] {
    return Array.from(this.quarantined)
  }
}

export const quarantineRegistry = new QuarantineRegistry()
