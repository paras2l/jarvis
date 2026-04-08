"""System health monitor for Pixi Guardian Layer.

Tracks core health metrics including CPU, memory, active agents, API request
rate, and compute budget pressure. Produces snapshots and anomaly signals used
by repair orchestration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import mean
from threading import RLock
from typing import Any, Dict, List
import uuid

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class HealthMetric:
    timestamp: str
    name: str
    value: float
    unit: str
    source: str


@dataclass(slots=True)
class HealthSnapshot:
    snapshot_id: str
    timestamp: str
    status: str
    score: float
    metrics: Dict[str, float] = field(default_factory=dict)
    anomalies: List[str] = field(default_factory=list)


class SystemHealthMonitor:
    """Maintains rolling system health state."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        max_metrics: int = 5000,
        max_snapshots: int = 500,
    ) -> None:
        self._memory = memory
        self._lock = RLock()
        self._max_metrics = max(500, max_metrics)
        self._max_snapshots = max(100, max_snapshots)

        self._metrics: List[HealthMetric] = []
        self._snapshots: List[HealthSnapshot] = []

        self.thresholds = {
            "cpu_pct": 88.0,
            "memory_pct": 90.0,
            "agent_count": 12.0,
            "api_rate_per_min": 180.0,
            "compute_budget_pressure": 0.92,
        }

    def record_metrics(
        self,
        *,
        source: str,
        cpu_pct: float,
        memory_pct: float,
        agent_count: int,
        api_rate_per_min: float,
        compute_budget_pressure: float,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        payload = [
            ("cpu_pct", float(cpu_pct), "%"),
            ("memory_pct", float(memory_pct), "%"),
            ("agent_count", float(agent_count), "count"),
            ("api_rate_per_min", float(api_rate_per_min), "req/min"),
            ("compute_budget_pressure", float(compute_budget_pressure), "ratio"),
        ]

        with self._lock:
            for name, value, unit in payload:
                self._metrics.append(
                    HealthMetric(
                        timestamp=now,
                        name=name,
                        value=value,
                        unit=unit,
                        source=source,
                    )
                )
            if len(self._metrics) > self._max_metrics:
                self._metrics = self._metrics[-self._max_metrics:]

        self._memory.remember_short_term(
            key="guardian:health:last_metrics",
            value={
                "source": source,
                "cpu_pct": cpu_pct,
                "memory_pct": memory_pct,
                "agent_count": agent_count,
                "api_rate_per_min": api_rate_per_min,
                "compute_budget_pressure": compute_budget_pressure,
            },
            tags=["guardian", "health"],
        )

    def create_snapshot(self) -> HealthSnapshot:
        now = datetime.now(timezone.utc)
        recent = self._recent_window(seconds=120)
        grouped: Dict[str, List[float]] = {}
        for item in recent:
            grouped.setdefault(item.name, []).append(item.value)

        metrics = {
            "cpu_pct": self._avg(grouped.get("cpu_pct", [])),
            "memory_pct": self._avg(grouped.get("memory_pct", [])),
            "agent_count": self._avg(grouped.get("agent_count", [])),
            "api_rate_per_min": self._avg(grouped.get("api_rate_per_min", [])),
            "compute_budget_pressure": self._avg(grouped.get("compute_budget_pressure", [])),
        }

        anomalies: List[str] = []
        if metrics["cpu_pct"] > self.thresholds["cpu_pct"]:
            anomalies.append("cpu_pressure")
        if metrics["memory_pct"] > self.thresholds["memory_pct"]:
            anomalies.append("memory_pressure")
        if metrics["agent_count"] > self.thresholds["agent_count"]:
            anomalies.append("agent_overload")
        if metrics["api_rate_per_min"] > self.thresholds["api_rate_per_min"]:
            anomalies.append("api_surge")
        if metrics["compute_budget_pressure"] > self.thresholds["compute_budget_pressure"]:
            anomalies.append("compute_budget_saturated")

        score = self._compute_health_score(metrics, anomalies)
        status = "healthy"
        if score < 0.45:
            status = "critical"
        elif score < 0.72:
            status = "degraded"

        snapshot = HealthSnapshot(
            snapshot_id=f"health-{uuid.uuid4().hex[:10]}",
            timestamp=now.isoformat(),
            status=status,
            score=score,
            metrics=metrics,
            anomalies=anomalies,
        )

        with self._lock:
            self._snapshots.append(snapshot)
            if len(self._snapshots) > self._max_snapshots:
                self._snapshots = self._snapshots[-self._max_snapshots:]

        self._persist_snapshot(snapshot)
        return snapshot

    def latest_snapshot(self) -> HealthSnapshot | None:
        with self._lock:
            if not self._snapshots:
                return None
            return self._snapshots[-1]

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            last = self._snapshots[-1] if self._snapshots else None
            return {
                "metrics_total": len(self._metrics),
                "snapshots_total": len(self._snapshots),
                "latest": None
                if last is None
                else {
                    "snapshot_id": last.snapshot_id,
                    "status": last.status,
                    "score": last.score,
                    "anomalies": list(last.anomalies),
                },
                "thresholds": dict(self.thresholds),
            }

    def _recent_window(self, *, seconds: int) -> List[HealthMetric]:
        now = datetime.now(timezone.utc)
        start = now - timedelta(seconds=max(10, seconds))
        with self._lock:
            return [item for item in self._metrics if self._to_dt(item.timestamp) >= start]

    @staticmethod
    def _avg(values: List[float]) -> float:
        if not values:
            return 0.0
        return float(mean(values))

    def _compute_health_score(self, metrics: Dict[str, float], anomalies: List[str]) -> float:
        penalties = 0.0
        penalties += min(0.30, max(0.0, metrics["cpu_pct"] - 65.0) / 100.0)
        penalties += min(0.30, max(0.0, metrics["memory_pct"] - 65.0) / 100.0)
        penalties += min(0.15, max(0.0, metrics["agent_count"] - 4.0) / 20.0)
        penalties += min(0.10, max(0.0, metrics["api_rate_per_min"] - 60.0) / 300.0)
        penalties += min(0.15, max(0.0, metrics["compute_budget_pressure"] - 0.4))
        penalties += min(0.25, len(anomalies) * 0.05)
        return max(0.0, min(1.0, 1.0 - penalties))

    def _persist_snapshot(self, snapshot: HealthSnapshot) -> None:
        self._memory.remember_short_term(
            key="guardian:health:last_snapshot",
            value={
                "snapshot_id": snapshot.snapshot_id,
                "status": snapshot.status,
                "score": snapshot.score,
                "anomalies": snapshot.anomalies,
                "metrics": snapshot.metrics,
            },
            tags=["guardian", "health"],
        )
        self._memory.remember_long_term(
            key=f"guardian:health:{snapshot.snapshot_id}",
            value={
                "timestamp": snapshot.timestamp,
                "status": snapshot.status,
                "score": snapshot.score,
                "anomalies": snapshot.anomalies,
                "metrics": snapshot.metrics,
            },
            source="guardian.system_health_monitor",
            importance=0.9 if snapshot.status in {"degraded", "critical"} else 0.65,
            tags=["guardian", "health", snapshot.status],
        )

    @staticmethod
    def _to_dt(ts: str) -> datetime:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))

