"""Task guard for loop prevention, deduplication, and conflict control."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional, Set


@dataclass(slots=True)
class TaskGuardDecision:
    allowed: bool
    task_id: str
    reason: str
    conflict_with: Optional[str] = None


@dataclass(slots=True)
class GuardRules:
    max_task_retries: int = 3
    max_repeated_signature: int = 2
    deny_duplicate_task_ids: bool = True
    block_conflicting_actions: bool = True


@dataclass(slots=True)
class TaskGuard:
    """Protects scheduler and agents from unstable task behavior."""

    rules: GuardRules = field(default_factory=GuardRules)
    seen_task_ids: Set[str] = field(default_factory=set)
    active_signatures: Dict[str, str] = field(default_factory=dict)
    signature_counts: Dict[str, int] = field(default_factory=dict)
    retry_counts: Dict[str, int] = field(default_factory=dict)
    guard_events: List[Dict[str, Any]] = field(default_factory=list)

    def evaluate_task(
        self,
        task: Mapping[str, Any],
        *,
        active_tasks: Optional[List[Mapping[str, Any]]] = None,
    ) -> TaskGuardDecision:
        """Evaluate whether a task is safe to accept and execute."""

        task_id = str(task.get("task_id", task.get("id", "unknown_task")))
        signature = self._signature(task)

        if self.rules.deny_duplicate_task_ids and task_id in self.seen_task_ids:
            return self._deny(task_id, "duplicate_task_id")

        repeated = self.signature_counts.get(signature, 0)
        if repeated >= self.rules.max_repeated_signature:
            return self._deny(task_id, "possible_infinite_loop_signature")

        retries = self.retry_counts.get(task_id, 0)
        if retries > self.rules.max_task_retries:
            return self._deny(task_id, "max_retries_exceeded")

        if self.rules.block_conflicting_actions:
            conflict = self._detect_conflict(task, active_tasks or [])
            if conflict is not None:
                return self._deny(task_id, "conflicting_action", conflict_with=conflict)

        self.seen_task_ids.add(task_id)
        self.signature_counts[signature] = repeated + 1
        self.active_signatures[task_id] = signature
        self._log_event("allow", task_id, signature, "accepted")
        return TaskGuardDecision(allowed=True, task_id=task_id, reason="accepted")

    def mark_completed(self, task_id: str, *, success: bool) -> None:
        signature = self.active_signatures.pop(task_id, None)
        if signature is not None:
            # Keep counts for loop detection over a window; do not immediately decrement.
            pass
        if not success:
            self.retry_counts[task_id] = self.retry_counts.get(task_id, 0) + 1
        self._log_event("complete", task_id, signature or "", "success" if success else "failed")

    def release_signature(self, task_id: str) -> None:
        self.active_signatures.pop(task_id, None)

    def clear_task(self, task_id: str) -> None:
        self.release_signature(task_id)
        self.retry_counts.pop(task_id, None)

    def clear_history(self) -> None:
        self.seen_task_ids.clear()
        self.active_signatures.clear()
        self.signature_counts.clear()
        self.retry_counts.clear()

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "rules": {
                "max_task_retries": self.rules.max_task_retries,
                "max_repeated_signature": self.rules.max_repeated_signature,
                "deny_duplicate_task_ids": self.rules.deny_duplicate_task_ids,
                "block_conflicting_actions": self.rules.block_conflicting_actions,
            },
            "active_task_count": len(self.active_signatures),
            "seen_task_ids": len(self.seen_task_ids),
            "tracked_signatures": len(self.signature_counts),
            "retry_tracked": len(self.retry_counts),
            "recent_events": self.guard_events[-25:],
        }

    def _signature(self, task: Mapping[str, Any]) -> str:
        title = str(task.get("title", task.get("description", ""))).strip().lower()
        action = str(task.get("action", task.get("tool", ""))).strip().lower()
        target = str(task.get("target", "")).strip().lower()
        required_caps = ",".join(sorted(str(item).lower() for item in task.get("required_capabilities", [])))
        return f"{title}|{action}|{target}|{required_caps}"

    def _detect_conflict(
        self,
        task: Mapping[str, Any],
        active_tasks: List[Mapping[str, Any]],
    ) -> Optional[str]:
        target = str(task.get("target", "")).strip().lower()
        action = str(task.get("action", task.get("tool", "")).strip().lower())
        lock_key = str(task.get("lock_key", target)).strip().lower()

        if not lock_key:
            return None

        for active in active_tasks:
            active_id = str(active.get("task_id", active.get("id", "unknown_task")))
            active_target = str(active.get("target", "")).strip().lower()
            active_action = str(active.get("action", active.get("tool", "")).strip().lower())
            active_lock = str(active.get("lock_key", active_target)).strip().lower()

            if active_lock and active_lock == lock_key:
                # Allow same-type read operations in parallel.
                if {action, active_action} <= {"read", "inspect", "status", ""}:
                    continue
                return active_id

        return None

    def _deny(
        self,
        task_id: str,
        reason: str,
        *,
        conflict_with: Optional[str] = None,
    ) -> TaskGuardDecision:
        self._log_event("deny", task_id, "", reason, conflict_with=conflict_with)
        return TaskGuardDecision(
            allowed=False,
            task_id=task_id,
            reason=reason,
            conflict_with=conflict_with,
        )

    def _log_event(
        self,
        event_type: str,
        task_id: str,
        signature: str,
        reason: str,
        *,
        conflict_with: Optional[str] = None,
    ) -> None:
        self.guard_events.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "event_type": event_type,
                "task_id": task_id,
                "signature": signature,
                "reason": reason,
                "conflict_with": conflict_with,
            }
        )
