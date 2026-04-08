"""Continuous health monitor across agent, memory, queue, and error signals."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional


@dataclass(slots=True)
class HealthSnapshot:
    timestamp: str
    overall_status: str
    agent_health: Dict[str, Any] = field(default_factory=dict)
    queue_health: Dict[str, Any] = field(default_factory=dict)
    memory_health: Dict[str, Any] = field(default_factory=dict)
    simulation_health: Dict[str, Any] = field(default_factory=dict)
    self_improvement_health: Dict[str, Any] = field(default_factory=dict)
    error_rate: float = 0.0
    warnings: List[str] = field(default_factory=list)


@dataclass(slots=True)
class SystemHealthMonitor:
    """Monitors system-level health and emits warning snapshots."""

    snapshots: List[HealthSnapshot] = field(default_factory=list)
    max_history: int = 500

    def collect_snapshot(
        self,
        *,
        agent_manager: Any | None = None,
        task_dispatcher: Any | None = None,
        memory_system: Any | None = None,
        simulation_engine: Any | None = None,
        self_improvement_manager: Any | None = None,
        recent_errors: Optional[List[Mapping[str, Any]]] = None,
    ) -> HealthSnapshot:
        """Collect health data from integrated engines."""

        warnings: List[str] = []

        agent_health = self._agent_health(agent_manager)
        queue_health = self._queue_health(agent_manager, task_dispatcher)
        memory_health = self._memory_health(memory_system)
        simulation_health = self._simulation_health(simulation_engine)
        self_improvement_health = self._self_improvement_health(self_improvement_manager)
        error_rate = self._error_rate(recent_errors or [])

        if agent_health.get("degraded_agents", 0) > 0:
            warnings.append("One or more agents are degraded.")
        if queue_health.get("total_queue_depth", 0) > max(10, queue_health.get("agent_count", 0) * 3):
            warnings.append("Queue depth is elevated relative to fleet size.")
        if memory_health.get("vector_count", 0) < 0:
            warnings.append("Memory subsystem returned invalid vector count.")
        if error_rate > 0.2:
            warnings.append("Error rate is above healthy threshold (20%).")
        if simulation_health.get("failed_runs", 0) > 0:
            warnings.append("Simulation engine has failed runs in cache.")

        status = "healthy"
        if warnings:
            status = "warning"
        if error_rate > 0.4 or agent_health.get("offline_agents", 0) > 0:
            status = "critical"

        snapshot = HealthSnapshot(
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_status=status,
            agent_health=agent_health,
            queue_health=queue_health,
            memory_health=memory_health,
            simulation_health=simulation_health,
            self_improvement_health=self_improvement_health,
            error_rate=round(error_rate, 4),
            warnings=warnings,
        )
        self._append(snapshot)
        return snapshot

    def latest(self) -> Optional[HealthSnapshot]:
        if not self.snapshots:
            return None
        return self.snapshots[-1]

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.snapshots),
            "latest": self.snapshots[-1].__dict__ if self.snapshots else None,
        }

    def _append(self, snapshot: HealthSnapshot) -> None:
        self.snapshots.append(snapshot)
        if len(self.snapshots) > self.max_history:
            self.snapshots = self.snapshots[-self.max_history :]

    def _agent_health(self, agent_manager: Any | None) -> Dict[str, Any]:
        if agent_manager is None or not hasattr(agent_manager, "monitor_agents"):
            return {
                "total_agents": 0,
                "idle_agents": 0,
                "busy_agents": 0,
                "degraded_agents": 0,
                "offline_agents": 0,
            }

        report = agent_manager.monitor_agents()
        agents = report.get("agents", [])
        offline = sum(1 for item in agents if item.get("status") == "offline")
        return {
            "total_agents": int(report.get("total_agents", 0)),
            "idle_agents": int(report.get("idle_agents", 0)),
            "busy_agents": int(report.get("busy_agents", 0)),
            "degraded_agents": int(report.get("degraded_agents", 0)),
            "offline_agents": offline,
        }

    def _queue_health(self, agent_manager: Any | None, task_dispatcher: Any | None) -> Dict[str, Any]:
        queue_depth = 0
        agent_count = 0
        if agent_manager is not None and hasattr(agent_manager, "registry"):
            registry = getattr(agent_manager, "registry")
            if hasattr(registry, "all_agents"):
                agents = registry.all_agents()
                agent_count = len(agents)
                queue_depth = sum(len(agent.task_queue) for agent in agents)

        dispatch_count = 0
        if task_dispatcher is not None and hasattr(task_dispatcher, "dispatch_history"):
            dispatch_count = len(getattr(task_dispatcher, "dispatch_history"))

        return {
            "total_queue_depth": queue_depth,
            "agent_count": agent_count,
            "dispatch_count": dispatch_count,
        }

    def _memory_health(self, memory_system: Any | None) -> Dict[str, Any]:
        if memory_system is None or not hasattr(memory_system, "stats"):
            return {"available": False, "vector_count": 0}

        stats = memory_system.stats()
        vector_count = int(stats.get("vector_memory", {}).get("count", 0))
        short_term_count = int(stats.get("short_term", {}).get("count", 0))
        long_term_count = int(stats.get("long_term", {}).get("count", 0))

        return {
            "available": True,
            "vector_count": vector_count,
            "short_term_count": short_term_count,
            "long_term_count": long_term_count,
        }

    def _simulation_health(self, simulation_engine: Any | None) -> Dict[str, Any]:
        if simulation_engine is None:
            return {"available": False, "active_runs": 0, "failed_runs": 0}

        active = len(getattr(simulation_engine, "_active_simulations", {}))
        cache = getattr(simulation_engine, "_results_cache", {})

        failed = 0
        for value in cache.values():
            status_value = getattr(value, "status", None)
            if hasattr(status_value, "value"):
                status_value = status_value.value
            if str(status_value) == "failed":
                failed += 1

        return {
            "available": True,
            "active_runs": active,
            "failed_runs": failed,
            "cached_runs": len(cache),
        }

    def _self_improvement_health(self, self_improvement_manager: Any | None) -> Dict[str, Any]:
        if self_improvement_manager is None:
            return {"available": False, "cycle_counter": 0}

        return {
            "available": True,
            "cycle_counter": int(getattr(self_improvement_manager, "_cycle_counter", 0)),
        }

    def _error_rate(self, recent_errors: List[Mapping[str, Any]]) -> float:
        if not recent_errors:
            return 0.0
        failures = sum(1 for item in recent_errors if item.get("severity", "error") in {"error", "critical"})
        return failures / float(len(recent_errors))
