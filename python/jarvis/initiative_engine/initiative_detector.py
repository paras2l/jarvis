"""Initiative detector for proactive Jarvis behavior.

Monitors context updates and decides when proactive assistance is useful.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Event
import time
from typing import Any, Dict, List

from jarvis.core.context.context_engine import ContextEngine
from jarvis.core.contracts import ContextSnapshot
from jarvis.initiative_engine.behavior_model import BehaviorModel
from jarvis.initiative_engine.prediction_engine import InitiativePrediction, PredictionEngine
from jarvis.initiative_engine.suggestion_generator import InitiativeSuggestion, SuggestionGenerator
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class InitiativeDecision:
    should_trigger: bool
    reason: str
    confidence: float


class InitiativeDetector:
    """Coordinates proactive detection using context + behavior + memory."""

    def __init__(
        self,
        context_engine: ContextEngine,
        memory: MemorySystem,
        behavior_model: BehaviorModel,
        prediction_engine: PredictionEngine,
        suggestion_generator: SuggestionGenerator,
        *,
        trigger_threshold: float = 0.65,
        cooldown_seconds: float = 20.0,
    ) -> None:
        self._context_engine = context_engine
        self._memory = memory
        self._behavior_model = behavior_model
        self._prediction_engine = prediction_engine
        self._suggestion_generator = suggestion_generator
        self._trigger_threshold = trigger_threshold
        self._cooldown_seconds = max(1.0, cooldown_seconds)
        self._last_trigger_ts = 0.0
        self._stop_event = Event()

    def evaluate_once(self, auto_execution_enabled: bool = False) -> Dict[str, Any]:
        context = self._context_engine.collect()
        self._behavior_model.ingest_context(context)
        profile = self._behavior_model.rebuild_profile()

        decision = self._should_trigger(context, profile.confidence)
        if not decision.should_trigger:
            return {
                "triggered": False,
                "decision": decision,
                "context": context,
                "predictions": [],
                "suggestions": [],
            }

        predictions = self._prediction_engine.predict(context)
        filtered = [item for item in predictions if item.confidence >= self._trigger_threshold]
        suggestions = self._suggestion_generator.generate(
            context,
            filtered,
            auto_execution_enabled=auto_execution_enabled,
        )

        self._last_trigger_ts = time.time()
        self._persist_detection(context, filtered, suggestions, decision)

        return {
            "triggered": True,
            "decision": decision,
            "context": context,
            "predictions": filtered,
            "suggestions": suggestions,
        }

    def monitor_loop(
        self,
        *,
        interval_seconds: float = 4.0,
        auto_execution_enabled: bool = False,
        max_cycles: int | None = None,
    ) -> List[Dict[str, Any]]:
        """Continuous detector loop for runtime integration."""
        out: List[Dict[str, Any]] = []
        cycles = 0

        while not self._stop_event.is_set():
            result = self.evaluate_once(auto_execution_enabled=auto_execution_enabled)
            out.append(result)
            cycles += 1

            if max_cycles is not None and cycles >= max_cycles:
                break
            time.sleep(max(0.5, interval_seconds))

        return out

    def stop(self) -> None:
        self._stop_event.set()

    def register_user_command(self, command: str, metadata: Dict[str, Any] | None = None) -> None:
        self._behavior_model.ingest_command(command, metadata=metadata)

    def register_feedback(self, label: str, score: float, note: str = "") -> None:
        self._behavior_model.ingest_feedback(label=label, score=score, note=note)

    def _should_trigger(self, context: ContextSnapshot, behavior_confidence: float) -> InitiativeDecision:
        now = time.time()
        if (now - self._last_trigger_ts) < self._cooldown_seconds:
            return InitiativeDecision(False, "cooldown_active", 0.0)

        app = context.current_application.lower()
        activity = context.user_activity.lower()

        base = 0.3
        reason = "baseline"

        if app in {"tradingview", "mt5", "terminal"}:
            base += 0.35
            reason = "high_value_app"

        if activity in {"analysis", "research", "development"}:
            base += 0.15

        if context.time_of_day in {"morning", "evening"}:
            base += 0.05

        base += behavior_confidence * 0.25
        confidence = round(min(1.0, base), 3)

        return InitiativeDecision(
            should_trigger=confidence >= self._trigger_threshold,
            reason=reason,
            confidence=confidence,
        )

    def _persist_detection(
        self,
        context: ContextSnapshot,
        predictions: List[InitiativePrediction],
        suggestions: List[InitiativeSuggestion],
        decision: InitiativeDecision,
    ) -> None:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "decision": {
                "should_trigger": decision.should_trigger,
                "reason": decision.reason,
                "confidence": decision.confidence,
            },
            "context": {
                "app": context.current_application,
                "activity": context.user_activity,
                "time": context.time_of_day,
            },
            "predictions": [
                {
                    "intent": item.intent,
                    "confidence": item.confidence,
                }
                for item in predictions
            ],
            "suggestions": [
                {
                    "title": item.title,
                    "confidence": item.confidence,
                    "auto": item.auto_executable,
                }
                for item in suggestions
            ],
        }

        self._memory.remember_short_term(
            key="initiative:last_detection",
            value=payload,
            tags=["initiative", "detector"],
        )

        self._memory.remember_long_term(
            key=f"initiative:detection:{datetime.now(timezone.utc).timestamp()}",
            value=payload,
            source="initiative_detector",
            importance=0.65,
            tags=["initiative", "history"],
        )

        self._memory.remember_semantic(
            doc_id=f"initiative:detection:semantic:{datetime.now(timezone.utc).timestamp()}",
            text=(
                f"Initiative trigger={decision.should_trigger} reason={decision.reason} "
                f"app={context.current_application} activity={context.user_activity} "
                f"predictions={','.join(item.intent for item in predictions)}"
            ),
            metadata={"type": "initiative_detection", "confidence": decision.confidence},
        )


def _example_detector() -> None:
    memory = MemorySystem()
    context_engine = ContextEngine(interval_seconds=2.0)

    behavior = BehaviorModel(memory)
    predictor = PredictionEngine(memory, behavior)
    generator = SuggestionGenerator(memory)

    detector = InitiativeDetector(
        context_engine=context_engine,
        memory=memory,
        behavior_model=behavior,
        prediction_engine=predictor,
        suggestion_generator=generator,
        trigger_threshold=0.6,
        cooldown_seconds=5,
    )

    detector.register_user_command("fetch market news")
    detector.register_user_command("summarize top movers")

    result = detector.evaluate_once(auto_execution_enabled=True)
    print("Triggered:", result["triggered"])
    print("Suggestions:", [item.title for item in result["suggestions"]])

    detector.stop()
    context_engine.shutdown()


if __name__ == "__main__":
    _example_detector()
