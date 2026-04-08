"""Event stream for system-level Jarvis events."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional
from uuid import uuid4

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class BusEvent:
    """One system event emitted by the bus."""

    event_id: str
    event_type: str
    source: str
    payload: Dict[str, Any]
    severity: str = "info"
    topic: str = ""
    correlation_id: str | None = None
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class EventSubscription:
    subscription_id: str
    pattern: str
    callback: Callable[[BusEvent], Any]
    source: str = ""
    active: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


class EventStream:
    """Synchronous publish/subscribe event stream."""

    def __init__(self, memory: MemorySystem | None = None) -> None:
        self._memory = memory
        self._events: List[BusEvent] = []
        self._subscriptions: Dict[str, EventSubscription] = {}
        self._lock = RLock()

    def publish(
        self,
        event_type: str,
        source: str,
        payload: Mapping[str, Any],
        *,
        severity: str = "info",
        topic: str = "",
        correlation_id: str | None = None,
        tags: Iterable[str] | None = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BusEvent:
        event = BusEvent(
            event_id=f"evt-{uuid4().hex[:12]}",
            event_type=event_type,
            source=source,
            payload=dict(payload),
            severity=severity,
            topic=topic or event_type,
            correlation_id=correlation_id,
            tags=[str(item) for item in (tags or [])],
            metadata=dict(metadata or {}),
        )
        with self._lock:
            self._events.append(event)
            if len(self._events) > 2000:
                self._events = self._events[-2000:]

        self._notify(event)
        self._persist(event)
        return event

    def subscribe(self, pattern: str, callback: Callable[[BusEvent], Any], *, source: str = "", metadata: Optional[Dict[str, Any]] = None) -> EventSubscription:
        sub = EventSubscription(
            subscription_id=f"sub-{uuid4().hex[:12]}",
            pattern=pattern.strip().lower() or "*",
            callback=callback,
            source=source,
            metadata=dict(metadata or {}),
        )
        with self._lock:
            self._subscriptions[sub.subscription_id] = sub
        return sub

    def unsubscribe(self, subscription_id: str) -> bool:
        with self._lock:
            return self._subscriptions.pop(subscription_id, None) is not None

    def recent(self, limit: int = 50) -> List[BusEvent]:
        if limit <= 0:
            return []
        with self._lock:
            return list(self._events[-limit:])

    def by_type(self, event_type: str, limit: int = 50) -> List[BusEvent]:
        return [event for event in self.recent(limit * 4) if event.event_type == event_type][: max(1, limit)]

    def by_topic(self, topic: str, limit: int = 50) -> List[BusEvent]:
        target = topic.strip().lower()
        if not target:
            return []
        return [event for event in self.recent(limit * 4) if self._matches(target, event.topic.lower())][: max(1, limit)]

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "event_count": len(self._events),
            "subscription_count": len(self._subscriptions),
            "recent_events": [
                {
                    "event_id": event.event_id,
                    "event_type": event.event_type,
                    "source": event.source,
                    "topic": event.topic,
                    "severity": event.severity,
                    "timestamp": event.timestamp,
                }
                for event in self.recent(25)
            ],
        }

    def _notify(self, event: BusEvent) -> None:
        callbacks: List[Callable[[BusEvent], Any]] = []
        with self._lock:
            for sub in self._subscriptions.values():
                if not sub.active:
                    continue
                if self._matches(sub.pattern, event.event_type) or self._matches(sub.pattern, event.topic.lower()):
                    callbacks.append(sub.callback)

        for callback in callbacks:
            try:
                callback(event)
            except Exception:
                continue

    def _persist(self, event: BusEvent) -> None:
        if self._memory is None:
            return
        payload = {
            "type": "system_bus_event",
            "event_id": event.event_id,
            "event_type": event.event_type,
            "source": event.source,
            "topic": event.topic,
            "severity": event.severity,
            "payload": event.payload,
            "metadata": event.metadata,
            "timestamp": event.timestamp,
        }
        self._memory.remember_short_term(
            key="system_bus:last_event",
            value=payload,
            tags=["system_bus", "event"],
        )
        if event.severity in {"warning", "error", "critical"}:
            self._memory.remember_long_term(
                key=f"system_bus:event:{event.event_id}",
                value=payload,
                source="jarvis.system_bus.event_stream",
                importance=0.75 if event.severity == "warning" else 0.9,
                tags=["system_bus", "event", event.severity],
            )

    @staticmethod
    def _matches(pattern: str, value: str) -> bool:
        if pattern in {"*", "all"}:
            return True
        if pattern == value:
            return True
        return value.startswith(pattern + ".") or pattern.startswith(value + ".")
