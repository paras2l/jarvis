"""Suggestion generation for initiative engine."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping


@dataclass(slots=True)
class SuggestionEngine:
    def generate(self, opportunities: List[Dict[str, Any]], triggers: Mapping[str, Any]) -> List[Dict[str, Any]]:
        suggestions: List[Dict[str, Any]] = []
        for item in opportunities:
            suggestions.append({
                "action": f"pursue_{item['type']}",
                "priority": item.get("priority", 0.5),
                "enabled": bool(triggers.get("should_act", False)),
            })
        return suggestions
