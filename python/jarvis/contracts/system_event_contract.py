"""System event contract for System Bus and monitoring layers."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

ALLOWED_SEVERITY = {"debug", "info", "warning", "error", "critical"}

REQUIRED_FIELDS = {
    "event_id",
    "event_type",
    "source",
    "topic",
    "severity",
    "timestamp",
    "payload",
}


def validate_system_event_contract(payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
    """Validate system event schema."""
    reasons: List[str] = []

    if not isinstance(payload, Mapping):
        return False, ["system event payload must be a mapping"]

    missing = [name for name in REQUIRED_FIELDS if name not in payload]
    if missing:
        reasons.append(f"missing required fields: {', '.join(sorted(missing))}")

    severity = str(payload.get("severity", "")).strip().lower()
    if severity and severity not in ALLOWED_SEVERITY:
        reasons.append(f"invalid severity='{severity}'")

    if "payload" in payload and not isinstance(payload.get("payload"), Mapping):
        reasons.append("payload must be a mapping")

    event_type = str(payload.get("event_type", "")).strip()
    if not event_type:
        reasons.append("event_type cannot be empty")

    source = str(payload.get("source", "")).strip()
    if not source:
        reasons.append("source cannot be empty")

    return (not reasons, reasons)


def ensure_system_event_contract(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return normalized event payload or raise ValueError."""
    valid, reasons = validate_system_event_contract(payload)
    if not valid:
        raise ValueError("System event contract validation failed: " + "; ".join(reasons))
    return dict(payload)
