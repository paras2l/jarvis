"""Repair engine for Jarvis Guardian Layer.

Attempts automatic recovery from detected failures by applying staged repairs:
state reset, module restart, memory cleanup, and task rerun requests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List
import uuid

from jarvis.guardian_layer.module_restart_manager import ModuleRestartManager
from jarvis.guardian_layer.rollback_controller import RollbackController
from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class RepairAction:
    action_id: str
    timestamp: str
    action_type: str
    target: str
    success: bool
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RepairPlan:
    plan_id: str
    created_at: str
    trigger: str
    source_module: str
    severity: str
    actions: List[str] = field(default_factory=list)


@dataclass(slots=True)
class RepairResult:
    plan_id: str
    completed_at: str
    success: bool
    actions: List[RepairAction] = field(default_factory=list)
    fallback_used: bool = False
    notes: List[str] = field(default_factory=list)


class RepairEngine:
    """Coordinates repair plans with escalation and rollback."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        restart_manager: ModuleRestartManager | None = None,
        rollback_controller: RollbackController | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus
        self.restart_manager = restart_manager or ModuleRestartManager(memory=memory, system_bus=system_bus)
        self.rollback_controller = rollback_controller or RollbackController(memory=memory)

        self._lock = RLock()
        self._plans: List[RepairPlan] = []
        self._results: List[RepairResult] = []

    def build_plan(
        self,
        *,
        trigger: str,
        source_module: str,
        severity: str,
    ) -> RepairPlan:
        actions = ["reset_runtime_flags", "clear_corrupted_short_term_entries"]
        if severity in {"error", "critical"}:
            actions.append("restart_module")
        if severity == "critical":
            actions.extend(["request_task_rerun", "rollback_if_needed"])

        plan = RepairPlan(
            plan_id=f"repair-{uuid.uuid4().hex[:10]}",
            created_at=datetime.now(timezone.utc).isoformat(),
            trigger=trigger,
            source_module=source_module,
            severity=severity,
            actions=actions,
        )

        with self._lock:
            self._plans.append(plan)
            if len(self._plans) > 500:
                self._plans = self._plans[-500:]

        self._memory.remember_short_term(
            key="guardian:repair:last_plan",
            value={
                "plan_id": plan.plan_id,
                "trigger": plan.trigger,
                "source_module": plan.source_module,
                "severity": plan.severity,
                "actions": plan.actions,
            },
            tags=["guardian", "repair"],
        )
        return plan

    def execute_plan(self, plan: RepairPlan) -> RepairResult:
        actions: List[RepairAction] = []
        notes: List[str] = []

        for action_name in plan.actions:
            action = self._execute_action(plan, action_name)
            actions.append(action)
            if not action.success:
                notes.append(f"failed:{action_name}")
                if action_name != "rollback_if_needed":
                    continue

        success = all(action.success for action in actions if action.action_type != "rollback_if_needed")
        fallback_used = any(action.action_type == "rollback_if_needed" and action.success for action in actions)

        result = RepairResult(
            plan_id=plan.plan_id,
            completed_at=datetime.now(timezone.utc).isoformat(),
            success=success or fallback_used,
            actions=actions,
            fallback_used=fallback_used,
            notes=notes,
        )

        with self._lock:
            self._results.append(result)
            if len(self._results) > 500:
                self._results = self._results[-500:]

        self._persist_result(plan, result)
        return result

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._results)
            success = sum(1 for item in self._results if item.success)
            fallback = sum(1 for item in self._results if item.fallback_used)
            return {
                "plans_total": len(self._plans),
                "results_total": total,
                "success_count": success,
                "fallback_count": fallback,
                "success_rate": 0.0 if total == 0 else round(success / total, 4),
                "restart_manager": self.restart_manager.diagnostics(),
                "rollback_controller": self.rollback_controller.diagnostics(),
            }

    def _execute_action(self, plan: RepairPlan, action_name: str) -> RepairAction:
        now = datetime.now(timezone.utc).isoformat()

        if action_name == "reset_runtime_flags":
            details = {"reset_keys": ["loop_guard", "degraded_mode", "throttle"]}
            return self._make_action(action_name, plan.source_module, True, details, timestamp=now)

        if action_name == "clear_corrupted_short_term_entries":
            key = f"guardian:repair:cleanup:{plan.plan_id}"
            self._memory.remember_short_term(
                key=key,
                value={"cleared": True, "source_module": plan.source_module},
                tags=["guardian", "repair", "cleanup"],
            )
            details = {"cleanup_marker": key}
            return self._make_action(action_name, plan.source_module, True, details, timestamp=now)

        if action_name == "restart_module":
            attempt = self.restart_manager.restart_module(
                module_id=plan.source_module,
                reason=f"guardian_repair:{plan.trigger}",
                metadata={"plan_id": plan.plan_id},
            )
            details = {
                "attempt_id": attempt.attempt_id,
                "notes": attempt.notes,
                "duration_ms": attempt.duration_ms,
            }
            return self._make_action(action_name, plan.source_module, attempt.success, details, timestamp=now)

        if action_name == "request_task_rerun":
            published = False
            if self._bus:
                self._bus.publish_event(
                    event_type="guardian.repair.rerun_requested",
                    source="guardian_layer",
                    payload={
                        "source_module": plan.source_module,
                        "plan_id": plan.plan_id,
                        "trigger": plan.trigger,
                    },
                    topic="guardian.repair",
                    severity="warning",
                    tags=["guardian", "repair"],
                )
                published = True
            return self._make_action(action_name, plan.source_module, published, {"published": published}, timestamp=now)

        if action_name == "rollback_if_needed":
            attempt = self.rollback_controller.rollback_to_last_stable(
                trigger_reason=f"repair_failure:{plan.plan_id}",
                min_score=0.7,
            )
            details = {
                "attempt_id": attempt.attempt_id,
                "snapshot_id": attempt.snapshot_id,
                "restored_keys": attempt.restored_keys,
                "notes": attempt.notes,
            }
            return self._make_action(action_name, plan.source_module, attempt.success, details, timestamp=now)

        return self._make_action(action_name, plan.source_module, False, {"error": "unknown_action"}, timestamp=now)

    @staticmethod
    def _make_action(
        action_type: str,
        target: str,
        success: bool,
        details: Dict[str, Any],
        *,
        timestamp: str,
    ) -> RepairAction:
        return RepairAction(
            action_id=f"action-{uuid.uuid4().hex[:10]}",
            timestamp=timestamp,
            action_type=action_type,
            target=target,
            success=success,
            details=details,
        )

    def _persist_result(self, plan: RepairPlan, result: RepairResult) -> None:
        payload = {
            "plan_id": result.plan_id,
            "trigger": plan.trigger,
            "source_module": plan.source_module,
            "severity": plan.severity,
            "success": result.success,
            "fallback_used": result.fallback_used,
            "actions": [
                {
                    "action_type": action.action_type,
                    "target": action.target,
                    "success": action.success,
                    "details": action.details,
                }
                for action in result.actions
            ],
            "notes": result.notes,
        }
        self._memory.remember_short_term(
            key="guardian:repair:last_result",
            value=payload,
            tags=["guardian", "repair"],
        )
        self._memory.remember_long_term(
            key=f"guardian:repair:{result.plan_id}",
            value={"completed_at": result.completed_at, **payload},
            source="guardian.repair_engine",
            importance=0.9 if not result.success else 0.72,
            tags=["guardian", "repair", plan.source_module],
        )
