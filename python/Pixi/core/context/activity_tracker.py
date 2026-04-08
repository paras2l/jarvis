"""Recent activity tracker for Pixi Context Engine."""

from __future__ import annotations

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from threading import Lock
import time
from typing import Any, Deque, Dict, Iterable, List


@dataclass(slots=True)
class UserAction:
    """One user/runtime action record."""

    action_type: str
    description: str
    source: str
    metadata: Dict[str, Any]
    created_at_epoch_ms: int

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ActivityTracker:
    """Thread-safe in-memory activity tracker."""

    def __init__(self, max_actions: int = 500) -> None:
        self._actions: Deque[UserAction] = deque(maxlen=max(10, max_actions))
        self._lock = Lock()

    def record_action(
        self,
        action_type: str,
        description: str,
        source: str = "runtime",
        metadata: Dict[str, Any] | None = None,
    ) -> UserAction:
        """Record a single action and return the created object."""
        action = UserAction(
            action_type=action_type.strip() or "unknown",
            description=description.strip() or "no description",
            source=source.strip() or "runtime",
            metadata=metadata or {},
            created_at_epoch_ms=int(time.time() * 1000),
        )
        with self._lock:
            self._actions.append(action)
        return action

    def record_batch(self, actions: Iterable[Dict[str, Any]], source: str = "runtime") -> int:
        """Record multiple actions and return inserted count."""
        inserted = 0
        for item in actions:
            action_type = str(item.get("action_type", "unknown"))
            description = str(item.get("description", "no description"))
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            self.record_action(
                action_type=action_type,
                description=description,
                source=str(item.get("source", source)),
                metadata=metadata,
            )
            inserted += 1
        return inserted

    def recent_actions(self, limit: int = 20) -> List[UserAction]:
        """Return latest actions in reverse chronological order."""
        with self._lock:
            data = list(self._actions)
        if not data:
            return []
        return list(reversed(data[-max(1, limit) :]))

    def recent_actions_as_dict(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Return latest actions as serializable dictionaries."""
        return [action.to_dict() for action in self.recent_actions(limit=limit)]

    def clear(self) -> None:
        """Clear all stored actions."""
        with self._lock:
            self._actions.clear()

    def infer_user_activity(self, lookback_limit: int = 30) -> str:
        """Infer a coarse-grained current activity label."""
        actions = self.recent_actions(limit=lookback_limit)
        if not actions:
            return "idle"

        score = {
            "development": 0,
            "research": 0,
            "communication": 0,
            "automation": 0,
        }

        for action in actions:
            text = f"{action.action_type} {action.description}".lower()
            if any(k in text for k in ("code", "build", "debug", "commit", "deploy", "terminal")):
                score["development"] += 1
            if any(k in text for k in ("search", "read", "research", "summarize", "analyze")):
                score["research"] += 1
            if any(k in text for k in ("email", "message", "chat", "call", "reply")):
                score["communication"] += 1
            if any(k in text for k in ("run", "execute", "automation", "workflow", "task")):
                score["automation"] += 1

        dominant = max(score, key=score.get)
        if score[dominant] == 0:
            return "general_usage"
        return dominant

    def summarize_recent_actions(self, limit: int = 10) -> str:
        """Generate a short human-readable timeline summary."""
        actions = self.recent_actions(limit=limit)
        if not actions:
            return "No recent user actions recorded."

        lines: List[str] = []
        for action in reversed(actions):
            dt = datetime.fromtimestamp(action.created_at_epoch_ms / 1000, tz=timezone.utc)
            stamp = dt.strftime("%H:%M:%S")
            lines.append(f"{stamp}Z [{action.source}] {action.action_type}: {action.description}")

        return " | ".join(lines)

