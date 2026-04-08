"""Learning scheduler for Pixi self-improvement.

Creates and runs lightweight background learning tasks from detected gaps.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import heapq
from threading import RLock
from typing import Any, Dict, List, Tuple

from Pixi.memory.memory_system import MemorySystem
from Pixi.self_improvement.capability_gap_detector import CapabilityGap
from Pixi.skills.skill_registry import SkillRegistry
from Pixi.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class LearningTask:
    task_id: str
    title: str
    objective: str
    priority: int
    next_run_at: str
    max_attempts: int = 3
    attempts: int = 0
    status: str = "scheduled"
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LearningRunResult:
    task_id: str
    success: bool
    summary: str
    completed_at: str
    attempts: int
    metadata: Dict[str, Any] = field(default_factory=dict)


class LearningScheduler:
    def __init__(self, memory: MemorySystem, skill_registry: SkillRegistry, world_state: WorldStateModel) -> None:
        self._memory = memory
        self._skills = skill_registry
        self._world_state = world_state
        self._lock = RLock()
        self._tasks: Dict[str, LearningTask] = {}
        self._heap: List[Tuple[int, int, str]] = []
        self._sequence = 0
        self._history: List[LearningRunResult] = []

    def plan_from_gaps(self, gaps: List[CapabilityGap], max_tasks: int = 6) -> List[LearningTask]:
        ranked = sorted(gaps, key=lambda row: (row.severity, row.impact_score), reverse=True)
        world = self._world_state.current()
        base_delay = 3 if world.system_health == "healthy" else 8

        created: List[LearningTask] = []
        for idx, gap in enumerate(ranked[: max(1, int(max_tasks))], start=1):
            delay = base_delay + idx * 2
            task = LearningTask(
                task_id=f"learn-{abs(hash(gap.gap_id)) % 10_000_000}",
                title=f"Learn for {gap.category}",
                objective=f"Improve capability {gap.missing_capability}; evidence: {'; '.join(gap.evidence[:2])}",
                priority=self._priority_from_gap(gap),
                next_run_at=(datetime.now(timezone.utc) + timedelta(minutes=delay)).isoformat(),
                metadata={
                    "gap_id": gap.gap_id,
                    "category": gap.category,
                    "severity": gap.severity,
                    "impact": gap.impact_score,
                },
            )
            self.schedule(task)
            created.append(task)

        self._persist_schedule(created)
        return created

    def schedule(self, task: LearningTask) -> None:
        with self._lock:
            self._tasks[task.task_id] = task
            heapq.heappush(self._heap, (task.priority, self._sequence, task.task_id))
            self._sequence += 1

    def run_due_tasks(self, limit: int = 2) -> List[LearningRunResult]:
        out: List[LearningRunResult] = []
        for _ in range(max(1, int(limit))):
            task = self._dequeue_due_task()
            if task is None:
                break
            result = self._execute_task(task)
            out.append(result)
            self._append_history(result)
            if not result.success and task.attempts < task.max_attempts:
                self._reschedule_with_backoff(task)

        if out:
            self._persist_runs(out)
        return out

    def _dequeue_due_task(self) -> LearningTask | None:
        now = datetime.now(timezone.utc)
        with self._lock:
            while self._heap:
                _, _, task_id = heapq.heappop(self._heap)
                task = self._tasks.get(task_id)
                if task is None or task.status != "scheduled":
                    continue
                due_at = self._parse_iso(task.next_run_at)
                if due_at is None or due_at > now:
                    heapq.heappush(self._heap, (task.priority, self._sequence, task.task_id))
                    self._sequence += 1
                    return None
                return task
        return None

    def _execute_task(self, task: LearningTask) -> LearningRunResult:
        task.attempts += 1
        task.status = "running"
        payload = {"topic": task.objective, "depth": "deep" if task.priority <= 30 else "standard"}

        try:
            if self._skills.get_skill("research_snapshot") is not None:
                output = self._skills.execute_skill_raw("research_snapshot", payload)
                summary = f"Learning task completed via research_snapshot: {output}"
            else:
                summary = "Learning task completed in fallback mode (research skill unavailable)."
            task.status = "completed"
            return LearningRunResult(
                task_id=task.task_id,
                success=True,
                summary=summary,
                completed_at=datetime.now(timezone.utc).isoformat(),
                attempts=task.attempts,
                metadata={"objective": task.objective},
            )
        except Exception as exc:
            task.status = "failed"
            return LearningRunResult(
                task_id=task.task_id,
                success=False,
                summary=f"Learning task failed: {exc}",
                completed_at=datetime.now(timezone.utc).isoformat(),
                attempts=task.attempts,
                metadata={"objective": task.objective, "error": str(exc)},
            )

    def _reschedule_with_backoff(self, task: LearningTask) -> None:
        task.next_run_at = (datetime.now(timezone.utc) + timedelta(minutes=min(60, 5 * task.attempts))).isoformat()
        task.status = "scheduled"
        with self._lock:
            heapq.heappush(self._heap, (min(100, task.priority + 5), self._sequence, task.task_id))
            self._sequence += 1

    def _append_history(self, result: LearningRunResult) -> None:
        self._history.append(result)

    def _persist_schedule(self, tasks: List[LearningTask]) -> None:
        if not tasks:
            return
        payload = {
            "type": "learning_schedule",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "tasks": [
                {
                    "task_id": row.task_id,
                    "title": row.title,
                    "priority": row.priority,
                    "next_run_at": row.next_run_at,
                    "objective": row.objective,
                    "metadata": row.metadata,
                }
                for row in tasks
            ],
        }
        self._memory.remember_long_term(
            key=f"self_improvement:learning_schedule:{payload['created_at']}",
            value=payload,
            source="self_improvement.learning_scheduler",
            importance=0.7,
            tags=["self_improvement", "learning_schedule"],
        )

    def _persist_runs(self, runs: List[LearningRunResult]) -> None:
        payload = {
            "type": "learning_run_batch",
            "executed_at": datetime.now(timezone.utc).isoformat(),
            "runs": [
                {
                    "task_id": row.task_id,
                    "success": row.success,
                    "summary": row.summary,
                    "attempts": row.attempts,
                    "metadata": row.metadata,
                }
                for row in runs
            ],
        }
        self._memory.remember_short_term(
            key="self_improvement:last_learning_runs",
            value=payload,
            tags=["self_improvement", "learning_run"],
        )
        self._memory.remember_long_term(
            key=f"self_improvement:learning_run:{payload['executed_at']}",
            value=payload,
            source="self_improvement.learning_scheduler",
            importance=0.68,
            tags=["self_improvement", "learning_run"],
        )

    @staticmethod
    def _priority_from_gap(gap: CapabilityGap) -> int:
        return max(5, min(95, int(100 - (gap.severity * 55 + gap.impact_score * 35))))

    @staticmethod
    def _parse_iso(value: str) -> datetime | None:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None
        except Exception:
            return None

