"""Skill builder wrapper for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from Pixi.self_improvement.tool_builder import ToolBuilder


@dataclass(slots=True)
class SkillBuilder:
    tool_builder: Optional[ToolBuilder] = None

    def build(self, gap: Any) -> Dict[str, Any]:
        if self.tool_builder is None:
            return {"available": False, "reason": "no_tool_builder"}
        return self.tool_builder.build_from_gaps([gap])

