"""System optimizer wrapper for Pixi AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from Pixi.self_improvement.improvement_manager import ImprovementManager


@dataclass(slots=True)
class SystemOptimizer:
    improvement_manager: Optional[ImprovementManager] = None

    def optimize(self, context: Any) -> Dict[str, Any]:
        if self.improvement_manager is None:
            return {"available": False, "reason": "no_improvement_manager"}
        result = self.improvement_manager.run_cycle(context=context, force=False)
        return self.improvement_manager.summarize_cycle(result)

