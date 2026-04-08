"""Failure recovery workflows for stable multi-engine execution."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional


@dataclass(slots=True)
class RecoveryPolicy:
    max_task_retries: int = 2
    enable_agent_restart: bool = True
    enable_task_retry: bool = True
    enable_operation_rollback: bool = True


@dataclass(slots=True)
class RecoveryAction:
    action_type: str
    target_id: str
    success: bool
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class FailureRecovery:
    """Coordinates retries, agent restarts, and rollback requests."""

    policy: RecoveryPolicy = field(default_factory=RecoveryPolicy)
    retry_tracker: Dict[str, int] = field(default_factory=dict)
    recovery_history: List[RecoveryAction] = field(default_factory=list)

    def recover_task_failure(
        self,
        task_id: str,
        error: str,
        *,
        dispatcher: Any | None = None,
    ) -> RecoveryAction:
        """Try to recover a failed task with bounded retries."""

        if not self.policy.enable_task_retry:
            return self._record(
                RecoveryAction(
                    action_type="task_retry_disabled",
                    target_id=task_id,
                    success=False,
                    details={"error": error},
                )
            )

        current_retries = self.retry_tracker.get(task_id, 0)
        if current_retries >= self.policy.max_task_retries:
            return self._record(
                RecoveryAction(
                    action_type="task_retry_exhausted",
                    target_id=task_id,
                    success=False,
                    details={"error": error, "retries": current_retries},
                )
            )

        self.retry_tracker[task_id] = current_retries + 1

        retried = False
        if dispatcher is not None and hasattr(dispatcher, "execute_assigned_task"):
            try:
                result = dispatcher.execute_assigned_task(task_id)
                retried = bool(result and getattr(result, "success", False))
            except Exception as exc:  # noqa: BLE001
                return self._record(
                    RecoveryAction(
                        action_type="task_retry_exception",
                        target_id=task_id,
                        success=False,
                        details={"error": str(exc), "original_error": error},
                    )
                )

        return self._record(
            RecoveryAction(
                action_type="task_retry",
                target_id=task_id,
                success=retried,
                details={"attempt": self.retry_tracker[task_id], "original_error": error},
            )
        )

    def restart_agent(self, agent_id: str, *, agent_manager: Any | None = None) -> RecoveryAction:
        """Restart or soft-revive an unstable agent."""

        if not self.policy.enable_agent_restart:
            return self._record(
                RecoveryAction(
                    action_type="agent_restart_disabled",
                    target_id=agent_id,
                    success=False,
                )
            )

        if agent_manager is None:
            return self._record(
                RecoveryAction(
                    action_type="agent_restart_skipped",
                    target_id=agent_id,
                    success=False,
                    details={"reason": "no_agent_manager"},
                )
            )

        registry = getattr(agent_manager, "registry", None)
        agent = registry.get_agent(agent_id) if registry and hasattr(registry, "get_agent") else None
        if agent is None:
            return self._record(
                RecoveryAction(
                    action_type="agent_restart_missing",
                    target_id=agent_id,
                    success=False,
                )
            )

        try:
            if hasattr(agent, "task_queue"):
                agent.task_queue.clear()
            if hasattr(agent, "active_task_id"):
                agent.active_task_id = None
            if hasattr(agent, "status"):
                from jarvis.agent_system.agent_core import AgentStatus

                agent.status = AgentStatus.IDLE
            if hasattr(agent, "touch_heartbeat"):
                agent.touch_heartbeat()

            return self._record(
                RecoveryAction(
                    action_type="agent_restart",
                    target_id=agent_id,
                    success=True,
                )
            )
        except Exception as exc:  # noqa: BLE001
            return self._record(
                RecoveryAction(
                    action_type="agent_restart_exception",
                    target_id=agent_id,
                    success=False,
                    details={"error": str(exc)},
                )
            )

    def rollback_operation(
        self,
        operation_id: str,
        rollback_payload: Mapping[str, Any],
        *,
        action_system: Any | None = None,
    ) -> RecoveryAction:
        """Request rollback from action system when available."""

        if not self.policy.enable_operation_rollback:
            return self._record(
                RecoveryAction(
                    action_type="rollback_disabled",
                    target_id=operation_id,
                    success=False,
                )
            )

        if action_system is None:
            return self._record(
                RecoveryAction(
                    action_type="rollback_skipped",
                    target_id=operation_id,
                    success=False,
                    details={"reason": "no_action_system"},
                )
            )

        try:
            success = False
            if hasattr(action_system, "rollback"):
                success = bool(action_system.rollback(dict(rollback_payload)))
            elif hasattr(action_system, "rollback_operation"):
                success = bool(action_system.rollback_operation(dict(rollback_payload)))

            return self._record(
                RecoveryAction(
                    action_type="rollback_operation",
                    target_id=operation_id,
                    success=success,
                    details={"payload": dict(rollback_payload)},
                )
            )
        except Exception as exc:  # noqa: BLE001
            return self._record(
                RecoveryAction(
                    action_type="rollback_exception",
                    target_id=operation_id,
                    success=False,
                    details={"error": str(exc)},
                )
            )

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "policy": {
                "max_task_retries": self.policy.max_task_retries,
                "enable_agent_restart": self.policy.enable_agent_restart,
                "enable_task_retry": self.policy.enable_task_retry,
                "enable_operation_rollback": self.policy.enable_operation_rollback,
            },
            "retry_tracker": dict(self.retry_tracker),
            "recent_actions": [
                {
                    "action_type": item.action_type,
                    "target_id": item.target_id,
                    "success": item.success,
                    "details": dict(item.details),
                    "timestamp": item.timestamp,
                }
                for item in self.recovery_history[-25:]
            ],
        }

    def _record(self, action: RecoveryAction) -> RecoveryAction:
        self.recovery_history.append(action)
        return action
