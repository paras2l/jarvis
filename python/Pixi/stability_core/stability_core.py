"""System Stability Core orchestrator.

Coordinates resource monitoring, rate limiting, task safety checks, failure
recovery, and health monitoring in a continuous background loop.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
import time
from typing import Any, Dict, List, Mapping, Optional

from Pixi.memory.memory_system import MemorySystem
from Pixi.stability_core.failure_recovery import FailureRecovery, RecoveryAction
from Pixi.stability_core.rate_limiter import RateDecision, RateLimiter, RatePolicy
from Pixi.stability_core.resource_monitor import ResourceMonitor, ResourceSnapshot
from Pixi.stability_core.system_health_monitor import HealthSnapshot, SystemHealthMonitor
from Pixi.stability_core.task_guard import TaskGuard, TaskGuardDecision


@dataclass(slots=True)
class StabilityConfig:
    """Control intervals and operation channels for stability loop."""

    monitor_interval_seconds: float = 2.0
    persist_interval_seconds: float = 10.0
    api_rate_per_minute: int = 500
    browser_rate_per_minute: int = 180
    task_rate_per_minute: int = 320


@dataclass(slots=True)
class StabilityCycleResult:
    timestamp: str
    resource_snapshot: Dict[str, Any]
    health_snapshot: Dict[str, Any]
    throttle_applied: bool
    throttle_details: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


@dataclass(slots=True)
class SystemStabilityCore:
    """Central stability coordinator for the entire Pixi architecture."""

    memory_system: Optional[MemorySystem] = None
    resource_monitor: ResourceMonitor = field(default_factory=ResourceMonitor)
    task_guard: TaskGuard = field(default_factory=TaskGuard)
    failure_recovery: FailureRecovery = field(default_factory=FailureRecovery)
    rate_limiter: RateLimiter = field(default_factory=RateLimiter)
    health_monitor: SystemHealthMonitor = field(default_factory=SystemHealthMonitor)
    config: StabilityConfig = field(default_factory=StabilityConfig)

    agent_manager: Any | None = None
    task_dispatcher: Any | None = None
    planning_system: Any | None = None
    action_system: Any | None = None
    simulation_engine: Any | None = None
    self_improvement_manager: Any | None = None

    _running: bool = False
    _thread: threading.Thread | None = None
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _last_persist_at: float = 0.0
    _recent_errors: List[Dict[str, Any]] = field(default_factory=list)
    _cycle_history: List[StabilityCycleResult] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._initialize_default_rate_policies()

    def configure_integrations(
        self,
        *,
        agent_manager: Any | None = None,
        task_dispatcher: Any | None = None,
        planning_system: Any | None = None,
        action_system: Any | None = None,
        simulation_engine: Any | None = None,
        self_improvement_manager: Any | None = None,
    ) -> None:
        """Attach integrations for monitored subsystems."""

        self.agent_manager = agent_manager
        self.task_dispatcher = task_dispatcher
        self.planning_system = planning_system
        self.action_system = action_system
        self.simulation_engine = simulation_engine
        self.self_improvement_manager = self_improvement_manager

    def start_background(self) -> None:
        """Run stability loop continuously in the background."""

        with self._lock:
            if self._running:
                return
            self._running = True
            self._thread = threading.Thread(
                target=self._background_loop,
                name="Pixi-stability-core",
                daemon=True,
            )
            self._thread.start()

    def stop_background(self, timeout_seconds: float = 3.0) -> None:
        with self._lock:
            self._running = False
            thread = self._thread
            self._thread = None
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout_seconds)

    def run_once(self) -> StabilityCycleResult:
        """Execute one stability cycle manually (useful for tests and sync flows)."""

        resource_snapshot = self.resource_monitor.sample(
            counters={
                "api_calls_per_minute": self.resource_monitor.api_call_counter,
                "task_executions_per_minute": self.resource_monitor.task_execution_counter,
            }
        )
        throttle = self.resource_monitor.throttle_recommendation(resource_snapshot)
        if throttle.get("apply_throttle", False):
            self._apply_throttle(throttle)

        health_snapshot = self.health_monitor.collect_snapshot(
            agent_manager=self.agent_manager,
            task_dispatcher=self.task_dispatcher,
            memory_system=self.memory_system,
            simulation_engine=self.simulation_engine,
            self_improvement_manager=self.self_improvement_manager,
            recent_errors=self._recent_errors,
        )

        notes: List[str] = []
        if health_snapshot.overall_status in {"warning", "critical"}:
            notes.extend(health_snapshot.warnings)

        result = StabilityCycleResult(
            timestamp=datetime.now(timezone.utc).isoformat(),
            resource_snapshot={
                "cpu_percent": resource_snapshot.cpu_percent,
                "ram_percent": resource_snapshot.ram_percent,
                "gpu_percent": resource_snapshot.gpu_percent,
                "api_calls_per_minute": resource_snapshot.api_calls_per_minute,
                "task_executions_per_minute": resource_snapshot.task_executions_per_minute,
                "reasons": list(resource_snapshot.reasons),
            },
            health_snapshot={
                "overall_status": health_snapshot.overall_status,
                "error_rate": health_snapshot.error_rate,
                "warnings": list(health_snapshot.warnings),
            },
            throttle_applied=bool(throttle.get("apply_throttle", False)),
            throttle_details=throttle,
            notes=notes,
        )

        self._cycle_history.append(result)
        if len(self._cycle_history) > 1000:
            self._cycle_history = self._cycle_history[-1000:]

        self._periodic_persist(result)
        return result

    def guard_task_submission(
        self,
        task: Mapping[str, Any],
        *,
        active_tasks: Optional[List[Mapping[str, Any]]] = None,
    ) -> TaskGuardDecision:
        """Validate tasks before they enter dispatch queues."""

        return self.task_guard.evaluate_task(task, active_tasks=active_tasks)

    def enforce_rate_limit(self, channel: str) -> RateDecision:
        """Rate-limit operations such as API, browser, and task channels."""

        return self.rate_limiter.allow(channel)

    def handle_failure(
        self,
        *,
        task_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        operation_id: Optional[str] = None,
        error: str,
        rollback_payload: Optional[Mapping[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Run recovery actions for task, agent, and operation failures."""

        actions: List[RecoveryAction] = []
        self._record_error(error)

        if task_id:
            actions.append(
                self.failure_recovery.recover_task_failure(
                    task_id=task_id,
                    error=error,
                    dispatcher=self.task_dispatcher,
                )
            )
        if agent_id:
            actions.append(
                self.failure_recovery.restart_agent(agent_id, agent_manager=self.agent_manager)
            )
        if operation_id:
            actions.append(
                self.failure_recovery.rollback_operation(
                    operation_id=operation_id,
                    rollback_payload=rollback_payload or {},
                    action_system=self.action_system,
                )
            )

        return {
            "error": error,
            "actions": [
                {
                    "action_type": item.action_type,
                    "target_id": item.target_id,
                    "success": item.success,
                    "details": dict(item.details),
                }
                for item in actions
            ],
        }

    def diagnostics(self) -> Dict[str, Any]:
        """Return a complete stability diagnostics report."""

        latest = self._cycle_history[-1] if self._cycle_history else None
        return {
            "running": self._running,
            "history_count": len(self._cycle_history),
            "latest_cycle": latest.__dict__ if latest else None,
            "resource_monitor": self.resource_monitor.diagnostics(),
            "task_guard": self.task_guard.diagnostics(),
            "failure_recovery": self.failure_recovery.diagnostics(),
            "rate_limiter": self.rate_limiter.diagnostics(),
            "health_monitor": self.health_monitor.diagnostics(),
        }

    def _background_loop(self) -> None:
        while self._running:
            try:
                self.run_once()
            except Exception as exc:  # noqa: BLE001
                self._record_error(f"stability_loop_error:{exc}")
            time.sleep(max(0.25, self.config.monitor_interval_seconds))

    def _initialize_default_rate_policies(self) -> None:
        self.rate_limiter.register_policy(
            RatePolicy(
                key="api_calls",
                max_calls=self.config.api_rate_per_minute,
                period_seconds=60.0,
                burst_limit=max(1, int(self.config.api_rate_per_minute * 0.2)),
            )
        )
        self.rate_limiter.register_policy(
            RatePolicy(
                key="browser_actions",
                max_calls=self.config.browser_rate_per_minute,
                period_seconds=60.0,
                burst_limit=max(1, int(self.config.browser_rate_per_minute * 0.15)),
            )
        )
        self.rate_limiter.register_policy(
            RatePolicy(
                key="task_executions",
                max_calls=self.config.task_rate_per_minute,
                period_seconds=60.0,
                burst_limit=max(1, int(self.config.task_rate_per_minute * 0.2)),
            )
        )

    def _apply_throttle(self, throttle: Mapping[str, Any]) -> None:
        multiplier = float(min(throttle.get("api_multiplier", 1.0), throttle.get("task_multiplier", 1.0)))
        self.rate_limiter.apply_global_multiplier(multiplier)

    def _record_error(self, error: str) -> None:
        self._recent_errors.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "severity": "error",
                "message": error,
            }
        )
        if len(self._recent_errors) > 200:
            self._recent_errors = self._recent_errors[-200:]

    def _periodic_persist(self, cycle_result: StabilityCycleResult) -> None:
        if self.memory_system is None:
            return

        now = time.time()
        self.memory_system.remember_short_term(
            key="stability_core:last_cycle",
            value={
                "timestamp": cycle_result.timestamp,
                "resource_snapshot": dict(cycle_result.resource_snapshot),
                "health_snapshot": dict(cycle_result.health_snapshot),
                "throttle_applied": cycle_result.throttle_applied,
                "notes": list(cycle_result.notes),
            },
            tags=["stability_core", "monitoring"],
        )

        if now - self._last_persist_at < self.config.persist_interval_seconds:
            return

        self._last_persist_at = now
        self.memory_system.remember_long_term(
            key=f"stability_core:cycle:{int(now)}",
            value={
                "timestamp": cycle_result.timestamp,
                "resource_snapshot": dict(cycle_result.resource_snapshot),
                "health_snapshot": dict(cycle_result.health_snapshot),
                "throttle_applied": cycle_result.throttle_applied,
                "throttle_details": dict(cycle_result.throttle_details),
                "notes": list(cycle_result.notes),
            },
            source="stability_core.run_once",
            importance=0.8,
            tags=["stability_core", "cycle"],
        )

