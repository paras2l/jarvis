"""Trigger evaluation for initiative engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Mapping


@dataclass(slots=True)
class TriggerSystem:
    def evaluate(self, signals: Mapping[str, Any]) -> Dict[str, Any]:
        urgent = bool(signals.get("deadline_detected") or signals.get("emergency_mode"))
        return {"should_act": urgent or bool(signals.get("high_attention")), "urgent": urgent}
