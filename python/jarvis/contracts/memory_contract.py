"""Memory contract for structured knowledge entries."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

ALLOWED_MEMORY_TYPES = {"short_term", "long_term", "semantic", "episodic"}

REQUIRED_FIELDS = {
    "entry_id",
    "key",
    "value",
    "memory_type",
    "source",
    "timestamp",
    "tags",
}


def validate_memory_entry_contract(payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
    """Validate memory entry payload schema."""
    reasons: List[str] = []

    if not isinstance(payload, Mapping):
        return False, ["memory payload must be a mapping"]

    missing = [name for name in REQUIRED_FIELDS if name not in payload]
    if missing:
        reasons.append(f"missing required fields: {', '.join(sorted(missing))}")

    memory_type = str(payload.get("memory_type", "")).strip().lower()
    if memory_type and memory_type not in ALLOWED_MEMORY_TYPES:
        reasons.append(f"invalid memory_type='{memory_type}'")

    if "tags" in payload and not isinstance(payload.get("tags"), list):
        reasons.append("tags must be a list")

    if "importance" in payload:
        importance = payload.get("importance")
        if not isinstance(importance, (int, float)):
            reasons.append("importance must be numeric when provided")
        elif importance < 0.0 or importance > 1.0:
            reasons.append("importance must be in [0.0, 1.0]")

    return (not reasons, reasons)


def ensure_memory_entry_contract(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return normalized memory payload or raise ValueError."""
    valid, reasons = validate_memory_entry_contract(payload)
    if not valid:
        raise ValueError("Memory contract validation failed: " + "; ".join(reasons))
    return dict(payload)
