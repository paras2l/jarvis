"""Context manager orchestrating periodic context updates."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from threading import Event, Lock, Thread
import time
from typing import Any, Dict, List

from Pixi.core.context.activity_tracker import ActivityTracker
from Pixi.core.context.environment_scanner import EnvironmentScanner

@dataclass(slots=True)
class ContextObject:
    context_id: int
    updated_at_epoch_ms: int
    environment: Dict[str, Any]
    recent_user_actions: List[Dict[str, Any]]
    inferred_user_activity: str
    health: Dict[str, Any] = field(default_factory=dict)


class ContextManager:
    """Runs periodic scans and maintains latest context state."""

    def __init__(
        self,
        scan_interval_seconds: float = 3.0,
        recent_action_limit: int = 25,
        scanner: EnvironmentScanner | None = None,
        tracker: ActivityTracker | None = None,
    ) -> None:
        self._scan_interval_seconds = max(1.0, float(scan_interval_seconds))
        self._recent_action_limit = max(1, int(recent_action_limit))

        self._scanner = scanner or EnvironmentScanner()
        self._tracker = tracker or ActivityTracker()

        self._context_lock = Lock()
        self._context_sequence = 0
        self._current_context: ContextObject | None = None

        self._stop_event = Event()
        self._thread: Thread | None = None

    @property
    def tracker(self) -> ActivityTracker:
        return self._tracker

    def start(self) -> None:
        """Start periodic context update loop."""
        if self.is_running():
            return

        self._stop_event.clear()
        self._thread = Thread(
            target=self._run_loop,
            name="Pixi-context-manager",
            daemon=True,
        )
        self._thread.start()

    def stop(self, timeout_seconds: float = 5.0) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=max(0.1, timeout_seconds))

    def is_running(self) -> bool:
        thread = self._thread
        return bool(thread and thread.is_alive())

    def get_context(self) -> ContextObject:
        with self._context_lock:
            if self._current_context is not None:
                return self._current_context

        return self.update_once()

    def get_context_as_dict(self) -> Dict[str, Any]:
        context = self.get_context()
        return asdict(context)

    def update_once(self) -> ContextObject:
        """Run one scan-update cycle synchronously and return new context."""
        started_at_ms = int(time.time() * 1000)

        env = self._scanner.scan()
        recent_actions = self._tracker.recent_actions_as_dict(limit=self._recent_action_limit)
        inferred_activity = self._tracker.infer_user_activity(lookback_limit=self._recent_action_limit)

        self._context_sequence += 1
        context = ContextObject(
            context_id=self._context_sequence,
            updated_at_epoch_ms=int(time.time() * 1000),
            environment={
                "active_applications": env.active_applications,
                "primary_application": env.primary_application,
                "system_time_iso": env.system_time_iso,
                "local_timezone": env.local_timezone,
                "weekday": env.weekday,
                "time_of_day": env.time_of_day,
                "system_metrics": asdict(env.metrics),
                "scan_warnings": env.scan_warnings,
            },
            recent_user_actions=recent_actions,
            inferred_user_activity=inferred_activity,
            health={
                "loop_running": self.is_running(),
                "scan_interval_seconds": self._scan_interval_seconds,
                "scan_duration_ms": int(time.time() * 1000) - started_at_ms,
            },
        )

        with self._context_lock:
            self._current_context = context

        return context

    def record_user_action(
        self,
        action_type: str,
        description: str,
        source: str = "runtime",
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        """Convenience proxy to activity tracker."""
        self._tracker.record_action(
            action_type=action_type,
            description=description,
            source=source,
            metadata=metadata,
        )

    def _run_loop(self) -> None:
        """Background periodic loop."""
        while not self._stop_event.is_set():
            try:
                self.update_once()
            except Exception as exc:  # noqa: BLE001
                self._record_internal_error(exc)
            self._stop_event.wait(self._scan_interval_seconds)

    def _record_internal_error(self, exc: Exception) -> None:
        self._tracker.record_action(
            action_type="context_error",
            description=f"Context loop error: {type(exc).__name__}",
            source="context_manager",
            metadata={"message": str(exc)},
        )

        with self._context_lock:
            if self._current_context is None:
                self._context_sequence += 1
                self._current_context = ContextObject(
                    context_id=self._context_sequence,
                    updated_at_epoch_ms=int(time.time() * 1000),
                    environment={
                        "active_applications": [],
                        "primary_application": "unknown",
                        "system_time_iso": datetime.now(timezone.utc).isoformat(),
                        "local_timezone": "UTC",
                        "weekday": datetime.now(timezone.utc).strftime("%A"),
                        "time_of_day": "unknown",
                        "system_metrics": {
                            "cpu_percent": -1.0,
                            "memory_percent": -1.0,
                            "load_1m": None,
                            "process_count": -1,
                            "collected_at_epoch_ms": int(time.time() * 1000),
                        },
                        "scan_warnings": ["initial_context_failed"],
                    },
                    recent_user_actions=self._tracker.recent_actions_as_dict(limit=self._recent_action_limit),
                    inferred_user_activity="unknown",
                    health={
                        "loop_running": self.is_running(),
                        "error": f"{type(exc).__name__}: {exc}",
                    },
                )
            else:
                self._current_context.health["last_error"] = f"{type(exc).__name__}: {exc}"


def _example_usage() -> None:
    """Executable example showing how to run the context engine."""
    manager = ContextManager(scan_interval_seconds=2.0)
    manager.start()

    manager.record_user_action("chat_message", "User asked for market summary", source="ui")
    manager.record_user_action("voice_command", "Create tutorial outline", source="voice")

    time.sleep(4.5)

    snapshot = manager.get_context_as_dict()
    print("=== Context Snapshot ===")
    print(f"context_id: {snapshot['context_id']}")
    print(f"updated_at_epoch_ms: {snapshot['updated_at_epoch_ms']}")
    print(f"primary_application: {snapshot['environment']['primary_application']}")
    print(f"time_of_day: {snapshot['environment']['time_of_day']}")
    print(f"inferred_user_activity: {snapshot['inferred_user_activity']}")
    print("recent_user_actions:")
    for item in snapshot["recent_user_actions"]:
        print(f"  - {item['action_type']} ({item['source']}): {item['description']}")

    manager.stop()


if __name__ == "__main__":
    _example_usage()

