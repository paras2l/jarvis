"""Goal registry for Jarvis long-horizon objective tracking.

Stores active and historical goals with priority, status, and metadata.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Literal
import uuid

from jarvis.memory.memory_system import MemorySystem

GoalStatus = Literal[
    "pending",
    "active",
    "paused",
    "completed",
    "failed",
    "cancelled",
]


@dataclass(slots=True)
class GoalRecord:
    """One long-running objective tracked by the goal manager."""

    goal_id: str
    title: str
    objective: str
    status: GoalStatus
    priority: int
    created_at: str
    updated_at: str
    horizon: str = "short_term"
    objective_type: str = "execution"
    confidence: float = 0.5
    reasoning_id: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    milestone_ids: List[str] = field(default_factory=list)
    last_error: str = ""


class GoalRegistry:
    """In-memory goal index with memory persistence hooks."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._lock = RLock()
        self._goals: Dict[str, GoalRecord] = {}

    def create_goal(
        self,
        *,
        title: str,
        objective: str,
        priority: int = 50,
        horizon: str = "short_term",
        objective_type: str = "execution",
        confidence: float = 0.5,
        reasoning_id: str = "",
        tags: List[str] | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> GoalRecord:
        now = datetime.now(timezone.utc).isoformat()
        goal = GoalRecord(
            goal_id=f"goal-{uuid.uuid4().hex[:12]}",
            title=title.strip() or objective[:60],
            objective=objective.strip(),
            status="pending",
            priority=max(1, min(100, int(priority))),
            created_at=now,
            updated_at=now,
            horizon=horizon,
            objective_type=objective_type,
            confidence=round(min(0.99, max(0.01, confidence)), 4),
            reasoning_id=reasoning_id,
            tags=list(tags or []),
            metadata=dict(metadata or {}),
        )

        with self._lock:
            self._goals[goal.goal_id] = goal

        self._persist_goal(goal)
        return goal

    def get(self, goal_id: str) -> GoalRecord | None:
        with self._lock:
            return self._goals.get(goal_id)

    def list_goals(self, include_terminal: bool = True) -> List[GoalRecord]:
        with self._lock:
            rows = list(self._goals.values())
        if not include_terminal:
            rows = [row for row in rows if row.status not in {"completed", "failed", "cancelled"}]
        rows.sort(key=lambda row: (row.status in {"active", "pending"}, row.priority, row.created_at), reverse=True)
        return rows

    def by_status(self, statuses: List[GoalStatus]) -> List[GoalRecord]:
        allowed = set(statuses)
        return [row for row in self.list_goals(include_terminal=True) if row.status in allowed]

    def activate(self, goal_id: str) -> bool:
        return self.update_status(goal_id, "active")

    def pause(self, goal_id: str, reason: str = "") -> bool:
        ok = self.update_status(goal_id, "paused")
        if ok and reason:
            self.set_error(goal_id, reason)
        return ok

    def resume(self, goal_id: str) -> bool:
        return self.update_status(goal_id, "active")

    def complete(self, goal_id: str) -> bool:
        return self.update_status(goal_id, "completed")

    def fail(self, goal_id: str, reason: str = "") -> bool:
        ok = self.update_status(goal_id, "failed")
        if ok and reason:
            self.set_error(goal_id, reason)
        return ok

    def cancel(self, goal_id: str, reason: str = "") -> bool:
        ok = self.update_status(goal_id, "cancelled")
        if ok and reason:
            self.set_error(goal_id, reason)
        return ok

    def update_status(self, goal_id: str, status: GoalStatus) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            row.status = status
            row.updated_at = datetime.now(timezone.utc).isoformat()

        self._persist_goal(row)
        return True

    def attach_milestones(self, goal_id: str, milestone_ids: List[str]) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            merged = list(dict.fromkeys(row.milestone_ids + milestone_ids))
            row.milestone_ids = merged
            row.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_goal(row)
        return True

    def set_priority(self, goal_id: str, priority: int) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            row.priority = max(1, min(100, int(priority)))
            row.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_goal(row)
        return True

    def set_error(self, goal_id: str, reason: str) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            row.last_error = reason[:600]
            row.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_goal(row)
        return True

    def annotate(self, goal_id: str, data: Dict[str, Any]) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            row.metadata.update(dict(data))
            row.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_goal(row)
        return True

    def touch(self, goal_id: str) -> bool:
        with self._lock:
            row = self._goals.get(goal_id)
            if row is None:
                return False
            row.updated_at = datetime.now(timezone.utc).isoformat()
        self._persist_goal(row)
        return True

    def snapshot(self) -> Dict[str, Any]:
        rows = self.list_goals(include_terminal=True)
        return {
            "total": len(rows),
            "active": sum(1 for row in rows if row.status == "active"),
            "pending": sum(1 for row in rows if row.status == "pending"),
            "paused": sum(1 for row in rows if row.status == "paused"),
            "completed": sum(1 for row in rows if row.status == "completed"),
            "failed": sum(1 for row in rows if row.status == "failed"),
        }

    def _persist_goal(self, goal: GoalRecord) -> None:
        payload = {
            "goal_id": goal.goal_id,
            "title": goal.title,
            "objective": goal.objective,
            "status": goal.status,
            "priority": goal.priority,
            "horizon": goal.horizon,
            "objective_type": goal.objective_type,
            "confidence": goal.confidence,
            "reasoning_id": goal.reasoning_id,
            "tags": goal.tags,
            "milestone_ids": goal.milestone_ids,
            "last_error": goal.last_error,
            "metadata": goal.metadata,
            "created_at": goal.created_at,
            "updated_at": goal.updated_at,
        }
        self._memory.remember_short_term(
            key=f"goal_registry:{goal.goal_id}",
            value=payload,
            tags=["goal_manager", "goal_registry"],
        )
        self._memory.remember_long_term(
            key=f"goal_registry:{goal.goal_id}",
            value=payload,
            source="goal_registry",
            importance=0.76,
            tags=["goal_manager", "goal"],
        )
