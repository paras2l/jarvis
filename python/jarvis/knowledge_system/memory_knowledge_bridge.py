"""Integration bridge between Memory System and Knowledge System.

Handles bidirectional flow of knowledge between memory and knowledge graph.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from enum import Enum

# TYPE_CHECKING import
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from jarvis.knowledge_system.knowledge_core import KnowledgeCore


class MemoryType(str, Enum):
    """Types of memories that can be stored from knowledge."""

    ENTITY = "entity"
    RELATIONSHIP = "relationship"
    INSIGHT = "insight"
    PATTERN = "pattern"
    LEARNING = "learning"


@dataclass(slots=True)
class KnowledgeMemory:
    """A memory entry derived from knowledge system."""

    memory_id: str
    memory_type: MemoryType
    content: Dict[str, Any]
    importance: float
    created_at: str
    last_accessed: str
    access_count: int = 0
    tags: List[str] = None

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


class MemoryKnowledgeBridge:
    """Bridge between Memory System and Knowledge System.

    Handles conversion between knowledge representations and
    memory storage, and manages integration workflows.
    """

    def __init__(self, knowledge_core: KnowledgeCore, memory_system: Optional[Any] = None) -> None:
        self._knowledge = knowledge_core
        self._memory = memory_system
        self._export_buffer: List[KnowledgeMemory] = []

    def memorize_entity(self, entity_id: str, importance: float = 0.7) -> Optional[KnowledgeMemory]:
        """Convert entity to memory format and store.

        Integration point: Knowledge System → Memory System (short-term)
        """
        entity_info = self._knowledge.get_entity_info(entity_id)

        if not entity_info:
            return None

        memory = KnowledgeMemory(
            memory_id=f"knowledge:entity:{entity_id}",
            memory_type=MemoryType.ENTITY,
            content={
                "entity_id": entity_id,
                "label": entity_info.get("label", ""),
                "kind": entity_info.get("kind", ""),
                "properties": entity_info.get("properties", {}),
            },
            importance=importance,
            created_at=datetime.now(timezone.utc).isoformat(),
            last_accessed=datetime.now(timezone.utc).isoformat(),
            tags=[entity_info.get("kind", ""), "knowledge_entity"],
        )

        # Store in memory system if available
        if self._memory:
            try:
                self._memory.remember_short_term(
                    key=memory.memory_id,
                    value=memory.content,
                    tags=memory.tags,
                )
            except Exception:
                pass

        return memory

    def memorize_relationships(
        self, entity_id: str, importance: float = 0.6
    ) -> List[KnowledgeMemory]:
        """Memorize relationships for an entity.

        Integration point: Knowledge System → Memory System
        """
        entity_info = self._knowledge.get_entity_info(entity_id)

        if not entity_info:
            return []

        memories: List[KnowledgeMemory] = []

        # Memorize incoming relationships
        for rel in entity_info.get("incoming_relations", [])[:5]:  # Top 5
            memory = KnowledgeMemory(
                memory_id=f"knowledge:relation:{rel.get('relation_id', 'unknown')}",
                memory_type=MemoryType.RELATIONSHIP,
                content={
                    "from_entity_id": rel.get("from_entity_id", ""),
                    "to_entity_id": entity_id,
                    "relation_type": rel.get("relation_type", ""),
                    "confidence": rel.get("confidence", 0.5),
                },
                importance=importance * rel.get("confidence", 0.5),
                created_at=datetime.now(timezone.utc).isoformat(),
                last_accessed=datetime.now(timezone.utc).isoformat(),
                tags=["knowledge_relationship", rel.get("relation_type", "")],
            )
            memories.append(memory)

            # Store in memory system
            if self._memory:
                try:
                    self._memory.remember_short_term(
                        key=memory.memory_id,
                        value=memory.content,
                        tags=memory.tags,
                    )
                except Exception:
                    pass

        return memories

    def memorize_insights(self, insights: Dict[str, Any], importance: float = 0.8) -> Optional[KnowledgeMemory]:
        """Memorize high-level insights from knowledge.

        Integration point: Knowledge System → Memory System (important insights)
        """
        if not insights:
            return None

        memory = KnowledgeMemory(
            memory_id=f"knowledge:insight:{datetime.now().timestamp()}",
            memory_type=MemoryType.INSIGHT,
            content={
                "insight_text": insights.get("text", ""),
                "entities_involved": insights.get("entities", []),
                "confidence": insights.get("confidence", 0.7),
                "source": insights.get("source", "knowledge_system"),
            },
            importance=importance,
            created_at=datetime.now(timezone.utc).isoformat(),
            last_accessed=datetime.now(timezone.utc).isoformat(),
            tags=["knowledge_insight", "high_importance"],
        )

        # Always store important insights
        if self._memory:
            try:
                self._memory.remember_long_term(
                    key=memory.memory_id,
                    value=memory.content,
                    source="knowledge_system",
                    importance=importance,
                    tags=memory.tags,
                )
            except Exception:
                pass

        return memory

    def recall_memories_as_knowledge(self, query: str) -> Dict[str, Any]:
        """Recall memories and present as knowledge context.

        Integration point: Memory System → Knowledge System
        """
        if not self._memory:
            return {"success": False, "message": "No memory system available"}

        try:
            # Recall from memory
            short_term = self._memory.recall_short_term(query)
            long_term = self._memory.recall_long_term(query)

            # Convert memories back to knowledge format
            entities = []
            relationships = []

            for memory in short_term + long_term:
                if isinstance(memory, dict):
                    if memory.get("type") == MemoryType.ENTITY.value:
                        entities.append(memory.get("content", {}))
                    elif memory.get("type") == MemoryType.RELATIONSHIP.value:
                        relationships.append(memory.get("content", {}))

            return {
                "success": True,
                "source": "memory_recall",
                "entities": entities,
                "relationships": relationships,
                "memory_count": len(short_term) + len(long_term),
            }

        except Exception as e:
            return {"success": False, "message": f"Memory recall failed: {str(e)}"}

    def consolidate_knowledge_memories(self) -> Dict[str, Any]:
        """Consolidate knowledge memories with current knowledge graph.

        Integration point: Self-Improvement → Knowledge System ↔ Memory System
        """
        if not self._memory:
            return {"success": False, "message": "No memory system available"}

        try:
            # Get consolidation from knowledge system
            consolidation = self._knowledge.consolidate()

            # Log consolidation in memory
            self._memory.remember_long_term(
                key="knowledge:consolidation_log",
                value={
                    "consolidated_count": consolidation.get("consolidated_count", 0),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
                source="knowledge_core",
                importance=0.6,
                tags=["consolidation", "maintenance"],
            )

            return {
                "success": True,
                "consolidated_count": consolidation.get("consolidated_count", 0),
            }

        except Exception as e:
            return {"success": False, "message": f"Consolidation failed: {str(e)}"}

    def export_knowledge_snapshot(self) -> Dict[str, Any]:
        """Export knowledge snapshot for memory/archival.

        Integration point: Knowledge System → Memory System (periodic export)
        """
        snapshot = self._knowledge.get_snapshot()

        export_data = {
            "timestamp": snapshot.timestamp,
            "entity_count": snapshot.entity_count,
            "relationship_count": snapshot.relationship_count,
            "entity_kinds": snapshot.entity_kinds,
            "relation_types": snapshot.relation_types,
            "health_status": snapshot.health_status,
        }

        # Store snapshot in buffer for later retrieval
        self._export_buffer.append(
            KnowledgeMemory(
                memory_id=f"knowledge:snapshot:{snapshot.timestamp}",
                memory_type=MemoryType.LEARNING,
                content=export_data,
                importance=0.5,
                created_at=snapshot.timestamp,
                last_accessed=datetime.now(timezone.utc).isoformat(),
                tags=["knowledge_snapshot", "diagnostics"],
            )
        )

        # Keep only last 10 snapshots
        if len(self._export_buffer) > 10:
            self._export_buffer.pop(0)

        return export_data

    def get_memory_integrations_status(self) -> Dict[str, Any]:
        """Get status of knowledge-memory integrations."""
        return {
            "memory_system_available": self._memory is not None,
            "export_buffer_size": len(self._export_buffer),
            "export_buffer_items": [
                {
                    "memory_id": m.memory_id,
                    "type": m.memory_type.value,
                    "importance": m.importance,
                }
                for m in self._export_buffer
            ],
        }
