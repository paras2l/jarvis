/**
 * Execution Memory — The Autonomous Brain
 *
 * Stores successful action sequences as JSON "Playbooks."
 * This eliminates repeated API calls: recognized tasks are replayed
 * at machine speed (~10ms per step) with zero intelligence overhead.
 *
 * Brain grows continuously — the more tasks completed, the smarter it gets.
 */

export interface ActionStep {
  type: 'click' | 'type' | 'hotkey' | 'wait';
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
  waitMs?: number;
  reasoning?: string;
}

export interface Playbook {
  id: string;
  app: string;
  goal: string;
  /** Normalized keyword fingerprint for fast fuzzy matching */
  keywords: string[];
  steps: ActionStep[];
  successCount: number;
  lastUsed: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Fuzzy keyword matching (pure JS — zero API calls)
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// PlaybookStore
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'omni_playbooks';

export class ExecutionMemory {
  private playbooks: Map<string, Playbook> = new Map();

  constructor() {
    this.load();
  }

  /**
   * Persist the in-memory store to localStorage (renderer-side).
   * When real disk persistence is wired via nativeBridge, this can
   * be swapped for a file-system call transparently.
   */
  private save() {
    try {
      const data = JSON.stringify(Array.from(this.playbooks.entries()));
      localStorage.setItem(STORAGE_KEY, data);
    } catch (_) {
      console.warn('[ExecutionMemory] Could not persist playbooks to localStorage.');
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const entries: [string, Playbook][] = JSON.parse(raw);
        this.playbooks = new Map(entries);
        console.log(`[ExecutionMemory] Loaded ${this.playbooks.size} playbooks from local brain.`);
      }
    } catch (_) {
      console.warn('[ExecutionMemory] Could not load playbooks.');
    }
  }

  /**
   * Save a completed action sequence as a reusable Playbook.
   * Called automatically after every successful task execution.
   */
  savePlaybook(app: string, goal: string, steps: ActionStep[]): Playbook {
    const id = `${app.toLowerCase()}_${Date.now()}`;
    const playbook: Playbook = {
      id,
      app: app.toLowerCase(),
      goal,
      keywords: tokenize(`${app} ${goal}`),
      steps,
      successCount: 1,
      lastUsed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.playbooks.set(id, playbook);
    this.save();
    console.log(`[ExecutionMemory] 🧠 Playbook saved: "${goal}" for ${app} (${steps.length} steps).`);
    return playbook;
  }

  /**
   * Find the best-matching playbook using pure fuzzy keyword matching.
   * Returns { playbook, confidence } or null if no match above threshold.
   *
   * Confidence > 0.7 = Safe to replay (Tier 1).
   * Confidence 0.4-0.7 = Worth adapting (Tier 2 hint).
   * Confidence < 0.4 = No match.
   */
  findPlaybook(app: string, goal: string): { playbook: Playbook; confidence: number } | null {
    const queryKeywords = tokenize(`${app} ${goal}`);
    let bestMatch: Playbook | null = null;
    let bestScore = 0;

    for (const playbook of this.playbooks.values()) {
      // App must match (exact or partial)
      if (!playbook.app.includes(app.toLowerCase()) && !app.toLowerCase().includes(playbook.app)) {
        continue;
      }
      const score = jaccardSimilarity(queryKeywords, playbook.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = playbook;
      }
    }

    if (bestMatch && bestScore >= 0.4) {
      console.log(`[ExecutionMemory] 🎯 Match found: "${bestMatch.goal}" (confidence: ${(bestScore * 100).toFixed(1)}%)`);
      return { playbook: bestMatch, confidence: bestScore };
    }

    console.log(`[ExecutionMemory] No matching playbook for "${goal}" in ${app}.`);
    return null;
  }

  /**
   * After a successful replay, increment the success counter.
   */
  reinforcePlaybook(id: string) {
    const p = this.playbooks.get(id);
    if (p) {
      p.successCount++;
      p.lastUsed = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Delete a bad/stale playbook if UI verification failed repeatedly.
   */
  invalidatePlaybook(id: string) {
    this.playbooks.delete(id);
    this.save();
    console.log(`[ExecutionMemory] 🗑️ Stale playbook removed: ${id}`);
  }

  getAllPlaybooks(): Playbook[] {
    return Array.from(this.playbooks.values());
  }

  getStats() {
    const books = this.getAllPlaybooks();
    return {
      total: books.length,
      totalSteps: books.reduce((sum, b) => sum + b.steps.length, 0),
      apps: [...new Set(books.map(b => b.app))],
    };
  }
}

export const executionMemory = new ExecutionMemory();
