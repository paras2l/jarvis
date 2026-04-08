"""World state model for Jarvis World Model Engine.

Maintains a current state representation built from:
- live context signals
- memory-backed knowledge
- inferred constraints and opportunities
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List

from jarvis.core.contracts import ContextSnapshot
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class WorldKnowledgeItem:
    """One relevant knowledge snippet used for scenario reasoning."""

    doc_id: str
    summary: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class WorldStateSnapshot:
    """Internal world state used by scenario generation and simulation."""

    timestamp: str
    current_application: str
    user_activity: str
    time_of_day: str
    system_health: str
    active_entities: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    opportunities: List[str] = field(default_factory=list)
    memory_knowledge: List[WorldKnowledgeItem] = field(default_factory=list)
    confidence: float = 0.0


class WorldStateModel:
    """Builds and maintains a compact world-state representation."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory
        self._lock = RLock()
        self._current = WorldStateSnapshot(
            timestamp=datetime.now(timezone.utc).isoformat(),
            current_application="unknown",
            user_activity="unknown",
            time_of_day="unknown",
            system_health="unknown",
            confidence=0.0,
        )
        self._history: List[WorldStateSnapshot] = []
        self._history_limit = 500

    def refresh(self, context: ContextSnapshot) -> WorldStateSnapshot:
        """Refresh world state from latest context and memory signals."""
        knowledge = self._retrieve_relevant_knowledge(context)
        health = self._derive_health(context)
        constraints = self._derive_constraints(context, health)
        opportunities = self._derive_opportunities(context, knowledge)
        entities = self._derive_entities(context)
        confidence = self._estimate_confidence(context, knowledge)

        snapshot = WorldStateSnapshot(
            timestamp=datetime.now(timezone.utc).isoformat(),
            current_application=context.current_application,
            user_activity=context.user_activity,
            time_of_day=context.time_of_day,
            system_health=health,
            active_entities=entities,
            constraints=constraints,
            opportunities=opportunities,
            memory_knowledge=knowledge,
            confidence=confidence,
        )

        with self._lock:
            self._current = snapshot
            self._history.append(snapshot)
            while len(self._history) > self._history_limit:
                self._history.pop(0)

        self._persist_snapshot(snapshot)
        return snapshot

    def current(self) -> WorldStateSnapshot:
        with self._lock:
            return self._current

    def history(self, limit: int = 50) -> List[WorldStateSnapshot]:
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._history)
        return list(reversed(rows[-limit:]))

    def summarize(self) -> Dict[str, Any]:
        state = self.current()
        return {
            "timestamp": state.timestamp,
            "app": state.current_application,
            "activity": state.user_activity,
            "time_of_day": state.time_of_day,
            "health": state.system_health,
            "constraints": state.constraints,
            "opportunities": state.opportunities,
            "knowledge_count": len(state.memory_knowledge),
            "confidence": state.confidence,
        }

    def risk_factors(self) -> List[str]:
        state = self.current()
        factors: List[str] = []
        if state.system_health in {"degraded", "critical"}:
            factors.append("system_health_risk")
        if any("deadline" in item for item in state.constraints):
            factors.append("deadline_pressure")
        if any("resource" in item for item in state.constraints):
            factors.append("resource_pressure")
        if state.current_application.lower() in {"tradingview", "mt5"}:
            factors.append("market_volatility_risk")
        return factors

    def action_constraints(self) -> Dict[str, Any]:
        state = self.current()
        return {
            "allow_parallel_heavy_tasks": state.system_health == "healthy",
            "prefer_low_risk_path": state.system_health != "healthy",
            "time_sensitive": "deadline_detected" in state.constraints,
            "needs_human_confirmation": "high_stakes_domain" in state.constraints,
        }

    def export_state(self) -> Dict[str, Any]:
        state = self.current()
        return {
            "snapshot": {
                "timestamp": state.timestamp,
                "current_application": state.current_application,
                "user_activity": state.user_activity,
                "time_of_day": state.time_of_day,
                "system_health": state.system_health,
                "active_entities": list(state.active_entities),
                "constraints": list(state.constraints),
                "opportunities": list(state.opportunities),
                "confidence": state.confidence,
            },
            "knowledge": [
                {
                    "doc_id": item.doc_id,
                    "summary": item.summary,
                    "score": item.score,
                    "metadata": item.metadata,
                }
                for item in state.memory_knowledge
            ],
        }

    def _retrieve_relevant_knowledge(self, context: ContextSnapshot) -> List[WorldKnowledgeItem]:
        query = f"{context.current_application} {context.user_activity} {context.time_of_day}"
        rows = self._memory.semantic_search(query, top_k=6)
        out: List[WorldKnowledgeItem] = []
        for row in rows:
            out.append(
                WorldKnowledgeItem(
                    doc_id=row.doc_id,
                    summary=row.text[:220],
                    score=row.score,
                    metadata=dict(row.metadata),
                )
            )
        return out

    @staticmethod
    def _derive_health(context: ContextSnapshot) -> str:
        metrics = context.signals.get("system_metrics", {}) if isinstance(context.signals, dict) else {}
        cpu = float(metrics.get("cpu_percent", 0.0) or 0.0)
        mem = float(metrics.get("memory_percent", 0.0) or 0.0)

        if cpu >= 90 or mem >= 90:
            return "critical"
        if cpu >= 75 or mem >= 75:
            return "degraded"
        return "healthy"

    @staticmethod
    def _derive_constraints(context: ContextSnapshot, health: str) -> List[str]:
        out: List[str] = []
        if health != "healthy":
            out.append("resource_pressure")

        if context.time_of_day in {"night", "late_night"}:
            out.append("low_energy_window")

        app = context.current_application.lower()
        if app in {"tradingview", "mt5", "broker_terminal"}:
            out.append("high_stakes_domain")

        signals = context.signals if isinstance(context.signals, dict) else {}
        recent_actions = signals.get("recent_user_actions", [])
        if isinstance(recent_actions, list) and len(recent_actions) > 5:
            out.append("high_activity_stream")

        if any("deadline" in str(item).lower() for item in recent_actions):
            out.append("deadline_detected")
        return out

    @staticmethod
    def _derive_opportunities(context: ContextSnapshot, knowledge: List[WorldKnowledgeItem]) -> List[str]:
        out: List[str] = []
        if context.user_activity in {"research", "analysis"}:
            out.append("summarization_opportunity")
        if context.user_activity in {"development", "coding"}:
            out.append("implementation_acceleration")
        if context.current_application.lower() in {"tradingview", "mt5"}:
            out.append("market_intel_enrichment")
        if any(item.score >= 0.7 for item in knowledge):
            out.append("memory_guided_shortcut")
        return out

    @staticmethod
    def _derive_entities(context: ContextSnapshot) -> List[str]:
        entities = [context.current_application, context.user_activity, context.time_of_day]
        signals = context.signals if isinstance(context.signals, dict) else {}
        apps = signals.get("active_applications", [])
        if isinstance(apps, list):
            entities.extend([str(item) for item in apps[:5]])
        # de-duplicate while preserving order
        seen: set[str] = set()
        out: List[str] = []
        for item in entities:
            norm = item.strip().lower()
            if not norm or norm in seen:
                continue
            seen.add(norm)
            out.append(norm)
        return out

    @staticmethod
    def _estimate_confidence(context: ContextSnapshot, knowledge: List[WorldKnowledgeItem]) -> float:
        signals_quality = 0.4 if context.signals else 0.2
        knowledge_quality = min(0.4, len(knowledge) * 0.08)
        app_quality = 0.2 if context.current_application != "unknown" else 0.05
        return round(min(1.0, signals_quality + knowledge_quality + app_quality), 3)

    def _persist_snapshot(self, snapshot: WorldStateSnapshot) -> None:
        self._memory.remember_short_term(
            key="world_state:latest",
            value={
                "app": snapshot.current_application,
                "activity": snapshot.user_activity,
                "health": snapshot.system_health,
                "constraints": snapshot.constraints,
                "opportunities": snapshot.opportunities,
                "confidence": snapshot.confidence,
            },
            tags=["world_model", "state"],
        )
        self._memory.remember_semantic(
            doc_id=f"world_state:{snapshot.timestamp}",
            text=(
                f"World state app={snapshot.current_application} activity={snapshot.user_activity} "
                f"health={snapshot.system_health} constraints={snapshot.constraints} "
                f"opportunities={snapshot.opportunities}"
            ),
            metadata={"type": "world_state", "confidence": snapshot.confidence},
        )


def _example_world_state() -> None:
    memory = MemorySystem()
    model = WorldStateModel(memory)

    context = ContextSnapshot(
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        signals={"system_metrics": {"cpu_percent": 42, "memory_percent": 57}},
    )

    snapshot = model.refresh(context)
    print("World snapshot:", snapshot)
    print("Risk factors:", model.risk_factors())
    print("Action constraints:", model.action_constraints())


if __name__ == "__main__":
    _example_world_state()
