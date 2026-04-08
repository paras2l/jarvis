"""Internal event bus for Pixi runtime coordination.

The event bus enables decoupled communication between runtime modules.
Components can publish events without knowing who listens.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Callable, Dict, List, Protocol
import traceback
import uuid


class EventHandler(Protocol):
    """Type protocol for event handlers."""

    def __call__(self, event: "RuntimeEvent") -> None:
        ...


@dataclass(slots=True)
class RuntimeEvent:
    """One event flowing through the runtime bus."""

    name: str
    payload: Dict[str, Any]
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    source: str = "runtime"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class EventSubscription:
    """Tracks one subscription for later unsubscription."""

    event_name: str
    handler_id: str
    handler: EventHandler


@dataclass(slots=True)
class EventDeliveryResult:
    """Captures delivery status for one handler execution."""

    event_id: str
    event_name: str
    handler_id: str
    success: bool
    error: str = ""


class EventBus:
    """Thread-safe synchronous event bus with delivery diagnostics.

    Design notes:
    - Synchronous delivery keeps ordering deterministic and debugging easier.
    - Handlers should avoid long blocking logic; they can enqueue background work.
    - Exceptions in one handler do not stop delivery to other handlers.
    """

    def __init__(self) -> None:
        self._handlers: Dict[str, Dict[str, EventHandler]] = {}
        self._lock = RLock()
        self._history: List[RuntimeEvent] = []
        self._delivery_log: List[EventDeliveryResult] = []
        self._history_limit = 500
        self._delivery_limit = 2000

    def subscribe(self, event_name: str, handler: EventHandler) -> EventSubscription:
        """Subscribe handler to event and return subscription token."""
        normalized = self._normalize_name(event_name)
        handler_id = str(uuid.uuid4())

        with self._lock:
            if normalized not in self._handlers:
                self._handlers[normalized] = {}
            self._handlers[normalized][handler_id] = handler

        return EventSubscription(event_name=normalized, handler_id=handler_id, handler=handler)

    def unsubscribe(self, subscription: EventSubscription) -> bool:
        """Remove an existing subscription."""
        normalized = self._normalize_name(subscription.event_name)
        with self._lock:
            by_event = self._handlers.get(normalized)
            if not by_event:
                return False
            if subscription.handler_id not in by_event:
                return False
            del by_event[subscription.handler_id]
            if not by_event:
                del self._handlers[normalized]
            return True

    def publish(self, event_name: str, payload: Dict[str, Any], source: str = "runtime") -> RuntimeEvent:
        """Publish event to all subscribers and capture delivery telemetry."""
        event = RuntimeEvent(
            name=self._normalize_name(event_name),
            payload=dict(payload),
            source=source,
        )

        handlers = self._copy_handlers(event.name)
        for handler_id, handler in handlers.items():
            result = self._deliver_one(handler_id=handler_id, handler=handler, event=event)
            self._append_delivery(result)

        self._append_history(event)
        return event

    def publish_error(self, error: Exception, context: Dict[str, Any] | None = None, source: str = "runtime") -> RuntimeEvent:
        """Convenience method for standardized error events."""
        payload = {
            "error_type": type(error).__name__,
            "message": str(error),
            "traceback": traceback.format_exc(),
            "context": dict(context or {}),
        }
        return self.publish(event_name="error_occurred", payload=payload, source=source)

    def has_subscribers(self, event_name: str) -> bool:
        normalized = self._normalize_name(event_name)
        with self._lock:
            return normalized in self._handlers and bool(self._handlers[normalized])

    def list_event_names(self) -> List[str]:
        with self._lock:
            names = list(self._handlers.keys())
        names.sort()
        return names

    def history(self, limit: int = 100) -> List[RuntimeEvent]:
        """Return recent published events, newest first."""
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._history)
        return list(reversed(rows[-limit:]))

    def delivery_log(self, limit: int = 200) -> List[EventDeliveryResult]:
        """Return recent delivery outcomes, newest first."""
        if limit <= 0:
            return []
        with self._lock:
            rows = list(self._delivery_log)
        return list(reversed(rows[-limit:]))

    def clear_history(self) -> None:
        with self._lock:
            self._history.clear()
            self._delivery_log.clear()

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            subscriber_count = sum(len(v) for v in self._handlers.values())
            return {
                "event_names": len(self._handlers),
                "subscribers": subscriber_count,
                "history_size": len(self._history),
                "delivery_log_size": len(self._delivery_log),
            }

    def _copy_handlers(self, event_name: str) -> Dict[str, EventHandler]:
        with self._lock:
            return dict(self._handlers.get(event_name, {}))

    def _deliver_one(self, handler_id: str, handler: EventHandler, event: RuntimeEvent) -> EventDeliveryResult:
        try:
            handler(event)
            return EventDeliveryResult(
                event_id=event.event_id,
                event_name=event.name,
                handler_id=handler_id,
                success=True,
            )
        except Exception as exc:  # noqa: BLE001
            return EventDeliveryResult(
                event_id=event.event_id,
                event_name=event.name,
                handler_id=handler_id,
                success=False,
                error=f"{type(exc).__name__}: {exc}",
            )

    def _append_history(self, event: RuntimeEvent) -> None:
        with self._lock:
            self._history.append(event)
            while len(self._history) > self._history_limit:
                self._history.pop(0)

    def _append_delivery(self, result: EventDeliveryResult) -> None:
        with self._lock:
            self._delivery_log.append(result)
            while len(self._delivery_log) > self._delivery_limit:
                self._delivery_log.pop(0)

    @staticmethod
    def _normalize_name(value: str) -> str:
        return value.strip().lower()


def _example_event_bus() -> None:
    bus = EventBus()

    def on_context_updated(event: RuntimeEvent) -> None:
        print(f"context_updated received: {event.payload}")

    def on_task_completed(event: RuntimeEvent) -> None:
        print(f"task_completed received: {event.payload}")

    bus.subscribe("context_updated", on_context_updated)
    bus.subscribe("task_completed", on_task_completed)

    bus.publish("context_updated", {"active_app": "vscode", "activity": "development"}, source="context")
    bus.publish("task_completed", {"task_id": "t1", "status": "ok"}, source="scheduler")

    print("Event bus stats:")
    print(bus.stats())


if __name__ == "__main__":
    _example_event_bus()

