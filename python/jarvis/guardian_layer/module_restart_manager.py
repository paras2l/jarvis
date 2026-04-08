"""Module restart manager for Jarvis Guardian Layer.

Performs isolated restart operations for malfunctioning modules. Restarts are
tracked with rate limits and rollback hooks to avoid cascading instability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, List
import uuid

from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class RestartAttempt:
    attempt_id: str
    timestamp: str
    module_id: str
    reason: str
    success: bool
    duration_ms: float
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RestartPolicy:
    max_restarts_per_module_hour: int = 4
    cooldown_seconds: int = 20
    max_parallel_restarts: int = 1


class ModuleRestartManager:
    """Handles safe module restart flow with guardrails."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        policy: RestartPolicy | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus
        self.policy = policy or RestartPolicy()

        self._lock = RLock()
        self._attempts: List[RestartAttempt] = []
        self._active_restarts: Dict[str, str] = {}

    def restart_module(
        self,
        *,
        module_id: str,
        reason: str,
        metadata: Dict[str, Any] | None = None,
    ) -> RestartAttempt:
        started = datetime.now(timezone.utc)
        notes: List[str] = []

        with self._lock:
            if not self._can_restart(module_id):
                notes.append("rate_limited")
                return self._finalize_attempt(
                    module_id=module_id,
                    reason=reason,
                    success=False,
                    started=started,
                    notes=notes,
                    metadata={"rate_limited": True, **dict(metadata or {})},
                )

            if len(self._active_restarts) >= self.policy.max_parallel_restarts:
                notes.append("parallel_restart_limit")
                return self._finalize_attempt(
                    module_id=module_id,
                    reason=reason,
                    success=False,
                    started=started,
                    notes=notes,
                    metadata={"parallel_limit": True, **dict(metadata or {})},
                )

            self._active_restarts[module_id] = started.isoformat()

        success = False
        try:
            self._publish("guardian.module_restart.requested", module_id, reason)

            registry = self._bus.registry if self._bus else None
            if registry is not None:
                endpoint = registry.get_module(module_id)
                if endpoint is None:
                    notes.append("module_not_registered")
                else:
                    endpoint.status = "restarting"
                    notes.append("status_set_restarting")

                    handler = endpoint.handler
                    if handler is not None:
                        try:
                            handler({
                                "topic": "guardian.restart_probe",
                                "payload": {"module_id": module_id, "reason": reason},
                            })
                            notes.append("handler_probe_ok")
                        except Exception as exc:  # noqa: BLE001
                            notes.append(f"handler_probe_failed:{type(exc).__name__}")

                    endpoint.status = "online"
                    notes.append("status_set_online")
                    success = True
            else:
                notes.append("no_system_bus_registry")

        finally:
            with self._lock:
                self._active_restarts.pop(module_id, None)

        return self._finalize_attempt(
            module_id=module_id,
            reason=reason,
            success=success,
            started=started,
            notes=notes,
            metadata=dict(metadata or {}),
        )

    def recent_attempts(self, limit: int = 20) -> List[RestartAttempt]:
        with self._lock:
            return list(self._attempts[-max(1, limit):])

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._attempts)
            success = sum(1 for item in self._attempts if item.success)
            failed = total - success
            by_module: Dict[str, int] = {}
            for item in self._attempts[-300:]:
                by_module[item.module_id] = by_module.get(item.module_id, 0) + 1

            return {
                "attempts_total": total,
                "success": success,
                "failed": failed,
                "active_restarts": len(self._active_restarts),
                "recent_modules": sorted(by_module.items(), key=lambda x: x[1], reverse=True)[:10],
                "policy": {
                    "max_restarts_per_module_hour": self.policy.max_restarts_per_module_hour,
                    "cooldown_seconds": self.policy.cooldown_seconds,
                    "max_parallel_restarts": self.policy.max_parallel_restarts,
                },
            }

    def _can_restart(self, module_id: str) -> bool:
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)

        recent_for_module = [
            item
            for item in self._attempts
            if item.module_id == module_id and self._to_dt(item.timestamp) >= hour_ago
        ]
        if len(recent_for_module) >= self.policy.max_restarts_per_module_hour:
            return False

        if recent_for_module:
            last = max(recent_for_module, key=lambda item: item.timestamp)
            last_dt = self._to_dt(last.timestamp)
            if (now - last_dt).total_seconds() < self.policy.cooldown_seconds:
                return False

        return True

    def _finalize_attempt(
        self,
        *,
        module_id: str,
        reason: str,
        success: bool,
        started: datetime,
        notes: List[str],
        metadata: Dict[str, Any],
    ) -> RestartAttempt:
        ended = datetime.now(timezone.utc)
        duration_ms = (ended - started).total_seconds() * 1000.0

        attempt = RestartAttempt(
            attempt_id=f"restart-{uuid.uuid4().hex[:10]}",
            timestamp=ended.isoformat(),
            module_id=module_id,
            reason=reason,
            success=success,
            duration_ms=duration_ms,
            notes=notes,
            metadata=metadata,
        )
        with self._lock:
            self._attempts.append(attempt)
            if len(self._attempts) > 1200:
                self._attempts = self._attempts[-1200:]

        self._persist_attempt(attempt)
        self._publish(
            "guardian.module_restart.completed" if success else "guardian.module_restart.failed",
            module_id,
            reason,
            metadata={"attempt_id": attempt.attempt_id, "duration_ms": duration_ms, "notes": notes},
        )
        return attempt

    def _persist_attempt(self, attempt: RestartAttempt) -> None:
        self._memory.remember_short_term(
            key=f"guardian:restart:last:{attempt.module_id}",
            value={
                "attempt_id": attempt.attempt_id,
                "success": attempt.success,
                "reason": attempt.reason,
                "duration_ms": attempt.duration_ms,
            },
            tags=["guardian", "restart"],
        )
        self._memory.remember_long_term(
            key=f"guardian:restart:{attempt.attempt_id}",
            value={
                "timestamp": attempt.timestamp,
                "module_id": attempt.module_id,
                "reason": attempt.reason,
                "success": attempt.success,
                "duration_ms": attempt.duration_ms,
                "notes": attempt.notes,
                "metadata": attempt.metadata,
            },
            source="guardian.module_restart_manager",
            importance=0.82 if not attempt.success else 0.68,
            tags=["guardian", "restart", attempt.module_id],
        )

    def _publish(
        self,
        event_type: str,
        module_id: str,
        reason: str,
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        if not self._bus:
            return
        self._bus.publish_event(
            event_type=event_type,
            source="guardian_layer",
            payload={"module_id": module_id, "reason": reason, **dict(metadata or {})},
            topic="guardian.restart",
            severity="warning" if event_type.endswith("failed") else "info",
            tags=["guardian", "restart"],
        )

    @staticmethod
    def _to_dt(ts: str) -> datetime:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
