"""Unified Memory System facade for Pixi.

Combines:
- short-term memory (session/working state)
- long-term memory (persistent records)
- vector memory (semantic search)
"""

from __future__ import annotations

from typing import Any, Dict

from Pixi.core.contracts import MemoryStore
from Pixi.memory.long_term_memory import LongTermMemory
from Pixi.memory.short_term_memory import ShortTermMemory
from Pixi.memory.vector_memory import VectorMemory, VectorSearchResult


class MemorySystem(MemoryStore):
    """Application-level memory facade."""

    def __init__(self) -> None:
        self.short_term = ShortTermMemory(ttl_minutes=120, max_items=1000)
        self.long_term = LongTermMemory()
        self.vector_memory = VectorMemory()

    def save(self, key: str, value: Dict[str, Any]) -> None:
        # Keep compatibility with MemoryStore while upgrading internals.
        self.short_term.put(key=key, value=value, tags=["compat"])
        self.long_term.store(
            key=key,
            value=value,
            source="memory_system.save",
            importance=0.6,
            tags=["compat"],
        )

        text_repr = self._to_semantic_text(key, value)
        self.vector_memory.add_text(
            doc_id=f"kv:{key}",
            text=text_repr,
            metadata={"key": key, "source": "memory_system.save"},
        )

    def get(self, key: str) -> Dict[str, Any] | None:
        recent = self.short_term.get(key)
        if recent is not None:
            return recent
        return self.long_term.fetch(key)

    def remember_short_term(self, key: str, value: Dict[str, Any], tags: list[str] | None = None) -> None:
        self.short_term.put(key=key, value=value, tags=tags or ["short_term"])

    def remember_long_term(
        self,
        key: str,
        value: Dict[str, Any],
        *,
        source: str = "Pixi",
        importance: float = 0.7,
        tags: list[str] | None = None,
    ) -> None:
        self.long_term.store(
            key=key,
            value=value,
            source=source,
            importance=importance,
            tags=tags or ["long_term"],
        )

    def remember_semantic(
        self,
        doc_id: str,
        text: str,
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        self.vector_memory.add_text(doc_id=doc_id, text=text, metadata=metadata or {})

    def semantic_search(self, query: str, top_k: int = 5) -> list[VectorSearchResult]:
        return self.vector_memory.semantic_search(query=query, top_k=top_k)

    def stats(self) -> Dict[str, Any]:
        return {
            "short_term": self.short_term.stats(),
            "long_term": self.long_term.stats(),
            "vector_memory": {
                "backend": self.vector_memory.backend,
                "count": self.vector_memory.count(),
            },
        }

    @staticmethod
    def _to_semantic_text(key: str, value: Dict[str, Any]) -> str:
        fields = ", ".join(f"{k}={v}" for k, v in value.items())
        return f"memory key {key}; payload {fields}"


def _example_memory_system() -> None:
    memory = MemorySystem()

    memory.remember_short_term(
        key="session:active_goal",
        value={"goal": "Ship Pixi memory layer", "status": "in_progress"},
        tags=["session", "planner"],
    )
    memory.remember_long_term(
        key="project:Pixi:principle",
        value={"principle": "Prefer modular engines with clean contracts."},
        source="architecture",
        importance=0.9,
        tags=["architecture", "core"],
    )
    memory.remember_semantic(
        doc_id="knowledge:memory:1",
        text="Vector memory enables semantic retrieval beyond exact keyword matches.",
        metadata={"topic": "memory"},
    )

    print("Memory System Example")
    print("get('session:active_goal') ->", memory.get("session:active_goal"))

    print("Semantic search for 'semantic retrieval':")
    for item in memory.semantic_search("semantic retrieval", top_k=3):
        print(f"- {item.doc_id} score={item.score}")

    print("Stats:")
    print(memory.stats())


if __name__ == "__main__":
    _example_memory_system()

