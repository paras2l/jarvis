"""Agent limit controller for cognitive budget system.

Controls the maximum number of parallel agents that can be spawned for tasks.
Enforces strict caps and prevents swarm explosion that would consume excessive
compute resources.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class AgentLimitPolicy:
    """Rules for agent spawning limits."""

    max_agents_simultaneous: int = 8
    max_agents_per_hour: int = 50
    max_total_agents_per_day: int = 200
    reserved_for_critical: int = 2
    min_agents_per_task: int = 1
    max_agents_for_trivial: int = 1
    max_agents_for_simple: int = 2
    max_agents_for_moderate: int = 4
    max_agents_for_complex: int = 6
    max_agents_for_expert: int = 8


@dataclass(slots=True)
class AgentSpawnRecord:
    """Record of agent spawning for tracking and limits."""

    record_id: str
    task_id: str
    spawned_at: str
    agents_spawned: int
    complexity_score: float
    difficulty_category: str
    status: str = "active"  # active | completed | failed
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentLimitController:
    """Enforce limits on parallel agent spawning."""

    def __init__(self, memory: MemorySystem, policy: AgentLimitPolicy | None = None) -> None:
        self._memory = memory
        self.policy = policy or AgentLimitPolicy()
        self._spawn_records: list[AgentSpawnRecord] = []
        self._current_agent_count = 0

    def compute_limit(
        self,
        complexity_score: float,
        policy_limit: int | None = None,
    ) -> int:
        """Determine maximum agents for this task based on complexity."""
        # Category-based limits
        if complexity_score < 0.1:
            category_limit = self.policy.max_agents_for_trivial
        elif complexity_score < 0.3:
            category_limit = self.policy.max_agents_for_simple
        elif complexity_score < 0.6:
            category_limit = self.policy.max_agents_for_moderate
        elif complexity_score < 0.8:
            category_limit = self.policy.max_agents_for_complex
        else:
            category_limit = self.policy.max_agents_for_expert

        # Apply policy override if provided
        if policy_limit is not None:
            category_limit = min(category_limit, policy_limit)

        # Never go below minimum
        return max(self.policy.min_agents_per_task, category_limit)

    def can_spawn_agents(self, *, count: int, task_id: str) -> tuple[bool, str]:
        """Check if spawning agents is allowed."""
        # Check simultaneous limit
        if self._current_agent_count + count > self.policy.max_agents_simultaneous:
            return False, f"Would exceed max simultaneous {self.policy.max_agents_simultaneous}"

        # Check hourly limit
        hourly_count = self._count_spawns_in_window(minutes=60)
        if hourly_count + count > self.policy.max_agents_per_hour:
            return False, f"Would exceed hourly limit {self.policy.max_agents_per_hour}"

        # Check daily limit
        daily_count = self._count_spawns_in_window(minutes=1440)
        if daily_count + count > self.policy.max_total_agents_per_day:
            return False, f"Would exceed daily limit {self.policy.max_total_agents_per_day}"

        return True, "OK"

    def record_spawn(
        self,
        task_id: str,
        count: int,
        complexity_score: float,
        difficulty_category: str,
    ) -> AgentSpawnRecord:
        """Record agent spawn event for rate limiting."""
        record_id = f"spawn-{hash(task_id + str(datetime.now(timezone.utc))) % 1000000:06d}"

        record = AgentSpawnRecord(
            record_id=record_id,
            task_id=task_id,
            spawned_at=datetime.now(timezone.utc).isoformat(),
            agents_spawned=count,
            complexity_score=complexity_score,
            difficulty_category=difficulty_category,
            status="active",
        )

        self._spawn_records.append(record)
        self._current_agent_count += count

        self._persist_record(record)
        return record

    def mark_completed(self, record_id: str, count: int) -> None:
        """Mark agents as completed, freeing quota."""
        for record in self._spawn_records:
            if record.record_id == record_id:
                record.status = "completed"
                self._current_agent_count = max(0, self._current_agent_count - count)
                break

    def mark_failed(self, record_id: str, count: int) -> None:
        """Mark spawn as failed, freeing quota."""
        for record in self._spawn_records:
            if record.record_id == record_id:
                record.status = "failed"
                self._current_agent_count = max(0, self._current_agent_count - count)
                break

    def _count_spawns_in_window(self, minutes: int) -> int:
        """Count agents spawned in recent time window."""
        now = datetime.now(timezone.utc)
        cutoff = now.timestamp() - (minutes * 60)

        count = 0
        for record in self._spawn_records:
            record_time = datetime.fromisoformat(record.spawned_at).timestamp()
            if record_time > cutoff and record.status in ["active", "completed"]:
                count += record.agents_spawned

        return count

    def statistics(self) -> Dict[str, Any]:
        """Return spawn statistics."""
        active = sum(r.agents_spawned for r in self._spawn_records if r.status == "active")
        completed = sum(r.agents_spawned for r in self._spawn_records if r.status == "completed")
        failed = sum(r.agents_spawned for r in self._spawn_records if r.status == "failed")

        last_hour = self._count_spawns_in_window(minutes=60)
        last_day = self._count_spawns_in_window(minutes=1440)

        return {
            "current_active_agents": active,
            "total_spawned_completed": completed,
            "total_spawned_failed": failed,
            "spawned_last_hour": last_hour,
            "spawned_last_day": last_day,
            "max_simultaneous": self.policy.max_agents_simultaneous,
            "max_per_hour": self.policy.max_agents_per_hour,
            "max_per_day": self.policy.max_total_agents_per_day,
        }

    def _persist_record(self, record: AgentSpawnRecord) -> None:
        """Store spawn record in memory."""
        self._memory.remember_long_term(
            key=f"agent_spawn_record:{record.record_id}",
            value={
                "record_id": record.record_id,
                "task_id": record.task_id,
                "agents_spawned": record.agents_spawned,
                "complexity_score": record.complexity_score,
                "difficulty_category": record.difficulty_category,
                "status": record.status,
                "spawned_at": record.spawned_at,
            },
            source="cognitive_budget.agent_limit_controller",
            importance=0.7,
            tags=["agent", "spawn", "limit"],
        )
