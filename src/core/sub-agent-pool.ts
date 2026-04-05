/**
 * SubAgent Pool — Parallel Execution Coordinator
 *
 * Manages a pool of concurrent subagents for both Learning and Execution.
 * Uses Promise.all for true parallelism — all agents fire simultaneously.
 *
 * Architecture:
 *   - Learning: Web + Video + Book agents run in parallel (already in orchestrator)
 *   - Execution: Multiple independent app tasks can run on different devices in parallel
 *   - Status: Each agent reports live status back through the event bus
 */

export type SubAgentType = 'web' | 'video' | 'book' | 'executor' | 'verifier';
export type SubAgentStatus = 'idle' | 'running' | 'done' | 'failed';

export interface SubAgentTask<T = unknown> {
  id: string;
  type: SubAgentType;
  label: string;
  /** The async function this subagent executes */
  fn: () => Promise<T>;
}

export interface SubAgentResult<T = unknown> {
  id: string;
  type: SubAgentType;
  label: string;
  status: SubAgentStatus;
  result?: T;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// SubAgentPool
// ---------------------------------------------------------------------------

export class SubAgentPool {
  private activeAgents: Map<string, SubAgentStatus> = new Map();

  /**
   * Dispatch multiple subagent tasks in TRUE parallel using Promise.all.
   * All agents fire at the same instant and results are collected when all finish.
   * Failed agents don't block others — partial results are always returned.
   */
  async dispatch<T>(tasks: SubAgentTask<T>[]): Promise<SubAgentResult<T>[]> {
    console.log(`[SubAgentPool] Dispatching ${tasks.length} subagents in parallel:`,
      tasks.map(t => t.label).join(', '));

    const startTime = Date.now();

    const promises = tasks.map(async (task): Promise<SubAgentResult<T>> => {
      this.activeAgents.set(task.id, 'running');
      const taskStart = Date.now();

      try {
        const result = await task.fn();
        this.activeAgents.set(task.id, 'done');
        const durationMs = Date.now() - taskStart;
        console.log(`[SubAgentPool] ✅ ${task.label} done in ${durationMs}ms`);

        return {
          id: task.id,
          type: task.type,
          label: task.label,
          status: 'done',
          result,
          durationMs,
        };
      } catch (err) {
        this.activeAgents.set(task.id, 'failed');
        console.error(`[SubAgentPool] ❌ ${task.label} failed:`, err);

        return {
          id: task.id,
          type: task.type,
          label: task.label,
          status: 'failed',
          error: String(err),
          durationMs: Date.now() - taskStart,
        };
      } finally {
        this.activeAgents.delete(task.id);
      }
    });

    const results = await Promise.all(promises);
    const totalMs = Date.now() - startTime;
    const succeeded = results.filter(r => r.status === 'done').length;

    console.log(`[SubAgentPool] 🏁 All agents done in ${totalMs}ms. ${succeeded}/${tasks.length} succeeded.`);

    // Emit a custom event so the UI can reflect completion
    window.dispatchEvent(new CustomEvent('subagent:pool-complete', {
      detail: { total: tasks.length, succeeded, totalMs }
    }));

    return results;
  }

  /**
   * Dispatch tasks with a timeout — if any agent exceeds maxMs, it is
   * treated as failed but does NOT block the rest.
   */
  async dispatchWithTimeout<T>(tasks: SubAgentTask<T>[], maxMs: number): Promise<SubAgentResult<T>[]> {
    const withTimeout: SubAgentTask<T>[] = tasks.map(task => ({
      ...task,
      fn: (): Promise<T> => Promise.race([
        task.fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${maxMs}ms`)), maxMs)
        )
      ])
    }));

    return this.dispatch(withTimeout);
  }

  getActiveCount(): number {
    return this.activeAgents.size;
  }

  getActiveAgents(): string[] {
    return Array.from(this.activeAgents.keys());
  }
}

export const subAgentPool = new SubAgentPool();
