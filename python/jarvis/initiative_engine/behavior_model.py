"""Behavior model for Jarvis Initiative Engine.

Builds a compact behavioral profile by analyzing commands, context snapshots,
and preference signals persisted in memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import statistics
from threading import RLock
from typing import Any, Dict, Iterable, List

from jarvis.core.contracts import ContextSnapshot
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class UsageEvent:
    timestamp: str
    event_type: str
    content: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BehaviorProfile:
    """Derived user behavior profile used by prediction engine."""

    dominant_apps: List[str] = field(default_factory=list)
    dominant_activities: List[str] = field(default_factory=list)
    preferred_time_blocks: List[str] = field(default_factory=list)
    command_topics: List[str] = field(default_factory=list)
    preferences: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BehaviorModel:
    """Learns user tendencies from interaction history."""

    def __init__(self, memory: MemorySystem, history_limit: int = 2500) -> None:
        self._memory = memory
        self._history_limit = max(100, history_limit)
        self._events: List[UsageEvent] = []
        self._lock = RLock()
        self._profile = BehaviorProfile()

    def ingest_command(self, command: str, metadata: Dict[str, Any] | None = None) -> None:
        event = UsageEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="command",
            content=command.strip().lower(),
            metadata=dict(metadata or {}),
        )
        self._append_event(event)

    def ingest_context(self, context: ContextSnapshot) -> None:
        payload = {
            "app": context.current_application,
            "activity": context.user_activity,
            "time": context.time_of_day,
        }
        event = UsageEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="context",
            content=f"{context.current_application}|{context.user_activity}|{context.time_of_day}",
            metadata=payload,
        )
        self._append_event(event)

    def ingest_feedback(self, label: str, score: float, note: str = "") -> None:
        event = UsageEvent(
            timestamp=datetime.now(timezone.utc).isoformat(),
            event_type="feedback",
            content=label.strip().lower(),
            metadata={"score": float(score), "note": note},
        )
        self._append_event(event)

    def update_preference(self, key: str, value: Any) -> None:
        with self._lock:
            self._profile.preferences[key] = value
            self._profile.updated_at = datetime.now(timezone.utc).isoformat()

        self._memory.remember_long_term(
            key=f"behavior:preference:{key}",
            value={"key": key, "value": value},
            source="behavior_model",
            importance=0.8,
            tags=["behavior", "preference"],
        )

    def rebuild_profile(self) -> BehaviorProfile:
        with self._lock:
            commands = [e for e in self._events if e.event_type == "command"]
            contexts = [e for e in self._events if e.event_type == "context"]
            feedback = [e for e in self._events if e.event_type == "feedback"]

        app_counts = self._count_map([str(e.metadata.get("app", "unknown")) for e in contexts])
        activity_counts = self._count_map([str(e.metadata.get("activity", "unknown")) for e in contexts])
        time_counts = self._count_map([str(e.metadata.get("time", "unknown")) for e in contexts])

        command_topics = self._extract_topics([e.content for e in commands])
        confidence = self._compute_confidence(len(commands), len(contexts), feedback)

        profile = BehaviorProfile(
            dominant_apps=self._top_keys(app_counts, 5),
            dominant_activities=self._top_keys(activity_counts, 5),
            preferred_time_blocks=self._top_keys(time_counts, 3),
            command_topics=command_topics,
            preferences=dict(self._profile.preferences),
            confidence=confidence,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

        with self._lock:
            self._profile = profile

        self._persist_profile(profile)
        return profile

    def profile(self) -> BehaviorProfile:
        with self._lock:
            return self._profile

    def event_count(self) -> int:
        with self._lock:
            return len(self._events)

    def recent_events(self, limit: int = 50, event_type: str | None = None) -> List[UsageEvent]:
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._events)
        if event_type:
            rows = [row for row in rows if row.event_type == event_type]
        return list(reversed(rows[-limit:]))

    def score_alignment(self, context: ContextSnapshot) -> float:
        profile = self.profile()
        score = 0.0
        if context.current_application in profile.dominant_apps:
            score += 0.4
        if context.user_activity in profile.dominant_activities:
            score += 0.4
        if context.time_of_day in profile.preferred_time_blocks:
            score += 0.2
        return round(min(1.0, score), 3)

    def detect_routine_patterns(self) -> List[Dict[str, Any]]:
        """Identify simple recurring behavior patterns."""
        profile = self.profile()
        out: List[Dict[str, Any]] = []

        if profile.dominant_apps:
            out.append(
                {
                    "pattern": "dominant_apps",
                    "value": profile.dominant_apps,
                    "confidence": profile.confidence,
                }
            )

        if profile.command_topics:
            out.append(
                {
                    "pattern": "command_topics",
                    "value": profile.command_topics,
                    "confidence": profile.confidence,
                }
            )

        if profile.preferred_time_blocks:
            out.append(
                {
                    "pattern": "time_block_preference",
                    "value": profile.preferred_time_blocks,
                    "confidence": profile.confidence,
                }
            )

        return out

    def _append_event(self, event: UsageEvent) -> None:
        with self._lock:
            self._events.append(event)
            while len(self._events) > self._history_limit:
                self._events.pop(0)

        self._memory.remember_short_term(
            key=f"behavior:event:{event.event_type}:{len(self._events)}",
            value={
                "type": event.event_type,
                "content": event.content,
                "metadata": event.metadata,
            },
            tags=["behavior", event.event_type],
        )

    def _persist_profile(self, profile: BehaviorProfile) -> None:
        payload = {
            "dominant_apps": profile.dominant_apps,
            "dominant_activities": profile.dominant_activities,
            "preferred_time_blocks": profile.preferred_time_blocks,
            "command_topics": profile.command_topics,
            "preferences": profile.preferences,
            "confidence": profile.confidence,
            "updated_at": profile.updated_at,
        }
        self._memory.remember_long_term(
            key="behavior:profile:latest",
            value=payload,
            source="behavior_model",
            importance=0.85,
            tags=["behavior", "profile"],
        )
        self._memory.remember_semantic(
            doc_id="behavior:profile:latest",
            text=(
                f"Dominant apps: {profile.dominant_apps}; activities: {profile.dominant_activities}; "
                f"topics: {profile.command_topics}; preferred times: {profile.preferred_time_blocks}"
            ),
            metadata={"type": "behavior_profile", "confidence": profile.confidence},
        )

    @staticmethod
    def _count_map(values: Iterable[str]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for value in values:
            normalized = value.strip().lower()
            if not normalized:
                continue
            counts[normalized] = counts.get(normalized, 0) + 1
        return counts

    @staticmethod
    def _top_keys(counts: Dict[str, int], n: int) -> List[str]:
        ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
        return [key for key, _ in ranked[: max(1, n)]]

    @staticmethod
    def _extract_topics(commands: List[str]) -> List[str]:
        stop = {"the", "and", "for", "with", "from", "into", "create", "build", "make", "jarvis"}
        counts: Dict[str, int] = {}
        for line in commands:
            for token in line.split():
                word = token.strip().lower()
                if len(word) < 3 or word in stop:
                    continue
                counts[word] = counts.get(word, 0) + 1
        ranked = sorted(counts.items(), key=lambda item: item[1], reverse=True)
        return [key for key, _ in ranked[:8]]

    @staticmethod
    def _compute_confidence(command_count: int, context_count: int, feedback: List[UsageEvent]) -> float:
        base = min(1.0, (command_count + context_count) / 120.0)
        if not feedback:
            return round(base, 3)

        scores = [float(item.metadata.get("score", 0.0)) for item in feedback]
        avg_feedback = statistics.fmean(scores) if scores else 0.0
        adjusted = max(0.0, min(1.0, base * 0.8 + avg_feedback * 0.2))
        return round(adjusted, 3)


def _example_behavior_model() -> None:
    memory = MemorySystem()
    model = BehaviorModel(memory)

    model.ingest_command("create weekly trading summary")
    model.ingest_command("fetch market news")
    model.ingest_context(
        ContextSnapshot(
            current_application="tradingview",
            user_activity="analysis",
            time_of_day="morning",
            signals={},
        )
    )
    model.ingest_context(
        ContextSnapshot(
            current_application="tradingview",
            user_activity="analysis",
            time_of_day="morning",
            signals={},
        )
    )

    profile = model.rebuild_profile()
    print("Behavior profile:", profile)
    print("Patterns:", model.detect_routine_patterns())


if __name__ == "__main__":
    _example_behavior_model()
