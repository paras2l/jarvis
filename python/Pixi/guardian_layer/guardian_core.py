"""Guardian Layer core coordinator.

Acts as the runtime immune system for Pixi. The Guardian observes health and
error streams, detects dangerous loops, applies automated repairs, and escalates
to rollback when recovery attempts cannot restore stability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List
import random
import uuid

from Pixi.guardian_layer.error_detector import ErrorDetector, ErrorSignal
from Pixi.guardian_layer.loop_monitor import LoopGuardDecision, LoopMonitor, LoopSignal
from Pixi.guardian_layer.repair_engine import RepairEngine, RepairPlan, RepairResult
from Pixi.guardian_layer.system_health_monitor import HealthSnapshot, SystemHealthMonitor
from Pixi.memory.memory_system import MemorySystem
from Pixi.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class GuardianIncident:
    incident_id: str
    timestamp: str
    source_module: str
    severity: str
    incident_type: str
    summary: str
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GuardianCycleResult:
    cycle_id: str
    timestamp: str
    health_snapshot: HealthSnapshot | None
    incidents: List[GuardianIncident] = field(default_factory=list)
    repairs: List[RepairResult] = field(default_factory=list)
    blocked_executions: int = 0
    status: str = "ok"


class GuardianCore:
    """Central immunity controller for runtime stability."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        cognitive_budget: Any | None = None,
        swarm_lab: Any | None = None,
        reasoning_engine: Any | None = None,
        action_system: Any | None = None,
        error_detector: ErrorDetector | None = None,
        loop_monitor: LoopMonitor | None = None,
        health_monitor: SystemHealthMonitor | None = None,
        repair_engine: RepairEngine | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus

        self.cognitive_budget = cognitive_budget
        self.swarm_lab = swarm_lab
        self.reasoning_engine = reasoning_engine
        self.action_system = action_system

        self.error_detector = error_detector or ErrorDetector(memory=memory)
        self.loop_monitor = loop_monitor or LoopMonitor(memory=memory)
        self.health_monitor = health_monitor or SystemHealthMonitor(memory=memory)
        self.repair_engine = repair_engine or RepairEngine(memory=memory, system_bus=system_bus)

        self._lock = RLock()
        self._incidents: List[GuardianIncident] = []
        self._cycle_history: List[GuardianCycleResult] = []

        self._loop_blocks_total = 0
        self._degraded_mode = False

    def run_guardian_cycle(self, *, cycle: int, context: Dict[str, Any] | None = None) -> GuardianCycleResult:
        cycle_id = f"guardian-{cycle}-{uuid.uuid4().hex[:8]}"
        now = datetime.now(timezone.utc).isoformat()

        self._sample_system_metrics(context or {})
        health = self.health_monitor.create_snapshot()

        incidents: List[GuardianIncident] = []
        repairs: List[RepairResult] = []
        blocked = 0

        error_bursts = self.error_detector.detect_error_bursts()
        for burst in error_bursts:
            incidents.append(
                self._incident(
                    source_module=burst.source_module,
                    severity=burst.severity,
                    incident_type="error_burst",
                    summary=f"Error burst detected ({burst.error_count})",
                    evidence={
                        "burst_id": burst.burst_id,
                        "dominant_category": burst.dominant_category,
                    },
                )
            )

        if health.status in {"degraded", "critical"}:
            incidents.append(
                self._incident(
                    source_module="runtime",
                    severity="critical" if health.status == "critical" else "error",
                    incident_type="health",
                    summary=f"System health {health.status}",
                    evidence={"score": health.score, "anomalies": health.anomalies},
                )
            )

        recent_loop_signals = self.loop_monitor.recent_signals(limit=15)
        for signal in recent_loop_signals:
            if signal.severity in {"error", "critical"}:
                incidents.append(
                    self._incident(
                        source_module=signal.source_module,
                        severity=signal.severity,
                        incident_type="loop",
                        summary=signal.summary,
                        evidence={"signal_id": signal.signal_id, "fingerprint": signal.fingerprint},
                    )
                )

        for incident in incidents:
            plan = self.repair_engine.build_plan(
                trigger=incident.summary,
                source_module=incident.source_module,
                severity=incident.severity,
            )
            repairs.append(self.repair_engine.execute_plan(plan))

        if health.status == "critical":
            self._degraded_mode = True
        elif health.status == "healthy" and not incidents:
            self._degraded_mode = False

        if self._degraded_mode:
            guard = self.loop_monitor.should_allow_execution(
                loop_type="reasoning",
                fingerprint_hint="global:degraded_mode",
                current_depth=1,
            )
            if not guard.allow:
                blocked += 1

        result = GuardianCycleResult(
            cycle_id=cycle_id,
            timestamp=now,
            health_snapshot=health,
            incidents=incidents,
            repairs=repairs,
            blocked_executions=blocked,
            status=self._derive_status(health, incidents, repairs),
        )

        with self._lock:
            self._cycle_history.append(result)
            self._incidents.extend(incidents)
            self._loop_blocks_total += blocked
            if len(self._cycle_history) > 600:
                self._cycle_history = self._cycle_history[-600:]
            if len(self._incidents) > 4000:
                self._incidents = self._incidents[-4000:]

        self._persist_cycle_result(result)
        self._publish_cycle_event(result)
        return result

    def report_exception(
        self,
        *,
        source_module: str,
        operation: str,
        error: Exception,
        context: Dict[str, Any] | None = None,
    ) -> ErrorSignal:
        signal = self.error_detector.record_exception(
            source_module=source_module,
            operation=operation,
            error=error,
            context=context,
        )
        self._publish_event(
            event_type="guardian.error.detected",
            payload={
                "source_module": source_module,
                "operation": operation,
                "category": signal.category,
                "severity": signal.severity,
                "signal_id": signal.signal_id,
            },
            severity="error" if signal.severity in {"error", "critical"} else "warning",
        )
        return signal

    def report_timeout(
        self,
        *,
        source_module: str,
        operation: str,
        timeout_seconds: float,
        elapsed_seconds: float,
    ) -> ErrorSignal:
        signal = self.error_detector.record_timeout(
            source_module=source_module,
            operation=operation,
            timeout_seconds=timeout_seconds,
            elapsed_seconds=elapsed_seconds,
        )
        self._publish_event(
            event_type="guardian.timeout.detected",
            payload={
                "source_module": source_module,
                "operation": operation,
                "signal_id": signal.signal_id,
                "elapsed_seconds": elapsed_seconds,
                "timeout_seconds": timeout_seconds,
            },
            severity="error",
        )
        return signal

    def report_invalid_output(
        self,
        *,
        source_module: str,
        contract_name: str,
        reason: str,
        payload: Dict[str, Any] | None = None,
    ) -> ErrorSignal:
        return self.error_detector.record_invalid_output(
            source_module=source_module,
            contract_name=contract_name,
            reason=reason,
            payload=payload,
        )

    def register_reasoning_state(
        self,
        *,
        cycle_id: str,
        objective: str,
        trace: List[str],
        depth: int,
    ) -> List[LoopSignal]:
        return self.loop_monitor.record_reasoning_state(
            cycle_id=cycle_id,
            objective=objective,
            trace=trace,
            depth=depth,
        )

    def register_agent_spawn_chain(
        self,
        *,
        run_id: str,
        parent_agent_id: str,
        child_agent_id: str,
        depth: int,
    ) -> List[LoopSignal]:
        return self.loop_monitor.record_agent_spawn_chain(
            run_id=run_id,
            parent_agent_id=parent_agent_id,
            child_agent_id=child_agent_id,
            depth=depth,
        )

    def should_allow_reasoning(
        self,
        *,
        fingerprint_hint: str,
        current_depth: int,
    ) -> LoopGuardDecision:
        return self.loop_monitor.should_allow_execution(
            loop_type="reasoning",
            fingerprint_hint=fingerprint_hint,
            current_depth=current_depth,
        )

    def should_allow_agent_spawn(
        self,
        *,
        fingerprint_hint: str,
        current_depth: int,
    ) -> LoopGuardDecision:
        decision = self.loop_monitor.should_allow_execution(
            loop_type="agent_spawn",
            fingerprint_hint=fingerprint_hint,
            current_depth=current_depth,
        )
        if not decision.allow:
            with self._lock:
                self._loop_blocks_total += 1
        return decision

    def capture_stable_state(self, *, reason: str, score: float = 0.82) -> Dict[str, Any]:
        state = self._collect_runtime_state_snapshot()
        snapshot = self.repair_engine.rollback_controller.create_snapshot(
            reason=reason,
            state=state,
            score=score,
        )
        return {
            "snapshot_id": snapshot.snapshot_id,
            "timestamp": snapshot.timestamp,
            "reason": snapshot.reason,
            "score": snapshot.score,
            "keys": list(snapshot.state.keys()),
        }

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            recent = self._cycle_history[-1] if self._cycle_history else None
            return {
                "cycles_total": len(self._cycle_history),
                "incidents_total": len(self._incidents),
                "loop_blocks_total": self._loop_blocks_total,
                "degraded_mode": self._degraded_mode,
                "recent_cycle": None
                if recent is None
                else {
                    "cycle_id": recent.cycle_id,
                    "status": recent.status,
                    "incidents": len(recent.incidents),
                    "repairs": len(recent.repairs),
                    "health_status": None if recent.health_snapshot is None else recent.health_snapshot.status,
                    "health_score": None if recent.health_snapshot is None else recent.health_snapshot.score,
                },
                "error_detector": self.error_detector.summarize(),
                "loop_monitor": self.loop_monitor.diagnostics(),
                "health_monitor": self.health_monitor.diagnostics(),
                "repair_engine": self.repair_engine.diagnostics(),
            }

    def _sample_system_metrics(self, context: Dict[str, Any]) -> None:
        budget_diag = self._safe_diag(self.cognitive_budget)
        swarm_diag = self._safe_diag(self.swarm_lab)

        active_allocations = float(budget_diag.get("active_allocations", 0))
        exceeded_allocations = float(budget_diag.get("exceeded_allocations", 0))
        agent_count = float(swarm_diag.get("active_depth", 0) + swarm_diag.get("runs_total", 0) % 8)

        cpu_pct = min(98.0, 34.0 + (active_allocations * 7.0) + random.uniform(0.0, 12.0))
        memory_pct = min(98.0, 40.0 + (exceeded_allocations * 8.0) + random.uniform(0.0, 10.0))
        api_rate = min(250.0, float(budget_diag.get("total_api_allocated", 0)) / 6.0)
        compute_pressure = min(
            1.0,
            float(budget_diag.get("total_compute_allocated", 0)) / 2500.0,
        )

        if context.get("force_health_pressure"):
            cpu_pct = max(cpu_pct, 93.0)
            memory_pct = max(memory_pct, 94.0)
            compute_pressure = max(compute_pressure, 0.96)

        self.health_monitor.record_metrics(
            source="guardian_core",
            cpu_pct=cpu_pct,
            memory_pct=memory_pct,
            agent_count=int(agent_count),
            api_rate_per_min=api_rate,
            compute_budget_pressure=compute_pressure,
        )

    def _safe_diag(self, component: Any) -> Dict[str, Any]:
        if component is None or not hasattr(component, "diagnostics"):
            return {}
        try:
            result = component.diagnostics()
            return result if isinstance(result, dict) else {}
        except Exception as exc:  # noqa: BLE001
            self.error_detector.record_exception(
                source_module="guardian_core",
                operation="_safe_diag",
                error=exc,
                context={"component": str(type(component))},
            )
            return {}

    def _incident(
        self,
        *,
        source_module: str,
        severity: str,
        incident_type: str,
        summary: str,
        evidence: Dict[str, Any],
    ) -> GuardianIncident:
        incident = GuardianIncident(
            incident_id=f"incident-{uuid.uuid4().hex[:10]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            source_module=source_module,
            severity=severity,
            incident_type=incident_type,
            summary=summary,
            evidence=evidence,
        )
        return incident

    def _derive_status(
        self,
        health: HealthSnapshot,
        incidents: List[GuardianIncident],
        repairs: List[RepairResult],
    ) -> str:
        if health.status == "critical":
            return "critical"
        if any(item.severity == "critical" for item in incidents):
            return "critical"
        failed_repairs = sum(1 for item in repairs if not item.success)
        if health.status == "degraded" or failed_repairs > 0:
            return "degraded"
        return "healthy"

    def _collect_runtime_state_snapshot(self) -> Dict[str, Any]:
        budget_diag = self._safe_diag(self.cognitive_budget)
        swarm_diag = self._safe_diag(self.swarm_lab)
        reasoning_diag = self._safe_diag(self.reasoning_engine)

        return {
            "budget": {
                "active_allocations": budget_diag.get("active_allocations", 0),
                "exceeded_allocations": budget_diag.get("exceeded_allocations", 0),
            },
            "swarm": {
                "runs_total": swarm_diag.get("runs_total", 0),
                "active_depth": swarm_diag.get("active_depth", 0),
            },
            "reasoning": {
                "keys": list(reasoning_diag.keys())[:20],
            },
            "degraded_mode": self._degraded_mode,
        }

    def _persist_cycle_result(self, result: GuardianCycleResult) -> None:
        self._memory.remember_short_term(
            key="guardian:last_cycle",
            value={
                "cycle_id": result.cycle_id,
                "status": result.status,
                "incidents": len(result.incidents),
                "repairs": len(result.repairs),
                "blocked_executions": result.blocked_executions,
            },
            tags=["guardian", "cycle"],
        )
        self._memory.remember_long_term(
            key=f"guardian:cycle:{result.cycle_id}",
            value={
                "timestamp": result.timestamp,
                "status": result.status,
                "incidents": [
                    {
                        "incident_id": incident.incident_id,
                        "source_module": incident.source_module,
                        "severity": incident.severity,
                        "incident_type": incident.incident_type,
                        "summary": incident.summary,
                    }
                    for incident in result.incidents
                ],
                "repair_success": [item.success for item in result.repairs],
                "health": None
                if result.health_snapshot is None
                else {
                    "status": result.health_snapshot.status,
                    "score": result.health_snapshot.score,
                    "anomalies": result.health_snapshot.anomalies,
                },
            },
            source="guardian.guardian_core",
            importance=0.92 if result.status in {"critical", "degraded"} else 0.68,
            tags=["guardian", "cycle", result.status],
        )

    def _publish_cycle_event(self, result: GuardianCycleResult) -> None:
        if not self._bus:
            return
        self._bus.publish_event(
            event_type="guardian.cycle.completed",
            source="guardian_layer",
            payload={
                "cycle_id": result.cycle_id,
                "status": result.status,
                "incidents": len(result.incidents),
                "repairs": len(result.repairs),
                "blocked_executions": result.blocked_executions,
                "health_status": None if result.health_snapshot is None else result.health_snapshot.status,
                "health_score": None if result.health_snapshot is None else result.health_snapshot.score,
            },
            topic="guardian.cycle",
            severity="error" if result.status == "critical" else "warning" if result.status == "degraded" else "info",
            tags=["guardian", "cycle"],
        )

    def _publish_event(self, *, event_type: str, payload: Dict[str, Any], severity: str) -> None:
        if not self._bus:
            return
        self._bus.publish_event(
            event_type=event_type,
            source="guardian_layer",
            payload=payload,
            topic="guardian.alert",
            severity=severity,
            tags=["guardian", "alert"],
        )

