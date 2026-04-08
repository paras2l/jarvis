"""Learning engine wrapper for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from jarvis.self_improvement.improvement_manager import ImprovementManager


@dataclass(slots=True)
class LearningEngine:
    improvement_manager: Optional[ImprovementManager] = None

    def learn(self, context: Any, *, force: bool = False) -> Dict[str, Any]:
        if self.improvement_manager is None:
            return {"available": False, "reason": "no_improvement_manager"}
        result = self.improvement_manager.run_cycle(context=context, force=force)
        return self.improvement_manager.summarize_cycle(result)
