"""Advanced agent manager for large-scale Jarvis orchestration.

Responsibilities:
- register and track many agents
- monitor availability and capacity
- assign tasks by capability and load
- support parallel execution decisions
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List
import uuid

from jarvis.core_advanced.task_priority_queue import ScheduledTask


@dataclass(slots=True)
class AgentProfile:
    """Describes one managed agent."""

    agent_id: str
    name: str
    capabilities: List[str]
    max_parallel_tasks: int = 2
    current_tasks: int = 0
    status: str = "idle"
    host: str = "local"
    weight: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def can_accept(self) -> bool:
        if self.status not in {"idle", "busy"}:
            return False
        return self.current_tasks < max(1, self.max_parallel_tasks)

    def load_ratio(self) -> float:
        cap = max(1, self.max_parallel_tasks)
        return min(1.0, self.current_tasks / cap)


@dataclass(slots=True)
class TaskAssignment:
    task_id: str
    agent_id: str
    accepted: bool
    reason: str


@dataclass(slots=True)
class AgentStats:
    total_agents: int
    idle_agents: int
    busy_agents: int
    unavailable_agents: int
    assignments: int
    rejected_assignments: int


class AgentManager:
    """Manages dozens of agents with capability + load aware assignment."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._agents: Dict[str, AgentProfile] = {}
        self._assignments: List[TaskAssignment] = []
        self._history_limit = 5000
        self._heartbeat_timeout_seconds = 30.0

    def register_agent(
        self,
        name: str,
        capabilities: List[str],
        *,
        max_parallel_tasks: int = 2,
        host: str = "local",
        weight: float = 1.0,
        metadata: Dict[str, Any] | None = None,
    ) -> AgentProfile:
        """Create and register a managed agent profile."""
        profile = AgentProfile(
            agent_id=f"agent-{uuid.uuid4().hex[:10]}",
            name=name.strip() or "agent",
            capabilities=[entry.strip().lower() for entry in capabilities if entry.strip()],
            max_parallel_tasks=max(1, max_parallel_tasks),
            host=host,
            weight=max(0.1, float(weight)),
            metadata=dict(metadata or {}),
        )

        with self._lock:
            self._agents[profile.agent_id] = profile
        return profile

    def unregister_agent(self, agent_id: str) -> bool:
        with self._lock:
            if agent_id not in self._agents:
                return False
            del self._agents[agent_id]
            return True

    def get_agent(self, agent_id: str) -> AgentProfile | None:
        with self._lock:
            return self._agents.get(agent_id)

    def list_agents(self) -> List[AgentProfile]:
        with self._lock:
            rows = list(self._agents.values())
        rows.sort(key=lambda item: (item.status, item.name))
        return rows

    def list_available_agents(self, capability: str | None = None) -> List[AgentProfile]:
        with self._lock:
            rows = list(self._agents.values())

        out: List[AgentProfile] = []
        wanted = (capability or "").strip().lower()
        for agent in rows:
            if not agent.can_accept():
                continue
            if wanted and wanted not in agent.capabilities:
                continue
            out.append(agent)

        out.sort(key=self._availability_sort_key)
        return out

    def update_heartbeat(self, agent_id: str, status: str | None = None) -> bool:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False
            agent.last_seen_at = datetime.now(timezone.utc).isoformat()
            if status:
                agent.status = status
            return True

    def mark_unavailable_stale_agents(self) -> int:
        """Mark agents unavailable when heartbeat is stale."""
        updated = 0
        with self._lock:
            now = datetime.now(timezone.utc)
            for agent in self._agents.values():
                try:
                    seen = datetime.fromisoformat(agent.last_seen_at)
                except ValueError:
                    continue
                age = (now - seen).total_seconds()
                if age > self._heartbeat_timeout_seconds and agent.status != "unavailable":
                    agent.status = "unavailable"
                    updated += 1
        return updated

    def assign_task(self, task: ScheduledTask) -> TaskAssignment:
        """Assign task to best matching available agent."""
        capability = task.capability.strip().lower()
        with self._lock:
            candidates = [
                agent
                for agent in self._agents.values()
                if agent.can_accept() and (capability in agent.capabilities or not capability)
            ]

            if not candidates:
                assignment = TaskAssignment(
                    task_id=task.task_id,
                    agent_id="",
                    accepted=False,
                    reason="no_available_agent",
                )
                self._record_assignment_unlocked(assignment)
                return assignment

            candidates.sort(key=self._assignment_sort_key)
            selected = candidates[0]
            selected.current_tasks += 1
            selected.status = "busy" if selected.current_tasks > 0 else "idle"
            selected.last_seen_at = datetime.now(timezone.utc).isoformat()

            assignment = TaskAssignment(
                task_id=task.task_id,
                agent_id=selected.agent_id,
                accepted=True,
                reason="assigned",
            )
            self._record_assignment_unlocked(assignment)
            return assignment

    def assign_batch(self, tasks: List[ScheduledTask]) -> List[TaskAssignment]:
        out: List[TaskAssignment] = []
        for task in tasks:
            out.append(self.assign_task(task))
        return out

    def release_task(self, agent_id: str, success: bool = True) -> bool:
        """Release one task slot from agent when task completes/fails."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False

            agent.current_tasks = max(0, agent.current_tasks - 1)
            if agent.status != "unavailable":
                agent.status = "idle" if agent.current_tasks == 0 else "busy"
            if not success:
                failures = int(agent.metadata.get("recent_failures", 0))
                agent.metadata["recent_failures"] = failures + 1
            agent.last_seen_at = datetime.now(timezone.utc).isoformat()
            return True

    def pause_agent(self, agent_id: str, reason: str = "") -> bool:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False
            agent.status = "paused"
            if reason:
                agent.metadata["pause_reason"] = reason
            return True

    def resume_agent(self, agent_id: str) -> bool:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False
            agent.status = "idle" if agent.current_tasks == 0 else "busy"
            agent.metadata.pop("pause_reason", None)
            return True

    def set_parallel_capacity(self, agent_id: str, max_parallel_tasks: int) -> bool:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False
            agent.max_parallel_tasks = max(1, max_parallel_tasks)
            if agent.current_tasks < agent.max_parallel_tasks and agent.status == "busy":
                # keep busy because active tasks may still run
                pass
            return True

    def update_weight(self, agent_id: str, weight: float) -> bool:
        with self._lock:
            agent = self._agents.get(agent_id)
            if agent is None:
                return False
            agent.weight = max(0.1, float(weight))
            return True

    def stats(self) -> AgentStats:
        with self._lock:
            rows = list(self._agents.values())
            assignments = len(self._assignments)
            rejected = sum(1 for item in self._assignments if not item.accepted)

        return AgentStats(
            total_agents=len(rows),
            idle_agents=sum(1 for item in rows if item.status == "idle"),
            busy_agents=sum(1 for item in rows if item.status == "busy"),
            unavailable_agents=sum(1 for item in rows if item.status == "unavailable"),
            assignments=assignments,
            rejected_assignments=rejected,
        )

    def assignment_history(self, limit: int = 200) -> List[TaskAssignment]:
        if limit <= 0:
            return []
        with self._lock:
            return list(reversed(self._assignments[-limit:]))

    def rebalance_capacities(self, target_parallelism: int) -> int:
        """Normalize capacity across available agents for surge control."""
        target = max(1, target_parallelism)
        changed = 0
        with self._lock:
            for agent in self._agents.values():
                if agent.status == "unavailable":
                    continue
                if agent.max_parallel_tasks != target:
                    agent.max_parallel_tasks = target
                    changed += 1
        return changed

    def choose_remote_fallback(self, capability: str) -> AgentProfile | None:
        """Choose a remote host agent when local capacity is exhausted."""
        capability = capability.strip().lower()
        with self._lock:
            candidates = [
                agent
                for agent in self._agents.values()
                if agent.host == "remote" and agent.can_accept() and capability in agent.capabilities
            ]
        if not candidates:
            return None
        candidates.sort(key=self._assignment_sort_key)
        return candidates[0]

    def _record_assignment_unlocked(self, assignment: TaskAssignment) -> None:
        self._assignments.append(assignment)
        while len(self._assignments) > self._history_limit:
            self._assignments.pop(0)

    @staticmethod
    def _assignment_sort_key(agent: AgentProfile) -> tuple[float, float, str]:
        # lower score first
        capacity_score = agent.load_ratio()
        weight_score = 1.0 / max(0.1, agent.weight)
        return (capacity_score, weight_score, agent.name)

    @staticmethod
    def _availability_sort_key(agent: AgentProfile) -> tuple[float, str]:
        return (agent.load_ratio(), agent.name)


def _example_agent_manager() -> None:
    from jarvis.core_advanced.task_priority_queue import PriorityLevel

    manager = AgentManager()
    manager.register_agent("research-alpha", ["research", "analysis"], max_parallel_tasks=3, host="local")
    manager.register_agent("creative-beta", ["creative", "design"], max_parallel_tasks=2, host="local")
    manager.register_agent("remote-exec", ["research", "automation", "development"], max_parallel_tasks=4, host="remote")

    task = ScheduledTask(
        task_id="demo-1",
        title="Investigate market segment",
        payload={"segment": "SMB"},
        capability="research",
        priority=PriorityLevel.HIGH,
    )

    assignment = manager.assign_task(task)
    print("Assignment:", assignment)

    if assignment.accepted:
        manager.release_task(assignment.agent_id, success=True)

    print("Stats:", manager.stats())


if __name__ == "__main__":
    _example_agent_manager()
