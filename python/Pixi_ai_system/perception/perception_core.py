"""Perception core for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from Pixi.core.contracts import ContextSnapshot


@dataclass(slots=True)
class PerceptionRecord:
    perception_id: str
    timestamp: str
    current_application: str
    user_activity: str
    time_of_day: str
    signals: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PerceptionCore:
    """Collects environment signals and produces a context snapshot."""

    last_record: Optional[PerceptionRecord] = None

    def observe(
        self,
        *,
        current_application: str,
        user_activity: str,
        time_of_day: str,
        signals: Optional[Dict[str, Any]] = None,
    ) -> ContextSnapshot:
        payload = dict(signals or {})
        payload.setdefault("observed_at", datetime.now(timezone.utc).isoformat())
        payload.setdefault("perception_id", str(uuid4()))
        record = PerceptionRecord(
            perception_id=payload["perception_id"],
            timestamp=payload["observed_at"],
            current_application=current_application,
            user_activity=user_activity,
            time_of_day=time_of_day,
            signals=payload,
        )
        self.last_record = record
        return ContextSnapshot(
            current_application=current_application,
            user_activity=user_activity,
            time_of_day=time_of_day,
            signals=payload,
        )

    def summarize(self) -> Dict[str, Any]:
        if self.last_record is None:
            return {"available": False}
        return {
            "available": True,
            "perception_id": self.last_record.perception_id,
            "timestamp": self.last_record.timestamp,
            "current_application": self.last_record.current_application,
            "user_activity": self.last_record.user_activity,
            "time_of_day": self.last_record.time_of_day,
            "signals": dict(self.last_record.signals),
        }

