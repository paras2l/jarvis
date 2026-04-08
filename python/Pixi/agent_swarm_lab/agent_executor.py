"""Agent executor for Agent Swarm Lab.

Runs spawned agents against assigned subtasks with budget enforcement.
Safety controls:
- API call budget
- compute-step budget
- recursion prevention checks
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from Pixi.agent_swarm_lab.agent_spawner import SpawnedAgent
from Pixi.agent_swarm_lab.task_divider import SwarmTask
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ExecutionBudget:
    max_api_calls_total: int = 40
    max_compute_steps_total: int = 500
    max_api_calls_per_agent: int = 8
    max_compute_steps_per_agent: int = 120


@dataclass(slots=True)
class AgentExecution:
    run_id: str
    agent_id: str
    task_id: str
    role: str
    success: bool
    summary: str
    approach: str
    score: float
    api_calls_used: int
    compute_steps_used: int
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ExecutionBatch:
    run_id: str
    started_at: str
    completed_at: str
    executions: List[AgentExecution] = field(default_factory=list)
    budget: Dict[str, Any] = field(default_factory=dict)


class AgentExecutor:
    """Execute swarm tasks and monitor run-time budgets."""

    def __init__(self, memory: MemorySystem, budget: ExecutionBudget | None = None) -> None:
        self._memory = memory
        self.budget = budget or ExecutionBudget()

    def execute(
        self,
        *,
        run_id: str,
        agents: Iterable[SpawnedAgent],
        tasks: Iterable[SwarmTask],
        context: Dict[str, Any] | None = None,
    ) -> ExecutionBatch:
        start = datetime.now(timezone.utc).isoformat()
        context = dict(context or {})
        executions: List[AgentExecution] = []

        api_used_total = 0
        compute_used_total = 0

        task_rows = list(tasks)
        agent_rows = list(agents)
        if not task_rows or not agent_rows:
            return ExecutionBatch(
                run_id=run_id,
                started_at=start,
                completed_at=datetime.now(timezone.utc).isoformat(),
                executions=[],
                budget={
                    "api_used_total": 0,
                    "compute_used_total": 0,
                    "api_limit_total": self.budget.max_api_calls_total,
                    "compute_limit_total": self.budget.max_compute_steps_total,
                },
            )

        # Assign tasks by role hint first, fallback round-robin.
        assignments = self._assign(agent_rows, task_rows)

        for agent, task in assignments:
            if api_used_total >= self.budget.max_api_calls_total:
                executions.append(self._budget_blocked(run_id, agent, task, "api_budget_exhausted"))
                continue
            if compute_used_total >= self.budget.max_compute_steps_total:
                executions.append(self._budget_blocked(run_id, agent, task, "compute_budget_exhausted"))
                continue

            execution = self._run_agent_task(run_id=run_id, agent=agent, task=task, context=context)
            executions.append(execution)
            api_used_total += execution.api_calls_used
            compute_used_total += execution.compute_steps_used

        batch = ExecutionBatch(
            run_id=run_id,
            started_at=start,
            completed_at=datetime.now(timezone.utc).isoformat(),
            executions=executions,
            budget={
                "api_used_total": api_used_total,
                "compute_used_total": compute_used_total,
                "api_limit_total": self.budget.max_api_calls_total,
                "compute_limit_total": self.budget.max_compute_steps_total,
                "api_remaining": max(0, self.budget.max_api_calls_total - api_used_total),
                "compute_remaining": max(0, self.budget.max_compute_steps_total - compute_used_total),
            },
        )
        self._persist(batch)
        return batch

    def _assign(self, agents: List[SpawnedAgent], tasks: List[SwarmTask]) -> List[tuple[SpawnedAgent, SwarmTask]]:
        out: List[tuple[SpawnedAgent, SwarmTask]] = []
        by_role: Dict[str, List[SpawnedAgent]] = {}
        for agent in agents:
            by_role.setdefault(agent.role, []).append(agent)

        round_robin_idx = 0
        for task in tasks:
            pool = by_role.get(task.role_hint, [])
            if pool:
                agent = pool[0]
                pool.append(pool.pop(0))
            else:
                agent = agents[round_robin_idx % len(agents)]
                round_robin_idx += 1
            out.append((agent, task))
        return out

    def _run_agent_task(
        self,
        *,
        run_id: str,
        agent: SpawnedAgent,
        task: SwarmTask,
        context: Dict[str, Any],
    ) -> AgentExecution:
        warnings: List[str] = []

        if bool(task.constraints.get("no_recursive_swarm", False)) and bool(context.get("swarm_active", False)):
            warnings.append("recursive_swarm_guard_active")

        complexity = self._estimate_complexity(task)
        api_calls = min(self.budget.max_api_calls_per_agent, max(1, complexity // 2))
        compute_steps = min(self.budget.max_compute_steps_per_agent, max(8, complexity * 10))

        if "recursive_swarm_guard_active" in warnings:
            api_calls = min(api_calls, 2)
            compute_steps = min(compute_steps, 30)

        approach = self._approach_for(agent.role)
        summary = (
            f"{agent.role} agent explored task '{task.title[:80]}' using {approach}. "
            f"Produced constrained candidate with {api_calls} API calls and {compute_steps} compute steps."
        )

        score = self._score(agent=agent, task=task, warnings=warnings)
        success = score >= 0.5

        return AgentExecution(
            run_id=run_id,
            agent_id=agent.agent_id,
            task_id=task.task_id,
            role=agent.role,
            success=success,
            summary=summary,
            approach=approach,
            score=score,
            api_calls_used=api_calls,
            compute_steps_used=compute_steps,
            warnings=warnings,
            metadata={
                "task_priority": task.priority,
                "dependencies": list(task.dependencies),
                "executed_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    @staticmethod
    def _approach_for(role: str) -> str:
        mapping = {
            "research": "multi-source evidence scan",
            "planner": "hierarchical planning",
            "critic": "counterexample stress-test",
            "optimizer": "cost-performance pruning",
            "coder": "implementation sketching",
            "validator": "invariant-driven checks",
            "risk_analyst": "risk-weighted scenario review",
            "synthesizer": "cross-solution reconciliation",
        }
        return mapping.get(role, "general analysis")

    @staticmethod
    def _estimate_complexity(task: SwarmTask) -> int:
        length = len(task.objective)
        dep_weight = len(task.dependencies) * 3
        priority_weight = max(1, int(task.priority / 20))
        return min(12, max(1, int(length / 60) + dep_weight + priority_weight))

    @staticmethod
    def _score(*, agent: SpawnedAgent, task: SwarmTask, warnings: List[str]) -> float:
        base = 0.55
        if task.role_hint == agent.role:
            base += 0.2
        if task.dependencies:
            base -= 0.04
        base -= min(0.2, len(warnings) * 0.06)
        return round(max(0.05, min(0.98, base)), 4)

    @staticmethod
    def _budget_blocked(run_id: str, agent: SpawnedAgent, task: SwarmTask, reason: str) -> AgentExecution:
        return AgentExecution(
            run_id=run_id,
            agent_id=agent.agent_id,
            task_id=task.task_id,
            role=agent.role,
            success=False,
            summary=f"Execution blocked by budget policy: {reason}",
            approach="blocked",
            score=0.0,
            api_calls_used=0,
            compute_steps_used=0,
            warnings=[reason],
            metadata={"blocked_at": datetime.now(timezone.utc).isoformat()},
        )

    def _persist(self, batch: ExecutionBatch) -> None:
        payload = {
            "run_id": batch.run_id,
            "started_at": batch.started_at,
            "completed_at": batch.completed_at,
            "budget": dict(batch.budget),
            "executions": [
                {
                    "agent_id": row.agent_id,
                    "task_id": row.task_id,
                    "role": row.role,
                    "success": row.success,
                    "score": row.score,
                    "api_calls": row.api_calls_used,
                    "compute_steps": row.compute_steps_used,
                    "warnings": list(row.warnings),
                }
                for row in batch.executions
            ],
        }
        self._memory.remember_short_term(
            key="swarm:last_execution_batch",
            value=payload,
            tags=["swarm", "execution"],
        )
        self._memory.remember_long_term(
            key=f"swarm:execution_batch:{batch.run_id}:{batch.completed_at}",
            value=payload,
            source="agent_swarm_lab.agent_executor",
            importance=0.77,
            tags=["swarm", "execution"],
        )

