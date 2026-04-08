"""Initiative engine core for Jarvis AI System."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional
from uuid import uuid4

from jarvis_ai_system.autonomy.initiative_engine.opportunity_detector import OpportunityDetector
from jarvis_ai_system.autonomy.initiative_engine.suggestion_engine import SuggestionEngine
from jarvis_ai_system.autonomy.initiative_engine.trigger_system import TriggerSystem


@dataclass(slots=True)
class InitiativeResult:
    initiative_id: str
    timestamp: str
    opportunities: List[Dict[str, Any]] = field(default_factory=list)
    triggers: Dict[str, Any] = field(default_factory=dict)
    suggestions: List[Dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class InitiativeCore:
    detector: OpportunityDetector = field(default_factory=OpportunityDetector)
    trigger_system: TriggerSystem = field(default_factory=TriggerSystem)
    suggestion_engine: SuggestionEngine = field(default_factory=SuggestionEngine)
    last_result: Optional[InitiativeResult] = None

    def run(self, context: Mapping[str, Any]) -> InitiativeResult:
        opportunities = self.detector.detect(context)
        triggers = self.trigger_system.evaluate(context)
        suggestions = self.suggestion_engine.generate(opportunities, triggers)
        result = InitiativeResult(
            initiative_id=f"initiative-{uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            opportunities=opportunities,
            triggers=dict(triggers),
            suggestions=suggestions,
        )
        self.last_result = result
        return result
