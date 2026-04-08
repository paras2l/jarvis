"""Prediction engine for proactive Pixi behavior.

Combines current context + behavior profile + memory hints to infer what the
user is likely to need next.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.core.contracts import ContextSnapshot
from Pixi.initiative_engine.behavior_model import BehaviorModel, BehaviorProfile
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class InitiativePrediction:
    prediction_id: str
    intent: str
    confidence: float
    rationale: str
    proposed_actions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class PredictionEngine:
    """Predictive layer that maps context + behavior into likely intents."""

    def __init__(self, memory: MemorySystem, behavior_model: BehaviorModel) -> None:
        self._memory = memory
        self._behavior_model = behavior_model
        self._counter = 0

    def predict(self, context: ContextSnapshot) -> List[InitiativePrediction]:
        profile = self._behavior_model.profile()
        predictions: List[InitiativePrediction] = []

        # Rule 1: domain application-specific proactive assistance.
        predictions.extend(self._predict_from_active_application(context, profile))

        # Rule 2: routine-based suggestions.
        predictions.extend(self._predict_from_behavior_alignment(context, profile))

        # Rule 3: semantic memory hints from previous goals/tasks.
        predictions.extend(self._predict_from_memory(context, profile))

        merged = self._deduplicate(predictions)
        ranked = sorted(merged, key=lambda item: item.confidence, reverse=True)
        self._persist_predictions(context, ranked)
        return ranked

    def best_prediction(self, context: ContextSnapshot) -> InitiativePrediction | None:
        rows = self.predict(context)
        return rows[0] if rows else None

    def _predict_from_active_application(
        self,
        context: ContextSnapshot,
        profile: BehaviorProfile,
    ) -> List[InitiativePrediction]:
        app = context.current_application.lower()
        out: List[InitiativePrediction] = []

        if "trading" in app or app in {"tradingview", "mt5", "terminal"}:
            out.append(
                self._mk(
                    intent="fetch_market_news",
                    confidence=0.88,
                    rationale="User is in trading environment; market context likely needed.",
                    actions=["Fetch latest market headlines", "Summarize top movers", "Highlight risk events"],
                    metadata={"trigger": "application", "app": context.current_application},
                )
            )

        if app in {"vscode", "cursor", "pycharm"}:
            out.append(
                self._mk(
                    intent="offer_code_assist",
                    confidence=0.74,
                    rationale="Development app active; likely coding support opportunity.",
                    actions=["Check current task status", "Suggest next implementation step"],
                    metadata={"trigger": "application", "app": context.current_application},
                )
            )

        if app in {"browser", "chrome", "edge", "firefox"} and context.user_activity == "research":
            out.append(
                self._mk(
                    intent="summarize_research",
                    confidence=0.71,
                    rationale="Research activity detected in browser.",
                    actions=["Capture key findings", "Generate concise summary notes"],
                    metadata={"trigger": "application_activity", "app": context.current_application},
                )
            )

        return out

    def _predict_from_behavior_alignment(
        self,
        context: ContextSnapshot,
        profile: BehaviorProfile,
    ) -> List[InitiativePrediction]:
        score = self._behavior_model.score_alignment(context)
        out: List[InitiativePrediction] = []

        if score >= 0.8 and profile.command_topics:
            topic = profile.command_topics[0]
            out.append(
                self._mk(
                    intent=f"prepare_{topic}_workspace",
                    confidence=min(0.92, 0.6 + score * 0.35),
                    rationale="Current context strongly matches historical usage patterns.",
                    actions=[
                        f"Preload relevant resources for {topic}",
                        "Draft a short proactive checklist",
                    ],
                    metadata={"trigger": "behavior_alignment", "alignment": score},
                )
            )

        if context.time_of_day in profile.preferred_time_blocks and "routine_review" in profile.preferences:
            out.append(
                self._mk(
                    intent="routine_review",
                    confidence=0.67,
                    rationale="Preferred time block and routine_review preference detected.",
                    actions=["Show routine dashboard", "Surface pending follow-ups"],
                    metadata={"trigger": "time_preference", "time_of_day": context.time_of_day},
                )
            )

        if context.user_activity not in profile.dominant_activities and profile.confidence > 0.6:
            out.append(
                self._mk(
                    intent="context_shift_support",
                    confidence=0.59,
                    rationale="Activity differs from dominant profile; assistant can smooth transition.",
                    actions=["Suggest likely next tools", "Offer quick context primer"],
                    metadata={"trigger": "activity_shift"},
                )
            )

        return out

    def _predict_from_memory(
        self,
        context: ContextSnapshot,
        profile: BehaviorProfile,
    ) -> List[InitiativePrediction]:
        query = f"{context.current_application} {context.user_activity} {context.time_of_day}"
        memory_hits = self._memory.semantic_search(query, top_k=5)
        if not memory_hits:
            return []

        strongest = memory_hits[0]
        confidence = min(0.8, 0.45 + strongest.score * 0.45)
        return [
            self._mk(
                intent="continue_recent_work",
                confidence=confidence,
                rationale="Semantic memory indicates related previous work.",
                actions=["Recall relevant notes", "Suggest continuation plan"],
                metadata={"trigger": "semantic_memory", "top_doc": strongest.doc_id},
            )
        ]

    def _deduplicate(self, rows: List[InitiativePrediction]) -> List[InitiativePrediction]:
        by_intent: Dict[str, InitiativePrediction] = {}
        for row in rows:
            current = by_intent.get(row.intent)
            if current is None or row.confidence > current.confidence:
                by_intent[row.intent] = row
        return list(by_intent.values())

    def _persist_predictions(self, context: ContextSnapshot, predictions: List[InitiativePrediction]) -> None:
        if not predictions:
            return

        payload = {
            "app": context.current_application,
            "activity": context.user_activity,
            "time_of_day": context.time_of_day,
            "predictions": [
                {
                    "intent": row.intent,
                    "confidence": row.confidence,
                    "rationale": row.rationale,
                }
                for row in predictions[:5]
            ],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        self._memory.remember_short_term(
            key="initiative:last_predictions",
            value=payload,
            tags=["initiative", "prediction"],
        )
        self._memory.remember_semantic(
            doc_id=f"initiative:predictions:{datetime.now(timezone.utc).timestamp()}",
            text=(
                f"Predictions for app={context.current_application} activity={context.user_activity}: "
                + ", ".join(f"{item.intent}:{item.confidence}" for item in predictions[:5])
            ),
            metadata={"type": "initiative_prediction"},
        )

    def _mk(
        self,
        *,
        intent: str,
        confidence: float,
        rationale: str,
        actions: List[str],
        metadata: Dict[str, Any],
    ) -> InitiativePrediction:
        self._counter += 1
        return InitiativePrediction(
            prediction_id=f"pred-{self._counter}",
            intent=intent,
            confidence=round(max(0.0, min(1.0, confidence)), 3),
            rationale=rationale,
            proposed_actions=actions,
            metadata=metadata,
        )


def _example_prediction_engine() -> None:
    memory = MemorySystem()
    behavior = BehaviorModel(memory)

    behavior.ingest_command("fetch market news")
    behavior.ingest_context(
        ContextSnapshot(
            current_application="tradingview",
            user_activity="analysis",
            time_of_day="morning",
            signals={},
        )
    )
    behavior.rebuild_profile()

    engine = PredictionEngine(memory, behavior)
    context = ContextSnapshot(
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        signals={},
    )

    rows = engine.predict(context)
    for row in rows:
        print(f"{row.intent} ({row.confidence}) -> {row.proposed_actions}")


if __name__ == "__main__":
    _example_prediction_engine()

