"""Observation cycle for the Pixi cognitive loop.

Collects new signals from the perception layer and refreshes shared context,
world model, and operational observations used by downstream cycles.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from Pixi.core.contracts import ContextSnapshot
from Pixi.memory.memory_system import MemorySystem
from Pixi.world_model.world_state import WorldStateModel, WorldStateSnapshot


@dataclass(slots=True)
class ObservationRecord:
    observation_id: str
    timestamp: str
    context: ContextSnapshot
    world_state: WorldStateSnapshot
    signals: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ObservationCycle:
    """Collects fresh context from perception and updates runtime state."""

    memory: MemorySystem
    world_model: WorldStateModel
    last_observation: Optional[ObservationRecord] = None
    history: List[ObservationRecord] = field(default_factory=list)
    history_limit: int = 300

    def observe(self, perception_context: ContextSnapshot, *, metadata: Optional[Dict[str, Any]] = None) -> ObservationRecord:
        """Refresh world state and capture an observation snapshot."""

        metadata = metadata or {}
        world_state = self.world_model.refresh(perception_context)
        signals = self._compose_signals(perception_context, world_state, metadata)
        notes = self._derive_notes(perception_context, world_state, signals)

        record = ObservationRecord(
            observation_id=f"obs-{uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            context=perception_context,
            world_state=world_state,
            signals=signals,
            notes=notes,
        )
        self.last_observation = record
        self._append(record)
        self._persist(record)
        return record

    def summarize(self, record: Optional[ObservationRecord] = None) -> Dict[str, Any]:
        """Return compact summary for reasoning and planning layers."""

        record = record or self.last_observation
        if record is None:
            return {
                "available": False,
                "reason": "no_observation",
            }

        return {
            "available": True,
            "observation_id": record.observation_id,
            "timestamp": record.timestamp,
            "app": record.context.current_application,
            "activity": record.context.user_activity,
            "time_of_day": record.context.time_of_day,
            "system_health": record.world_state.system_health,
            "confidence": record.world_state.confidence,
            "notes": list(record.notes),
            "signals": dict(record.signals),
            "constraints": list(record.world_state.constraints),
            "opportunities": list(record.world_state.opportunities),
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.history),
            "latest": self.summarize(),
        }

    def _append(self, record: ObservationRecord) -> None:
        self.history.append(record)
        if len(self.history) > self.history_limit:
            self.history = self.history[-self.history_limit :]

    def _compose_signals(
        self,
        context: ContextSnapshot,
        world_state: WorldStateSnapshot,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        signals: Dict[str, Any] = {
            "current_application": context.current_application,
            "user_activity": context.user_activity,
            "time_of_day": context.time_of_day,
            "system_health": world_state.system_health,
            "world_confidence": world_state.confidence,
            "metadata": dict(metadata),
            "risk_factors": self.world_model.risk_factors(),
            "action_constraints": self.world_model.action_constraints(),
        }

        if isinstance(context.signals, dict):
            signals["perception_signals"] = dict(context.signals)
            for key, value in context.signals.items():
                if key not in signals:
                    signals[key] = value

        signals["high_attention"] = world_state.system_health in {"degraded", "critical"}
        signals["stable_window"] = world_state.system_health == "healthy"
        return signals

    def _derive_notes(
        self,
        context: ContextSnapshot,
        world_state: WorldStateSnapshot,
        signals: Dict[str, Any],
    ) -> List[str]:
        notes: List[str] = []
        if world_state.system_health in {"degraded", "critical"}:
            notes.append("System health requires cautious reasoning.")
        if context.current_application.lower() in {"tradingview", "mt5"}:
            notes.append("High-stakes domain detected in current application.")
        if world_state.opportunities:
            notes.append(f"Detected {len(world_state.opportunities)} opportunities for action.")
        if signals.get("high_attention"):
            notes.append("Elevated attention required for next cycle.")
        return notes

    def _persist(self, record: ObservationRecord) -> None:
        payload = {
            "observation_id": record.observation_id,
            "timestamp": record.timestamp,
            "summary": self.summarize(record),
        }
        self.memory.remember_short_term(
            key="brain_loop:last_observation",
            value=payload,
            tags=["brain_loop", "observation"],
        )
        self.memory.remember_long_term(
            key=f"brain_loop:observation:{record.observation_id}",
            value=payload,
            source="brain_loop.observation_cycle",
            importance=0.7,
            tags=["brain_loop", "observation"],
        )

