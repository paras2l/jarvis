"""Rollback controller for Jarvis Guardian Layer.

Restores a known stable snapshot of runtime state when repair actions fail.
Rollback is intentionally conservative and records all changes for auditability.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List
import copy
import uuid

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class StabilitySnapshot:
    snapshot_id: str
    timestamp: str
    state: Dict[str, Any]
    reason: str
    score: float


@dataclass(slots=True)
class RollbackAttempt:
    attempt_id: str
    timestamp: str
    snapshot_id: str
    trigger_reason: str
    success: bool
    restored_keys: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


class RollbackController:
    """Manages stable-state snapshots and rollback operations."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        max_snapshots: int = 80,
        max_attempts: int = 300,
    ) -> None:
        self._memory = memory
        self._lock = RLock()
        self._max_snapshots = max(10, max_snapshots)
        self._max_attempts = max(50, max_attempts)

        self._snapshots: List[StabilitySnapshot] = []
        self._attempts: List[RollbackAttempt] = []

    def create_snapshot(
        self,
        *,
        reason: str,
        state: Dict[str, Any],
        score: float,
    ) -> StabilitySnapshot:
        snapshot = StabilitySnapshot(
            snapshot_id=f"stable-{uuid.uuid4().hex[:10]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            state=copy.deepcopy(state),
            reason=reason,
            score=max(0.0, min(1.0, score)),
        )

        with self._lock:
            self._snapshots.append(snapshot)
            self._snapshots = sorted(self._snapshots, key=lambda item: item.timestamp)
            if len(self._snapshots) > self._max_snapshots:
                self._snapshots = self._snapshots[-self._max_snapshots:]

        self._persist_snapshot(snapshot)
        return snapshot

    def rollback_to_last_stable(
        self,
        *,
        trigger_reason: str,
        min_score: float = 0.72,
    ) -> RollbackAttempt:
        with self._lock:
            candidates = [item for item in self._snapshots if item.score >= min_score]
            target = candidates[-1] if candidates else (self._snapshots[-1] if self._snapshots else None)

        if target is None:
            attempt = RollbackAttempt(
                attempt_id=f"rollback-{uuid.uuid4().hex[:10]}",
                timestamp=datetime.now(timezone.utc).isoformat(),
                snapshot_id="none",
                trigger_reason=trigger_reason,
                success=False,
                restored_keys=[],
                notes=["no_snapshot_available"],
            )
            self._record_attempt(attempt)
            return attempt

        restored_keys = []
        notes: List[str] = []
        success = True

        for key, value in target.state.items():
            try:
                self._memory.remember_short_term(
                    key=f"guardian:rollback:restored:{key}",
                    value={"value": value, "snapshot_id": target.snapshot_id},
                    tags=["guardian", "rollback"],
                )
                restored_keys.append(key)
            except Exception as exc:  # noqa: BLE001
                success = False
                notes.append(f"restore_failed:{key}:{type(exc).__name__}")

        attempt = RollbackAttempt(
            attempt_id=f"rollback-{uuid.uuid4().hex[:10]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            snapshot_id=target.snapshot_id,
            trigger_reason=trigger_reason,
            success=success,
            restored_keys=restored_keys,
            notes=notes,
        )
        self._record_attempt(attempt)
        return attempt

    def latest_snapshot(self) -> StabilitySnapshot | None:
        with self._lock:
            if not self._snapshots:
                return None
            return self._snapshots[-1]

    def diagnostics(self) -> Dict[str, Any]:
        with self._lock:
            latest = self._snapshots[-1] if self._snapshots else None
            success = sum(1 for item in self._attempts if item.success)
            failed = len(self._attempts) - success
            return {
                "snapshots_total": len(self._snapshots),
                "attempts_total": len(self._attempts),
                "attempts_success": success,
                "attempts_failed": failed,
                "latest_snapshot": None
                if latest is None
                else {
                    "snapshot_id": latest.snapshot_id,
                    "timestamp": latest.timestamp,
                    "reason": latest.reason,
                    "score": latest.score,
                    "keys": list(latest.state.keys())[:20],
                },
            }

    def _record_attempt(self, attempt: RollbackAttempt) -> None:
        with self._lock:
            self._attempts.append(attempt)
            if len(self._attempts) > self._max_attempts:
                self._attempts = self._attempts[-self._max_attempts:]

        self._memory.remember_short_term(
            key="guardian:rollback:last_attempt",
            value={
                "attempt_id": attempt.attempt_id,
                "snapshot_id": attempt.snapshot_id,
                "success": attempt.success,
                "trigger_reason": attempt.trigger_reason,
                "restored_keys": attempt.restored_keys,
                "notes": attempt.notes,
            },
            tags=["guardian", "rollback"],
        )
        self._memory.remember_long_term(
            key=f"guardian:rollback:{attempt.attempt_id}",
            value={
                "timestamp": attempt.timestamp,
                "snapshot_id": attempt.snapshot_id,
                "trigger_reason": attempt.trigger_reason,
                "success": attempt.success,
                "restored_keys": attempt.restored_keys,
                "notes": attempt.notes,
            },
            source="guardian.rollback_controller",
            importance=0.92 if not attempt.success else 0.74,
            tags=["guardian", "rollback"],
        )

    def _persist_snapshot(self, snapshot: StabilitySnapshot) -> None:
        self._memory.remember_long_term(
            key=f"guardian:stable_snapshot:{snapshot.snapshot_id}",
            value={
                "timestamp": snapshot.timestamp,
                "reason": snapshot.reason,
                "score": snapshot.score,
                "state_keys": list(snapshot.state.keys()),
            },
            source="guardian.rollback_controller",
            importance=0.7,
            tags=["guardian", "snapshot"],
        )
