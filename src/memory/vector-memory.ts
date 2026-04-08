export interface VectorMemoryRecord {
  id: string
  text: string
  tags: string[]
  embedding: number[]
  createdAt: number
}

const STORAGE_KEY = 'patrich.vector.memory'

class VectorMemory {
  private records: VectorMemoryRecord[] = []

  constructor() {
    this.records = this.load()
  }

  upsert(text: string, tags: string[] = []): VectorMemoryRecord {
    const record: VectorMemoryRecord = {
      id: `vm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      tags,
      embedding: this.embed(text),
      createdAt: Date.now(),
    }

    this.records.push(record)
    this.persist()
    return record
  }

  search(query: string, limit = 5): VectorMemoryRecord[] {
    const q = this.embed(query)
    return this.records
      .map((record) => ({
        record,
        score: this.cosineSimilarity(q, record.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit))
      .map((item) => item.record)
  }

  private embed(text: string): number[] {
    const vec = new Array<number>(16).fill(0)
    for (const token of text.toLowerCase().split(/\s+/).filter(Boolean)) {
      let hash = 0
      for (let i = 0; i < token.length; i++) {
        hash = (hash * 31 + token.charCodeAt(i)) >>> 0
      }
      vec[hash % vec.length] += 1
    }

    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1
    return vec.map((v) => v / norm)
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    for (let i = 0; i < a.length; i++) {
      dot += (a[i] || 0) * (b[i] || 0)
    }
    return dot
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records.slice(-1000)))
  }

  private load(): VectorMemoryRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as VectorMemoryRecord[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}

export const vectorMemory = new VectorMemory()
