"""Monitoring dashboard for cognitive budget system.

Tracks resource usage, system load, budget consumption, and alerts on
anomalies or constraint violations. Provides observability for the
entire cognitive budget infrastructure.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ResourceMetric:
    """Single point-in-time resource measurement."""

    metric_id: str
    timestamp: str
    metric_type: str  # api_usage, compute_usage, memory_usage, etc.
    value: float
    limit: float
    utilization_percent: float
    status: str = "normal"  # normal, warning, critical
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SystemHealthSnapshot:
    """Overall health status at a moment in time."""

    snapshot_id: str
    timestamp: str
    api_utilization_percent: float
    compute_utilization_percent: float
    gpu_utilization_percent: float
    memory_utilization_percent: float
    agent_count_current: int
    agent_count_limit: int
    reasoning_cycles_active: int
    budget_allocations_active: int
    exceeded_allocations: int
    warnings_count: int
    errors_count: int
    success_rate: float
    avg_task_completion_time_seconds: float
    health_score: float  # 0.0 to 1.0
    status: str = "healthy"  # healthy, degraded, critical


@dataclass(slots=True)
class BudgetAlert:
    """Alert for budget constraint violations."""

    alert_id: str
    alert_type: str  # exceeded_limit, high_utilization, rate_limit, recursion_detected
    severity: str  # info, warning, critical
    task_id: str
    allocation_id: str
    message: str
    occurred_at: str
    resolved_at: str | None = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class MonitoringDashboard:
    """Monitor cognitive budget system health and resource usage."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._metrics: List[ResourceMetric] = []
        self._snapshots: List[SystemHealthSnapshot] = []
        self._alerts: List[BudgetAlert] = []
        self._active_alerts: Dict[str, BudgetAlert] = {}

        # Configuration
        self._thresholds = {
            "api_warning": 0.75,
            "api_critical": 0.95,
            "compute_warning": 0.70,
            "compute_critical": 0.90,
            "memory_warning": 0.80,
            "memory_critical": 0.95,
            "agent_warning": 0.80,
            "agent_critical": 0.95,
        }

    def record_metric(
        self,
        metric_type: str,
        value: float,
        limit: float,
    ) -> ResourceMetric:
        """Record a resource usage metric."""
        metric_id = f"metric-{hash(str(value) + str(datetime.now(timezone.utc))) % 1000000:06d}"
        now = datetime.now(timezone.utc)

        utilization = (value / limit * 100) if limit > 0 else 0.0

        # Determine status
        if metric_type == "api_calls":
            threshold_warning = self._thresholds["api_warning"]
            threshold_critical = self._thresholds["api_critical"]
        elif metric_type == "compute_steps":
            threshold_warning = self._thresholds["compute_warning"]
            threshold_critical = self._thresholds["compute_critical"]
        elif metric_type == "gpu_memory":
            threshold_warning = self._thresholds["memory_warning"]
            threshold_critical = self._thresholds["memory_critical"]
        elif metric_type == "agent_count":
            threshold_warning = self._thresholds["agent_warning"]
            threshold_critical = self._thresholds["agent_critical"]
        else:
            threshold_warning = 0.75
            threshold_critical = 0.95

        if utilization >= threshold_critical:
            status = "critical"
        elif utilization >= threshold_warning:
            status = "warning"
        else:
            status = "normal"

        metric = ResourceMetric(
            metric_id=metric_id,
            timestamp=now.isoformat(),
            metric_type=metric_type,
            value=value,
            limit=limit,
            utilization_percent=utilization,
            status=status,
        )

        self._metrics.append(metric)
        return metric

    def create_snapshot(
        self,
        api_used: int,
        api_limit: int,
        compute_used: int,
        compute_limit: int,
        gpu_used: int,
        gpu_limit: int,
        memory_used: int,
        memory_limit: int,
        agents_current: int,
        agents_limit: int,
        reasoning_active: int,
        allocations_active: int,
        exceeded_allocations: int,
        task_completion_times: List[float],
    ) -> SystemHealthSnapshot:
        """Create a system health snapshot."""
        snapshot_id = f"snapshot-{hash(str(datetime.now(timezone.utc))) % 1000000:06d}"
        now = datetime.now(timezone.utc)

        api_util = (api_used / api_limit * 100) if api_limit > 0 else 0.0
        compute_util = (compute_used / compute_limit * 100) if compute_limit > 0 else 0.0
        gpu_util = (gpu_used / gpu_limit * 100) if gpu_limit > 0 else 0.0
        memory_util = (memory_used / memory_limit * 100) if memory_limit > 0 else 0.0
        agent_util = (agents_current / agents_limit * 100) if agents_limit > 0 else 0.0

        # Count warnings and errors
        recent_alerts = [a for a in self._alerts if (now - datetime.fromisoformat(a.occurred_at)).total_seconds() < 3600]
        warnings = len([a for a in recent_alerts if a.severity == "warning"])
        errors = len([a for a in recent_alerts if a.severity == "critical"])

        # Success rate calculation
        success_rate = 1.0 - (exceeded_allocations / max(1, allocations_active))

        # Average completion time
        avg_completion = sum(task_completion_times) / len(task_completion_times) if task_completion_times else 0.0

        # Health score (weighted average of utilizations and success)
        utilization_avg = (api_util + compute_util + gpu_util + memory_util + agent_util) / 5
        health_score = (success_rate * 100 - utilization_avg) / 100
        health_score = max(0.0, min(1.0, health_score))

        # Status determination
        if health_score < 0.3:
            status = "critical"
        elif health_score < 0.6:
            status = "degraded"
        else:
            status = "healthy"

        snapshot = SystemHealthSnapshot(
            snapshot_id=snapshot_id,
            timestamp=now.isoformat(),
            api_utilization_percent=api_util,
            compute_utilization_percent=compute_util,
            gpu_utilization_percent=gpu_util,
            memory_utilization_percent=memory_util,
            agent_count_current=agents_current,
            agent_count_limit=agents_limit,
            reasoning_cycles_active=reasoning_active,
            budget_allocations_active=allocations_active,
            exceeded_allocations=exceeded_allocations,
            warnings_count=warnings,
            errors_count=errors,
            success_rate=success_rate,
            avg_task_completion_time_seconds=avg_completion,
            health_score=health_score,
            status=status,
        )

        self._snapshots.append(snapshot)
        self._persist_snapshot(snapshot)
        return snapshot

    def raise_alert(
        self,
        alert_type: str,
        severity: str,
        task_id: str,
        allocation_id: str,
        message: str,
    ) -> BudgetAlert:
        """Create an alert for an issue."""
        alert_id = f"alert-{hash(task_id + allocation_id + str(datetime.now(timezone.utc))) % 1000000:06d}"
        now = datetime.now(timezone.utc)

        alert = BudgetAlert(
            alert_id=alert_id,
            alert_type=alert_type,
            severity=severity,
            task_id=task_id,
            allocation_id=allocation_id,
            message=message,
            occurred_at=now.isoformat(),
        )

        self._alerts.append(alert)
        if severity in ["warning", "critical"]:
            self._active_alerts[alert_id] = alert

        self._persist_alert(alert)
        return alert

    def resolve_alert(self, alert_id: str) -> BudgetAlert | None:
        """Mark an alert as resolved."""
        for alert in self._alerts:
            if alert.alert_id == alert_id:
                alert.resolved_at = datetime.now(timezone.utc).isoformat()
                if alert_id in self._active_alerts:
                    del self._active_alerts[alert_id]
                return alert
        return None

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Get current dashboard summary for UI/monitoring."""
        if not self._snapshots:
            return {"status": "no_data", "message": "No snapshots recorded yet"}

        latest = self._snapshots[-1]

        return {
            "timestamp": latest.timestamp,
            "health_status": latest.status,
            "health_score": round(latest.health_score, 2),
            "utilization": {
                "api_percent": round(latest.api_utilization_percent, 1),
                "compute_percent": round(latest.compute_utilization_percent, 1),
                "gpu_percent": round(latest.gpu_utilization_percent, 1),
                "memory_percent": round(latest.memory_utilization_percent, 1),
            },
            "agents": {
                "current": latest.agent_count_current,
                "limit": latest.agent_count_limit,
            },
            "active_work": {
                "reasoning_cycles": latest.reasoning_cycles_active,
                "budget_allocations": latest.budget_allocations_active,
            },
            "alerts": {
                "active_warnings": len([a for a in self._active_alerts.values() if a.severity == "warning"]),
                "active_critical": len([a for a in self._active_alerts.values() if a.severity == "critical"]),
            },
            "performance": {
                "success_rate": round(latest.success_rate, 2),
                "avg_task_time_seconds": round(latest.avg_task_completion_time_seconds, 1),
            },
        }

    def _persist_snapshot(self, snapshot: SystemHealthSnapshot) -> None:
        """Store snapshot in memory."""
        self._memory.remember_long_term(
            key=f"health_snapshot:{snapshot.snapshot_id}",
            value={
                "snapshot_id": snapshot.snapshot_id,
                "timestamp": snapshot.timestamp,
                "health_score": snapshot.health_score,
                "status": snapshot.status,
                "api_utilization_percent": snapshot.api_utilization_percent,
                "compute_utilization_percent": snapshot.compute_utilization_percent,
                "exceeded_allocations": snapshot.exceeded_allocations,
            },
            source="cognitive_budget.monitoring_dashboard",
            importance=0.8,
            tags=["monitoring", "health", "snapshot"],
        )

    def _persist_alert(self, alert: BudgetAlert) -> None:
        """Store alert in memory."""
        self._memory.remember_long_term(
            key=f"budget_alert:{alert.alert_id}",
            value={
                "alert_id": alert.alert_id,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "task_id": alert.task_id,
                "message": alert.message,
                "occurred_at": alert.occurred_at,
            },
            source="cognitive_budget.monitoring_dashboard",
            importance=0.9 if alert.severity == "critical" else 0.7,
            tags=["monitoring", "alert"],
        )

