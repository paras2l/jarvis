"""Milestone tracker for Pixi goal management.

Tracks milestone state transitions and links task-level results to milestone
progress.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem
from Pixi.goal_manager.goal_decomposer import GoalDecompositionResult, MilestoneRecord


@dataclass(slots=True)
class MilestoneProgress:
    """Live progress state for a milestone."""

    milestone_id: str
    goal_id: str
    title: str
    status: str
    started_at: str = ""
    completed_at: str = ""
    attempt_count: int = 0
    successful_tasks: int = 0
    failed_tasks: int = 0
    last_summary: str = ""
    task_results: List[Dict[str, Any]] = field(default_factory=list)


class MilestoneTracker:
    """Maintains milestone lifecycle and task-to-milestone mapping."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._lock = RLock()
        self._milestones: Dict[str, MilestoneRecord] = {}
        self._progress: Dict[str, MilestoneProgress] = {}
        self._goal_index: Dict[str, List[str]] = {}
        self._task_to_milestone: Dict[str, str] = {}

    def register_decomposition(self, result: GoalDecompositionResult) -> List[str]:
        ids: List[str] = []
        with self._lock:
            self._goal_index[result.goal_id] = []
            for item in result.milestones:
                self._milestones[item.milestone_id] = item
                self._goal_index[result.goal_id].append(item.milestone_id)
                self._progress[item.milestone_id] = MilestoneProgress(
                    milestone_id=item.milestone_id,
                    goal_id=item.goal_id,
                    title=item.title,
                    status=item.status,
                )
                ids.append(item.milestone_id)

        self._persist_goal(result.goal_id)
        return ids

    def list_for_goal(self, goal_id: str) -> List[MilestoneRecord]:
        with self._lock:
            ids = list(self._goal_index.get(goal_id, []))
            rows = [self._milestones[mid] for mid in ids if mid in self._milestones]
        rows.sort(key=lambda row: row.order)
        return rows

    def progress_for_goal(self, goal_id: str) -> List[MilestoneProgress]:
        rows = [self._progress[row.milestone_id] for row in self.list_for_goal(goal_id) if row.milestone_id in self._progress]
        rows.sort(key=lambda row: row.milestone_id)
        return rows

    def next_runnable(self, goal_id: str) -> MilestoneRecord | None:
        rows = self.list_for_goal(goal_id)
        by_id = {row.milestone_id: row for row in rows}
        for row in rows:
            if row.status in {"completed", "failed", "cancelled"}:
                continue
            if row.status == "in_progress":
                return row
            if row.status != "pending":
                continue
            if self._deps_satisfied(row, by_id):
                return row
        return None

    def mark_started(self, milestone_id: str) -> bool:
        with self._lock:
            row = self._milestones.get(milestone_id)
            prog = self._progress.get(milestone_id)
            if row is None or prog is None:
                return False
            row.status = "in_progress"
            prog.status = "in_progress"
            if not prog.started_at:
                prog.started_at = datetime.now(timezone.utc).isoformat()
            prog.attempt_count += 1
        self._persist_goal(row.goal_id)
        return True

    def mark_completed(self, milestone_id: str, summary: str = "") -> bool:
        with self._lock:
            row = self._milestones.get(milestone_id)
            prog = self._progress.get(milestone_id)
            if row is None or prog is None:
                return False
            row.status = "completed"
            prog.status = "completed"
            prog.completed_at = datetime.now(timezone.utc).isoformat()
            prog.last_summary = summary[:700]
        self._persist_goal(row.goal_id)
        return True

    def mark_failed(self, milestone_id: str, summary: str = "") -> bool:
        with self._lock:
            row = self._milestones.get(milestone_id)
            prog = self._progress.get(milestone_id)
            if row is None or prog is None:
                return False
            row.status = "failed"
            prog.status = "failed"
            prog.last_summary = summary[:700]
        self._persist_goal(row.goal_id)
        return True

    def pause_goal(self, goal_id: str, reason: str = "") -> None:
        with self._lock:
            for row in self.list_for_goal(goal_id):
                if row.status in {"pending", "in_progress"}:
                    row.status = "paused"
                    prog = self._progress.get(row.milestone_id)
                    if prog is not None:
                        prog.status = "paused"
                        if reason:
                            prog.last_summary = reason[:700]
        self._persist_goal(goal_id)

    def resume_goal(self, goal_id: str) -> None:
        with self._lock:
            for row in self.list_for_goal(goal_id):
                if row.status == "paused":
                    row.status = "pending"
                    prog = self._progress.get(row.milestone_id)
                    if prog is not None:
                        prog.status = "pending"
        self._persist_goal(goal_id)

    def register_task(self, milestone_id: str, task_id: str) -> bool:
        with self._lock:
            if milestone_id not in self._milestones:
                return False
            self._task_to_milestone[task_id] = milestone_id
        return True

    def resolve_milestone_for_task(self, task_id: str) -> str | None:
        with self._lock:
            return self._task_to_milestone.get(task_id)

    def record_task_result(self, task_id: str, success: bool, summary: str) -> str | None:
        with self._lock:
            milestone_id = self._task_to_milestone.get(task_id)
            if not milestone_id:
                return None
            prog = self._progress.get(milestone_id)
            row = self._milestones.get(milestone_id)
            if prog is None or row is None:
                return None

            prog.task_results.append(
                {
                    "task_id": task_id,
                    "success": success,
                    "summary": summary[:600],
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            )
            prog.last_summary = summary[:700]
            if success:
                prog.successful_tasks += 1
            else:
                prog.failed_tasks += 1

            if success and prog.successful_tasks >= 1 and row.status == "in_progress":
                row.status = "completed"
                prog.status = "completed"
                prog.completed_at = datetime.now(timezone.utc).isoformat()
            if not success and prog.failed_tasks >= 2:
                row.status = "failed"
                prog.status = "failed"

            goal_id = row.goal_id

        self._persist_goal(goal_id)
        return milestone_id

    def completion_ratio(self, goal_id: str) -> float:
        rows = self.list_for_goal(goal_id)
        if not rows:
            return 0.0
        completed = sum(1 for row in rows if row.status == "completed")
        return round(completed / len(rows), 4)

    def has_failed_milestones(self, goal_id: str) -> bool:
        return any(row.status == "failed" for row in self.list_for_goal(goal_id))

    def _deps_satisfied(self, row: MilestoneRecord, by_id: Dict[str, MilestoneRecord]) -> bool:
        if not row.depends_on:
            return True
        for dep in row.depends_on:
            dep_row = by_id.get(dep)
            if dep_row is None or dep_row.status != "completed":
                return False
        return True

    def _persist_goal(self, goal_id: str) -> None:
        rows = self.list_for_goal(goal_id)
        payload = {
            "goal_id": goal_id,
            "milestones": [
                {
                    "milestone_id": row.milestone_id,
                    "title": row.title,
                    "order": row.order,
                    "priority": row.priority,
                    "status": row.status,
                    "depends_on": row.depends_on,
                    "metadata": row.metadata,
                }
                for row in rows
            ],
        }
        self._memory.remember_short_term(
            key=f"milestone_tracker:{goal_id}",
            value=payload,
            tags=["goal_manager", "milestones"],
        )
        self._memory.remember_long_term(
            key=f"milestone_tracker:{goal_id}",
            value=payload,
            source="milestone_tracker",
            importance=0.72,
            tags=["goal_manager", "milestones"],
        )

