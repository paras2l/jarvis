"""Resource monitor for advanced Jarvis runtime.

Tracks CPU/memory/system pressure and recommends where tasks should run:
- local execution when resources are healthy
- remote execution when local pressure is high
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import os
from threading import RLock
from typing import Any, Dict, List, Literal

from jarvis.core_advanced.task_priority_queue import PriorityLevel, ScheduledTask

ExecutionPlacement = Literal["local", "remote", "defer"]


@dataclass(slots=True)
class ResourceSnapshot:
    timestamp: str
    cpu_percent: float
    memory_percent: float
    load_1m: float
    load_5m: float
    load_15m: float
    process_count: int
    healthy: bool


@dataclass(slots=True)
class PlacementDecision:
    task_id: str
    placement: ExecutionPlacement
    reason: str


class ResourceMonitor:
    """Monitors runtime resources and computes placement decisions."""

    def __init__(
        self,
        cpu_high_threshold: float = 85.0,
        memory_high_threshold: float = 85.0,
        load_high_threshold: float = 2.0,
    ) -> None:
        self.cpu_high_threshold = max(1.0, cpu_high_threshold)
        self.memory_high_threshold = max(1.0, memory_high_threshold)
        self.load_high_threshold = max(0.1, load_high_threshold)
        self._lock = RLock()
        self._history: List[ResourceSnapshot] = []
        self._history_limit = 2000

    def collect(self) -> ResourceSnapshot:
        """Collect one resource snapshot with psutil fallback."""
        cpu = 0.0
        memory = 0.0
        process_count = 0
        load_1m = 0.0
        load_5m = 0.0
        load_15m = 0.0

        try:
            import psutil  # type: ignore

            cpu = float(psutil.cpu_percent(interval=0.0))
            memory = float(psutil.virtual_memory().percent)
            process_count = len(psutil.pids())
            if hasattr(os, "getloadavg"):
                load_1m, load_5m, load_15m = os.getloadavg()
        except Exception:
            # Limited fallback in environments without psutil.
            if hasattr(os, "getloadavg"):
                load_1m, load_5m, load_15m = os.getloadavg()
            cpu = min(100.0, max(0.0, load_1m * 100.0 / max(1, os.cpu_count() or 1)))
            memory = 50.0
            process_count = 0

        healthy = (
            cpu < self.cpu_high_threshold
            and memory < self.memory_high_threshold
            and load_1m < self.load_high_threshold
        )

        snap = ResourceSnapshot(
            timestamp=datetime.now(timezone.utc).isoformat(),
            cpu_percent=round(cpu, 3),
            memory_percent=round(memory, 3),
            load_1m=round(load_1m, 3),
            load_5m=round(load_5m, 3),
            load_15m=round(load_15m, 3),
            process_count=process_count,
            healthy=healthy,
        )

        with self._lock:
            self._history.append(snap)
            while len(self._history) > self._history_limit:
                self._history.pop(0)
        return snap

    def recent(self, limit: int = 20) -> List[ResourceSnapshot]:
        if limit <= 0:
            return []
        with self._lock:
            return list(reversed(self._history[-limit:]))

    def moving_average(self, window: int = 10) -> Dict[str, float]:
        rows = self.recent(limit=max(1, window))
        if not rows:
            return {"cpu": 0.0, "memory": 0.0, "load_1m": 0.0}

        cpu = sum(item.cpu_percent for item in rows) / len(rows)
        mem = sum(item.memory_percent for item in rows) / len(rows)
        load = sum(item.load_1m for item in rows) / len(rows)
        return {"cpu": round(cpu, 3), "memory": round(mem, 3), "load_1m": round(load, 3)}

    def should_throttle(self) -> bool:
        averages = self.moving_average(window=8)
        return (
            averages["cpu"] >= self.cpu_high_threshold
            or averages["memory"] >= self.memory_high_threshold
            or averages["load_1m"] >= self.load_high_threshold
        )

    def placement_for_task(self, task: ScheduledTask) -> PlacementDecision:
        """Decide whether task should run local, remote, or deferred."""
        snapshot = self.collect()

        if task.priority == PriorityLevel.HIGH:
            if snapshot.memory_percent >= 95.0:
                return PlacementDecision(task.task_id, "remote", "high_priority_memory_pressure")
            return PlacementDecision(task.task_id, "local", "high_priority_prefer_local")

        if snapshot.cpu_percent >= self.cpu_high_threshold and snapshot.memory_percent >= self.memory_high_threshold:
            if task.priority == PriorityLevel.LOW:
                return PlacementDecision(task.task_id, "defer", "local_pressure_low_priority")
            return PlacementDecision(task.task_id, "remote", "local_pressure")

        if snapshot.load_1m >= self.load_high_threshold:
            if task.priority == PriorityLevel.LOW:
                return PlacementDecision(task.task_id, "defer", "high_system_load")
            return PlacementDecision(task.task_id, "remote", "high_system_load")

        return PlacementDecision(task.task_id, "local", "resources_healthy")

    def batch_placement(self, tasks: List[ScheduledTask]) -> List[PlacementDecision]:
        out: List[PlacementDecision] = []
        for task in tasks:
            out.append(self.placement_for_task(task))
        return out

    def classify_pressure(self) -> str:
        snapshot = self.collect()
        if snapshot.cpu_percent >= 90 or snapshot.memory_percent >= 90:
            return "critical"
        if snapshot.cpu_percent >= 75 or snapshot.memory_percent >= 75:
            return "high"
        if snapshot.cpu_percent >= 55 or snapshot.memory_percent >= 55:
            return "moderate"
        return "low"

    def capacity_hint(self) -> Dict[str, Any]:
        """Recommend parallel execution budget based on resource pressure."""
        pressure = self.classify_pressure()
        if pressure == "critical":
            return {"max_parallel_tasks": 2, "prefer_remote": True}
        if pressure == "high":
            return {"max_parallel_tasks": 4, "prefer_remote": True}
        if pressure == "moderate":
            return {"max_parallel_tasks": 8, "prefer_remote": False}
        return {"max_parallel_tasks": 16, "prefer_remote": False}

    def predict_pressure_trend(self, window: int = 15) -> Dict[str, Any]:
        """Estimate whether pressure is improving, stable, or worsening."""
        rows = self.recent(limit=max(4, window))
        if len(rows) < 4:
            return {"trend": "unknown", "delta_cpu": 0.0, "delta_memory": 0.0}

        # rows are newest-first; compare newest quarter vs oldest quarter
        segment = max(1, len(rows) // 4)
        newest = rows[:segment]
        oldest = rows[-segment:]

        newest_cpu = sum(item.cpu_percent for item in newest) / len(newest)
        oldest_cpu = sum(item.cpu_percent for item in oldest) / len(oldest)
        newest_mem = sum(item.memory_percent for item in newest) / len(newest)
        oldest_mem = sum(item.memory_percent for item in oldest) / len(oldest)

        delta_cpu = newest_cpu - oldest_cpu
        delta_mem = newest_mem - oldest_mem

        trend = "stable"
        if delta_cpu > 5 or delta_mem > 5:
            trend = "worsening"
        elif delta_cpu < -5 or delta_mem < -5:
            trend = "improving"

        return {
            "trend": trend,
            "delta_cpu": round(delta_cpu, 3),
            "delta_memory": round(delta_mem, 3),
        }

    def should_route_remote_globally(self) -> bool:
        """Global routing hint for orchestrators handling many tasks."""
        pressure = self.classify_pressure()
        trend = self.predict_pressure_trend().get("trend", "stable")
        if pressure == "critical":
            return True
        if pressure == "high" and trend in {"stable", "worsening"}:
            return True
        return False

    def recommend_batch_plan(self, queue_size: int) -> Dict[str, Any]:
        """Recommend batch dispatch sizing under current pressure."""
        hint = self.capacity_hint()
        base = int(hint["max_parallel_tasks"])
        if queue_size <= base:
            return {"dispatch_now": queue_size, "defer": 0, "prefer_remote": hint["prefer_remote"]}

        if hint["prefer_remote"]:
            local_now = max(1, base // 2)
            return {
                "dispatch_now": local_now,
                "defer": max(0, queue_size - local_now),
                "prefer_remote": True,
            }

        return {
            "dispatch_now": base,
            "defer": max(0, queue_size - base),
            "prefer_remote": False,
        }

    def export_history(self, limit: int = 200) -> List[Dict[str, Any]]:
        """Export recent snapshots for diagnostics and external dashboards."""
        rows = self.recent(limit=limit)
        return [
            {
                "timestamp": item.timestamp,
                "cpu_percent": item.cpu_percent,
                "memory_percent": item.memory_percent,
                "load_1m": item.load_1m,
                "load_5m": item.load_5m,
                "load_15m": item.load_15m,
                "process_count": item.process_count,
                "healthy": item.healthy,
            }
            for item in rows
        ]

    def stats(self) -> Dict[str, Any]:
        recent = self.recent(limit=1)
        latest = recent[0] if recent else self.collect()
        return {
            "latest": {
                "timestamp": latest.timestamp,
                "cpu": latest.cpu_percent,
                "memory": latest.memory_percent,
                "load_1m": latest.load_1m,
                "healthy": latest.healthy,
            },
            "moving_average": self.moving_average(window=10),
            "pressure": self.classify_pressure(),
            "trend": self.predict_pressure_trend(),
            "route_remote": self.should_route_remote_globally(),
            "capacity_hint": self.capacity_hint(),
        }


def _example_resource_monitor() -> None:
    from jarvis.core_advanced.task_priority_queue import PriorityLevel

    monitor = ResourceMonitor()
    sample = ScheduledTask(
        task_id="r1",
        title="Deep analysis",
        payload={"dataset": "q1"},
        capability="research",
        priority=PriorityLevel.MEDIUM,
    )

    snap = monitor.collect()
    decision = monitor.placement_for_task(sample)
    print("Snapshot:", snap)
    print("Decision:", decision)
    print("Stats:", monitor.stats())


if __name__ == "__main__":
    _example_resource_monitor()
