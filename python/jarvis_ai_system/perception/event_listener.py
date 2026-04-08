"""Event listener utilities for perception."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import uuid4


@dataclass(slots=True)
class PerceptionEvent:
    event_id: str
    kind: str
    payload: Dict[str, Any]
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class EventListener:
    events: List[PerceptionEvent] = field(default_factory=list)

    def emit(self, kind: str, payload: Dict[str, Any]) -> PerceptionEvent:
        event = PerceptionEvent(event_id=str(uuid4()), kind=kind, payload=dict(payload))
        self.events.append(event)
        return event

    def poll(self, limit: int = 50) -> List[PerceptionEvent]:
        if limit <= 0:
            return list(self.events)
        return self.events[-limit:]
