"""Agent execution result contract."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

REQUIRED_FIELDS = {
    "task_id",
    "agent_id",
    "success",
    "output_summary",
    "completed_at",
}


def validate_agent_result_contract(payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
    """Validate agent result payload schema."""
    reasons: List[str] = []

    if not isinstance(payload, Mapping):
        return False, ["agent result payload must be a mapping"]

    missing = [name for name in REQUIRED_FIELDS if name not in payload]
    if missing:
        reasons.append(f"missing required fields: {', '.join(sorted(missing))}")

    if not isinstance(payload.get("success"), bool):
        reasons.append("success must be a boolean")

    output_summary = str(payload.get("output_summary", "")).strip()
    if not output_summary:
        reasons.append("output_summary cannot be empty")

    if "execution_ms" in payload and not isinstance(payload.get("execution_ms"), (int, float)):
        reasons.append("execution_ms must be numeric when provided")

    if "artifacts" in payload and not isinstance(payload.get("artifacts"), list):
        reasons.append("artifacts must be a list when provided")

    return (not reasons, reasons)


def ensure_agent_result_contract(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return normalized payload or raise ValueError."""
    valid, reasons = validate_agent_result_contract(payload)
    if not valid:
        raise ValueError("Agent result contract validation failed: " + "; ".join(reasons))
    return dict(payload)
