"""Context Engine adapter compatible with core contracts.

This wrapper keeps older imports stable while delegating to the full
ContextManager implementation.
"""

from __future__ import annotations

from jarvis.core.contracts import ContextProvider, ContextSnapshot
from jarvis.core.context.context_manager import ContextManager


class ContextEngine(ContextProvider):
    """Builds a structured snapshot of current environment state."""

    def __init__(self, interval_seconds: float = 3.0) -> None:
        self._manager = ContextManager(scan_interval_seconds=interval_seconds)
        self._manager.start()

    def collect(self) -> ContextSnapshot:
        context = self._manager.get_context()
        env = context.environment
        return ContextSnapshot(
            current_application=str(env.get("primary_application", "unknown")),
            user_activity=context.inferred_user_activity,
            time_of_day=str(env.get("time_of_day", "unknown")),
            signals={
                "system_time_iso": env.get("system_time_iso"),
                "active_applications": env.get("active_applications", []),
                "system_metrics": env.get("system_metrics", {}),
                "recent_user_actions": context.recent_user_actions,
                "health": context.health,
            },
        )

    def record_action(self, action_type: str, description: str, source: str = "runtime") -> None:
        """Optional helper so other modules can enrich context behavior."""
        self._manager.record_user_action(
            action_type=action_type,
            description=description,
            source=source,
        )

    def shutdown(self) -> None:
        """Stop background context loop."""
        self._manager.stop()
