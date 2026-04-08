"""Short-term memory for Pixi.

Short-term memory holds volatile conversational and task context. It is optimized
for fast read/write operations and recent-window retrieval.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, List


@dataclass(slots=True)
class ShortTermMemoryItem:
    """One short-term memory item."""

    key: str
    value: Dict[str, Any]
    created_at: str
    expires_at: str
    tags: List[str] = field(default_factory=list)

    def is_expired(self, now: datetime) -> bool:
        try:
            expiry = datetime.fromisoformat(self.expires_at)
        except ValueError:
            return False
        return now >= expiry


class ShortTermMemory:
    """Thread-safe short-term memory with TTL and recency retrieval."""

    def __init__(self, ttl_minutes: int = 60, max_items: int = 500) -> None:
        self._ttl_minutes = max(1, ttl_minutes)
        self._max_items = max(10, max_items)
        self._store: Dict[str, ShortTermMemoryItem] = {}
        self._order: List[str] = []
        self._lock = RLock()

    def put(self, key: str, value: Dict[str, Any], tags: List[str] | None = None) -> ShortTermMemoryItem:
        """Store a short-lived memory item."""
        now = datetime.now(timezone.utc)
        expires = now + timedelta(minutes=self._ttl_minutes)

        item = ShortTermMemoryItem(
            key=key,
            value=dict(value),
            created_at=now.isoformat(),
            expires_at=expires.isoformat(),
            tags=list(tags or []),
        )

        with self._lock:
            self._store[key] = item
            self._touch(key)
            self._evict_if_needed()
        return item

    def get(self, key: str) -> Dict[str, Any] | None:
        """Get a short-term memory by key, returning None if missing/expired."""
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            now = datetime.now(timezone.utc)
            if item.is_expired(now):
                self._delete_unlocked(key)
                return None

            self._touch(key)
            return dict(item.value)

    def has(self, key: str) -> bool:
        return self.get(key) is not None

    def delete(self, key: str) -> bool:
        with self._lock:
            if key not in self._store:
                return False
            self._delete_unlocked(key)
            return True

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._order.clear()

    def touch(self, key: str, extend_minutes: int | None = None) -> bool:
        """Refresh recency and optionally extend expiration."""
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return False

            now = datetime.now(timezone.utc)
            if item.is_expired(now):
                self._delete_unlocked(key)
                return False

            self._touch(key)
            if extend_minutes is not None and extend_minutes > 0:
                expiry = now + timedelta(minutes=extend_minutes)
                item.expires_at = expiry.isoformat()
            return True

    def get_recent(self, limit: int = 20, include_expired: bool = False) -> List[ShortTermMemoryItem]:
        """Return most recently used items first."""
        if limit <= 0:
            return []

        with self._lock:
            now = datetime.now(timezone.utc)
            keys = list(reversed(self._order))
            out: List[ShortTermMemoryItem] = []
            for key in keys:
                item = self._store.get(key)
                if item is None:
                    continue

                expired = item.is_expired(now)
                if expired and not include_expired:
                    continue
                out.append(item)
                if len(out) >= limit:
                    break
            return out

    def list_by_tag(self, tag: str, limit: int = 50) -> List[ShortTermMemoryItem]:
        """Filter memory items by tag."""
        if not tag:
            return []

        normalized = tag.strip().lower()
        with self._lock:
            now = datetime.now(timezone.utc)
            out: List[ShortTermMemoryItem] = []
            for key in reversed(self._order):
                item = self._store.get(key)
                if item is None:
                    continue
                if item.is_expired(now):
                    continue
                if normalized in [entry.lower() for entry in item.tags]:
                    out.append(item)
                if len(out) >= limit:
                    break
            return out

    def prune_expired(self) -> int:
        """Remove expired entries and return how many were removed."""
        with self._lock:
            now = datetime.now(timezone.utc)
            stale_keys: List[str] = []
            for key, item in self._store.items():
                if item.is_expired(now):
                    stale_keys.append(key)

            for key in stale_keys:
                self._delete_unlocked(key)
            return len(stale_keys)

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "ttl_minutes": self._ttl_minutes,
                "max_items": self._max_items,
                "stored_items": len(self._store),
                "order_size": len(self._order),
            }

    def dump(self) -> List[Dict[str, Any]]:
        """Export current non-expired items as dictionaries."""
        with self._lock:
            now = datetime.now(timezone.utc)
            rows: List[Dict[str, Any]] = []
            for key in self._order:
                item = self._store.get(key)
                if item is None or item.is_expired(now):
                    continue
                rows.append(
                    {
                        "key": item.key,
                        "value": dict(item.value),
                        "created_at": item.created_at,
                        "expires_at": item.expires_at,
                        "tags": list(item.tags),
                    }
                )
            return rows

    def _touch(self, key: str) -> None:
        if key in self._order:
            self._order.remove(key)
        self._order.append(key)

    def _delete_unlocked(self, key: str) -> None:
        self._store.pop(key, None)
        if key in self._order:
            self._order.remove(key)

    def _evict_if_needed(self) -> None:
        while len(self._order) > self._max_items:
            oldest_key = self._order.pop(0)
            self._store.pop(oldest_key, None)


def _example_short_term() -> None:
    memory = ShortTermMemory(ttl_minutes=30, max_items=20)

    memory.put(
        key="session:last_goal",
        value={"goal": "Create launch content calendar", "status": "in_progress"},
        tags=["session", "planning"],
    )
    memory.put(
        key="session:current_task",
        value={"task": "Draft week-1 posts", "owner": "CreativeAgent"},
        tags=["session", "creative"],
    )

    print("Short-Term Memory Example")
    print("Retrieve by key:")
    print(memory.get("session:last_goal"))

    print("\nRecent items:")
    for item in memory.get_recent(limit=5):
        print(f"- {item.key}: {item.value}")

    print("\nBy tag 'session':")
    for item in memory.list_by_tag("session"):
        print(f"- {item.key} tags={item.tags}")

    print("\nStats:")
    print(memory.stats())


if __name__ == "__main__":
    _example_short_term()

