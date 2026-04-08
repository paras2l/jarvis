"""API and transport contracts for REST, WebSocket, and internal messaging."""

from __future__ import annotations

from typing import Any, Dict, List, Mapping

ALLOWED_TRANSPORT = {"rest", "websocket", "internal"}
ALLOWED_DIRECTION = {"request", "response", "event"}

BASE_REQUIRED_FIELDS = {
    "transport",
    "direction",
    "message_type",
    "timestamp",
    "payload",
}


def validate_transport_message_contract(payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
    """Validate a generic transport message envelope."""
    reasons: List[str] = []

    if not isinstance(payload, Mapping):
        return False, ["transport payload must be a mapping"]

    missing = [name for name in BASE_REQUIRED_FIELDS if name not in payload]
    if missing:
        reasons.append(f"missing required fields: {', '.join(sorted(missing))}")

    transport = str(payload.get("transport", "")).strip().lower()
    direction = str(payload.get("direction", "")).strip().lower()

    if transport and transport not in ALLOWED_TRANSPORT:
        reasons.append(f"invalid transport='{transport}'")

    if direction and direction not in ALLOWED_DIRECTION:
        reasons.append(f"invalid direction='{direction}'")

    if "payload" in payload and not isinstance(payload.get("payload"), Mapping):
        reasons.append("payload must be a mapping")

    if transport == "rest":
        if direction == "request":
            if not str(payload.get("method", "")).strip():
                reasons.append("REST request requires method")
            if not str(payload.get("path", "")).strip():
                reasons.append("REST request requires path")
        if direction == "response":
            if not isinstance(payload.get("status_code"), int):
                reasons.append("REST response requires integer status_code")
            if not isinstance(payload.get("success"), bool):
                reasons.append("REST response requires boolean success")

    if transport == "websocket":
        channel = str(payload.get("channel", "")).strip()
        if not channel:
            reasons.append("WebSocket message requires channel")

    if transport == "internal":
        topic = str(payload.get("topic", "")).strip()
        if not topic:
            reasons.append("Internal message requires topic")
        source = str(payload.get("source", "")).strip()
        if not source:
            reasons.append("Internal message requires source")

    return (not reasons, reasons)


def ensure_transport_message_contract(payload: Mapping[str, Any]) -> Dict[str, Any]:
    """Return normalized transport payload or raise ValueError."""
    valid, reasons = validate_transport_message_contract(payload)
    if not valid:
        raise ValueError("API/transport contract validation failed: " + "; ".join(reasons))
    return dict(payload)
