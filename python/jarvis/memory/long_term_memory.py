"""Long-term memory for Jarvis.

Long-term memory persists structured knowledge records to local disk and
supports key-based, tag-based, and text-based retrieval.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from pathlib import Path
from threading import RLock
from typing import Any, Dict, Iterable, List


@dataclass(slots=True)
class LongTermMemoryRecord:
    """Persisted memory record stored as JSON line."""

    key: str
    value: Dict[str, Any]
    source: str
    importance: float
    created_at: str
    updated_at: str
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "key": self.key,
            "value": dict(self.value),
            "source": self.source,
            "importance": self.importance,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "tags": list(self.tags),
        }

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "LongTermMemoryRecord":
        return LongTermMemoryRecord(
            key=str(data.get("key", "")),
            value=dict(data.get("value", {})),
            source=str(data.get("source", "unknown")),
            importance=float(data.get("importance", 0.5)),
            created_at=str(data.get("created_at", "")),
            updated_at=str(data.get("updated_at", "")),
            tags=[str(tag) for tag in data.get("tags", [])],
        )


class LongTermMemory:
    """Persistent long-term memory backed by JSONL file storage."""

    def __init__(self, storage_path: str | Path = "python/.jarvis_long_term_memory.jsonl") -> None:
        self._path = Path(storage_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._index: Dict[str, LongTermMemoryRecord] = {}
        self._load_from_disk()

    def store(
        self,
        key: str,
        value: Dict[str, Any],
        *,
        source: str = "jarvis",
        importance: float = 0.5,
        tags: Iterable[str] | None = None,
    ) -> LongTermMemoryRecord:
        """Insert or update a long-term memory record."""
        now = datetime.now(timezone.utc).isoformat()
        normalized_importance = self._clamp_importance(importance)

        with self._lock:
            existing = self._index.get(key)
            created_at = existing.created_at if existing else now
            merged_tags = self._merge_tags(existing.tags if existing else [], tags or [])

            record = LongTermMemoryRecord(
                key=key,
                value=dict(value),
                source=source,
                importance=normalized_importance,
                created_at=created_at,
                updated_at=now,
                tags=merged_tags,
            )

            self._index[key] = record
            self._flush_to_disk()
            return record

    def fetch(self, key: str) -> Dict[str, Any] | None:
        """Fetch record value by key."""
        with self._lock:
            item = self._index.get(key)
            if item is None:
                return None
            return dict(item.value)

    def fetch_record(self, key: str) -> LongTermMemoryRecord | None:
        with self._lock:
            return self._index.get(key)

    def delete(self, key: str) -> bool:
        with self._lock:
            if key not in self._index:
                return False
            del self._index[key]
            self._flush_to_disk()
            return True

    def list_records(self, limit: int = 100, order_by: str = "updated_desc") -> List[LongTermMemoryRecord]:
        """List memory records with deterministic ordering options."""
        with self._lock:
            records = list(self._index.values())

        if order_by == "importance_desc":
            records.sort(key=lambda item: item.importance, reverse=True)
        elif order_by == "created_desc":
            records.sort(key=lambda item: item.created_at, reverse=True)
        else:
            records.sort(key=lambda item: item.updated_at, reverse=True)

        return records[: max(1, limit)]

    def find_by_tags(self, tags: Iterable[str], limit: int = 50) -> List[LongTermMemoryRecord]:
        """Find records that contain all provided tags."""
        wanted = {entry.strip().lower() for entry in tags if entry.strip()}
        if not wanted:
            return []

        with self._lock:
            out: List[LongTermMemoryRecord] = []
            for item in self._index.values():
                existing = {tag.lower() for tag in item.tags}
                if wanted.issubset(existing):
                    out.append(item)

        out.sort(key=lambda row: (row.importance, row.updated_at), reverse=True)
        return out[: max(1, limit)]

    def search_text(self, query: str, limit: int = 20) -> List[LongTermMemoryRecord]:
        """Simple lexical search over key/value content."""
        tokens = [entry.lower() for entry in query.split() if entry.strip()]
        if not tokens:
            return []

        scored: List[tuple[float, LongTermMemoryRecord]] = []
        with self._lock:
            for item in self._index.values():
                blob = self._stringify(item).lower()
                hits = sum(1 for token in tokens if token in blob)
                if hits == 0:
                    continue
                score = float(hits) + item.importance
                scored.append((score, item))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        return [item for _, item in scored[: max(1, limit)]]

    def upsert_fact(
        self,
        subject: str,
        fact: str,
        *,
        source: str = "jarvis",
        confidence: float = 0.7,
        tags: Iterable[str] | None = None,
    ) -> LongTermMemoryRecord:
        """Convenience API for storing factual knowledge."""
        key = f"fact:{subject.strip().lower().replace(' ', '_')}"
        payload = {
            "subject": subject,
            "fact": fact,
            "confidence": self._clamp_importance(confidence),
        }
        return self.store(
            key=key,
            value=payload,
            source=source,
            importance=confidence,
            tags=list(tags or []) + ["fact"],
        )

    def export_json(self) -> List[Dict[str, Any]]:
        with self._lock:
            return [item.to_dict() for item in self._index.values()]

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            total = len(self._index)
            by_source: Dict[str, int] = {}
            for item in self._index.values():
                by_source[item.source] = by_source.get(item.source, 0) + 1
            return {
                "records": total,
                "storage_path": str(self._path),
                "sources": by_source,
            }

    def _load_from_disk(self) -> None:
        if not self._path.exists():
            self._path.touch()
            return

        with self._path.open("r", encoding="utf-8") as handle:
            for raw_line in handle:
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    record = LongTermMemoryRecord.from_dict(data)
                    if record.key:
                        self._index[record.key] = record
                except json.JSONDecodeError:
                    # Keep loading valid records even if a line is corrupted.
                    continue

    def _flush_to_disk(self) -> None:
        rows = [item.to_dict() for item in self._index.values()]
        rows.sort(key=lambda row: row["updated_at"])
        with self._path.open("w", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    @staticmethod
    def _clamp_importance(value: float) -> float:
        return round(min(1.0, max(0.0, float(value))), 4)

    @staticmethod
    def _merge_tags(existing: Iterable[str], incoming: Iterable[str]) -> List[str]:
        seen: set[str] = set()
        out: List[str] = []
        for tag in list(existing) + list(incoming):
            normalized = tag.strip().lower()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            out.append(normalized)
        return out

    @staticmethod
    def _stringify(record: LongTermMemoryRecord) -> str:
        return json.dumps(
            {
                "key": record.key,
                "value": record.value,
                "source": record.source,
                "tags": record.tags,
            },
            ensure_ascii=True,
            sort_keys=True,
        )


def _example_long_term() -> None:
    memory = LongTermMemory(storage_path="python/.jarvis_long_term_memory.example.jsonl")

    memory.store(
        key="project:jarvis:vision",
        value={
            "statement": "Build a hybrid local-cloud intelligence runtime",
            "status": "active",
        },
        source="docs",
        importance=0.9,
        tags=["project", "vision"],
    )

    memory.upsert_fact(
        subject="Jarvis architecture",
        fact="Uses context, planner, orchestrator, skills, and memory engines.",
        source="system",
        confidence=0.85,
        tags=["architecture", "core"],
    )

    print("Long-Term Memory Example")
    print("Fetch by key:")
    print(memory.fetch("project:jarvis:vision"))

    print("\nSearch text 'architecture core':")
    for item in memory.search_text("architecture core"):
        print(f"- {item.key}: {item.value}")

    print("\nFind by tags ['project']:")
    for item in memory.find_by_tags(["project"]):
        print(f"- {item.key} tags={item.tags}")

    print("\nStats:")
    print(memory.stats())


if __name__ == "__main__":
    _example_long_term()
