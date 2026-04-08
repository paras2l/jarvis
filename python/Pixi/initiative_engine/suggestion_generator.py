"""Suggestion generator for Pixi Initiative Engine.

Transforms predictions into concrete suggestions or optional automated actions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.core.contracts import ContextSnapshot
from Pixi.initiative_engine.prediction_engine import InitiativePrediction
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class InitiativeSuggestion:
    suggestion_id: str
    title: str
    details: str
    confidence: float
    suggestion_type: str
    auto_executable: bool
    action_payload: Dict[str, Any] = field(default_factory=dict)


class SuggestionGenerator:
    """Generates user-facing and auto-executable proactive suggestions."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._counter = 0

    def generate(
        self,
        context: ContextSnapshot,
        predictions: List[InitiativePrediction],
        *,
        auto_execution_enabled: bool = False,
    ) -> List[InitiativeSuggestion]:
        suggestions: List[InitiativeSuggestion] = []

        for prediction in predictions:
            suggestion = self._from_prediction(context, prediction, auto_execution_enabled)
            suggestions.append(suggestion)

        ranked = sorted(suggestions, key=lambda row: row.confidence, reverse=True)
        self._persist(context, ranked)
        return ranked

    def _from_prediction(
        self,
        context: ContextSnapshot,
        prediction: InitiativePrediction,
        auto_execution_enabled: bool,
    ) -> InitiativeSuggestion:
        self._counter += 1
        suggestion_type = "assistive"
        auto_executable = False
        title = "Suggested Action"
        details = prediction.rationale
        payload: Dict[str, Any] = {
            "intent": prediction.intent,
            "actions": prediction.proposed_actions,
        }

        if prediction.intent == "fetch_market_news":
            title = "Fetch Market News Now"
            details = "Trading context detected. Pull latest market headlines and risk events."
            suggestion_type = "market_intel"
            auto_executable = auto_execution_enabled
            payload.update({"news_scope": "global_markets", "priority": "high"})

        elif prediction.intent == "offer_code_assist":
            title = "Offer Coding Assistance"
            details = "Development session detected. Suggesting next implementation step."
            suggestion_type = "developer_support"
            payload.update({"mode": "next_step"})

        elif prediction.intent == "summarize_research":
            title = "Summarize Current Research"
            details = "Browser research activity detected. Generate concise findings summary."
            suggestion_type = "research_support"
            auto_executable = auto_execution_enabled
            payload.update({"format": "bulleted_summary"})

        elif prediction.intent == "continue_recent_work":
            title = "Continue Recent Work"
            details = "Related memory found. Resume with a focused continuation plan."
            suggestion_type = "continuation"
            payload.update({"mode": "resume"})

        elif prediction.intent.startswith("prepare_"):
            topic = prediction.intent.replace("prepare_", "")
            title = f"Prepare {topic.title()} Workspace"
            details = f"Behavior suggests recurring '{topic}' workflow."
            suggestion_type = "workspace_prep"
            auto_executable = auto_execution_enabled
            payload.update({"topic": topic})

        elif prediction.intent == "routine_review":
            title = "Run Routine Review"
            details = "Preferred routine time detected. Surface pending priorities."
            suggestion_type = "routine"
            auto_executable = auto_execution_enabled
            payload.update({"review_scope": "daily"})

        elif prediction.intent == "context_shift_support":
            title = "Support Context Shift"
            details = "Activity shift detected. Offer a quick transition checklist."
            suggestion_type = "transition_assist"
            payload.update({"mode": "checklist"})

        return InitiativeSuggestion(
            suggestion_id=f"s-{self._counter}",
            title=title,
            details=details,
            confidence=prediction.confidence,
            suggestion_type=suggestion_type,
            auto_executable=auto_executable,
            action_payload=payload,
        )

    def create_automation_plan(self, suggestions: List[InitiativeSuggestion]) -> List[Dict[str, Any]]:
        """Convert auto-executable suggestions to a simple action plan."""
        plan: List[Dict[str, Any]] = []
        for item in suggestions:
            if not item.auto_executable:
                continue
            plan.append(
                {
                    "suggestion_id": item.suggestion_id,
                    "action": item.suggestion_type,
                    "payload": item.action_payload,
                    "priority": "high" if item.confidence >= 0.8 else "normal",
                }
            )
        return plan

    def summarize(self, suggestions: List[InitiativeSuggestion], limit: int = 5) -> str:
        rows = suggestions[: max(1, limit)]
        if not rows:
            return "No proactive suggestions currently."
        lines = ["Proactive Suggestions:"]
        for row in rows:
            lines.append(f"- {row.title} ({row.confidence:.2f})")
        return "\n".join(lines)

    def apply_policy(
        self,
        suggestions: List[InitiativeSuggestion],
        *,
        min_confidence: float = 0.55,
        allow_auto: bool = True,
    ) -> List[InitiativeSuggestion]:
        """Filter suggestions by safety/quality policy."""
        out: List[InitiativeSuggestion] = []
        for item in suggestions:
            if item.confidence < min_confidence:
                continue
            if not allow_auto and item.auto_executable:
                safe_copy = InitiativeSuggestion(
                    suggestion_id=item.suggestion_id,
                    title=item.title,
                    details=item.details,
                    confidence=item.confidence,
                    suggestion_type=item.suggestion_type,
                    auto_executable=False,
                    action_payload=dict(item.action_payload),
                )
                out.append(safe_copy)
                continue
            out.append(item)
        return out

    def grouped(self, suggestions: List[InitiativeSuggestion]) -> Dict[str, List[InitiativeSuggestion]]:
        """Group suggestions by suggestion_type for UI rendering."""
        groups: Dict[str, List[InitiativeSuggestion]] = {}
        for item in suggestions:
            if item.suggestion_type not in groups:
                groups[item.suggestion_type] = []
            groups[item.suggestion_type].append(item)
        return groups

    def _persist(self, context: ContextSnapshot, suggestions: List[InitiativeSuggestion]) -> None:
        payload = {
            "app": context.current_application,
            "activity": context.user_activity,
            "time_of_day": context.time_of_day,
            "suggestions": [
                {
                    "id": item.suggestion_id,
                    "title": item.title,
                    "confidence": item.confidence,
                    "auto_executable": item.auto_executable,
                }
                for item in suggestions[:10]
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        self._memory.remember_short_term(
            key="initiative:last_suggestions",
            value=payload,
            tags=["initiative", "suggestion"],
        )

        self._memory.remember_semantic(
            doc_id=f"initiative:suggestions:{datetime.now(timezone.utc).timestamp()}",
            text="; ".join(f"{row.title}:{row.confidence}" for row in suggestions[:10]),
            metadata={"type": "initiative_suggestion"},
        )


def _example_suggestion_generator() -> None:
    memory = MemorySystem()
    generator = SuggestionGenerator(memory)

    context = ContextSnapshot(
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        signals={},
    )
    predictions = [
        InitiativePrediction(
            prediction_id="p1",
            intent="fetch_market_news",
            confidence=0.9,
            rationale="Trading app opened",
            proposed_actions=["fetch headlines"],
            metadata={},
        )
    ]

    suggestions = generator.generate(context, predictions, auto_execution_enabled=True)
    print(generator.summarize(suggestions))
    print("Automation plan:", generator.create_automation_plan(suggestions))


if __name__ == "__main__":
    _example_suggestion_generator()

