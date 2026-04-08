"""Task message contract for task creation and assignment."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

ALLOWED_TASK_STATUS = {
    "pending",
    "assigned",
    "in_progress",
    "blocked",
    "completed",
    "failed",
    "cancelled",
}

BASE_REQUIRED_FIELDS = {
    "task_id",
    "title",
    "goal",
    "status",
    "priority",
    "created_at",
    "source_module",
}


def validate_task_contract(payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
    """Validate task payload contract.

    Required for task creation and assignment messages.
    """
    reasons: List[str] = []

    if not isinstance(payload, Mapping):
        return False, ["task payload must be a mapping"]

    missing = [name for name in BASE_REQUIRED_FIELDS if name not in payload]
    if missing:
        reasons.append(f"missing required fields: {', '.join(sorted(missing))}")

    status = str(payload.get("status", "")).strip().lower()
    if status and status not in ALLOWED_TASK_STATUS:
        reasons.append(f"invalid status='{status}'")

    priority = payload.get("priority")
    if not isinstance(priority, int):
        reasons.append("priority must be an integer")
    elif priority < 1 or priority > 100:
        reasons.append("priority must be between 1 and 100")

    task_id = str(payload.get("task_id", "")).strip()
    if not task_id:
        reasons.append("task_id cannot be empty")

    title = str(payload.get("title", "")).strip()
    if not title:
        reasons.append("title cannot be empty")

    source_module = str(payload.get("source_module", "")).strip()
    if not source_module:
        reasons.append("source_module cannot be empty")

    if "assigned" in status or "in_progress" in status:
        assignee = str(payload.get("assignee_agent_id", "")).strip()
        if not assignee:
            reasons.append("assignee_agent_id is required when status is assigned/in_progress")

    return (not reasons, reasons)


def ensure_task_contract(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return normalized task payload or raise ValueError."""
    valid, reasons = validate_task_contract(payload)
    if not valid:
        raise ValueError("Task contract validation failed: " + "; ".join(reasons))
    return dict(payload)
