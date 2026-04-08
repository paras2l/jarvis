"""Opportunity detection for initiative engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping


@dataclass(slots=True)
class OpportunityDetector:
    def detect(self, context: Mapping[str, Any]) -> List[Dict[str, Any]]:
        opportunities: List[Dict[str, Any]] = []
        if context.get("user_activity") in {"analysis", "research"}:
            opportunities.append({"type": "research", "priority": 0.7})
        if context.get("system_health") == "healthy":
            opportunities.append({"type": "proactive_action", "priority": 0.6})
        return opportunities
