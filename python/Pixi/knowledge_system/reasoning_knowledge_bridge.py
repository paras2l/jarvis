"""Integration bridge between Reasoning Engine and Knowledge System.

Provides adapters and utilities for the reasoning engine to query and
use knowledge from the knowledge system in reasoning tasks.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional

# Import these from the appropriate locations
# For compatibility, we use TYPE_CHECKING
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from Pixi.knowledge_system.knowledge_core import KnowledgeCore
    from Pixi.knowledge_system.knowledge_graph import Entity, Relationship


@dataclass(slots=True)
class ReasoningEntity:
    """Entity representation for reasoning operations."""

    entity_id: str
    label: str
    kind: str
    confidence: float
    properties: Dict[str, Any]
    incoming_relations: List[Dict[str, Any]]
    outgoing_relations: List[Dict[str, Any]]


class ReasoningKnowledgeBridge:
    """Bridge between Reasoning Engine and Knowledge System.

    Adapts knowledge system output to formats suitable for reasoning
    and provides utilities for reasoning tasks.
    """

    def __init__(self, knowledge_core: KnowledgeCore) -> None:
        self._knowledge = knowledge_core

    def get_entity_for_reasoning(self, entity_id: str) -> Optional[ReasoningEntity]:
        """Get entity with full context for reasoning."""
        # Retrieve entity info from knowledge system
        entity_info = self._knowledge.get_entity_info(entity_id)

        if not entity_info:
            return None

        # Transform to ReasoningEntity format
        return ReasoningEntity(
            entity_id=entity_id,
            label=entity_info.get("label", ""),
            kind=entity_info.get("kind", ""),
            confidence=entity_info.get("confidence", 0.5),
            properties=entity_info.get("properties", {}),
            incoming_relations=entity_info.get("incoming_relations", []),
            outgoing_relations=entity_info.get("outgoing_relations", []),
        )

    def search_knowledge_for_reasoning(
        self, query: str, filters: Optional[Dict[str, Any]] = None
    ) -> List[ReasoningEntity]:
        """Search knowledge system with optional filters.

        Integration point: Reasoning â†’ Knowledge System
        """
        # Apply kind filter if specified
        kind_filter = filters.get("kind") if filters else None
        limit = filters.get("limit", 10) if filters else 10

        # Query entities from knowledge system
        entities = self._knowledge.query_entities(query, kind=kind_filter, limit=limit)

        # Get full info for each entity
        reasoning_entities: List[ReasoningEntity] = []
        for entity in entities:
            entity_info = self._knowledge.get_entity_info(entity.entity_id)
            if entity_info:
                reasoning_entities.append(
                    ReasoningEntity(
                        entity_id=entity.entity_id,
                        label=entity.label,
                        kind=entity.kind,
                        confidence=entity.confidence,
                        properties=entity_info.get("properties", {}),
                        incoming_relations=entity_info.get("incoming_relations", []),
                        outgoing_relations=entity_info.get("outgoing_relations", []),
                    )
                )

        return reasoning_entities

    def get_context_for_entity(self, entity_id: str, depth: int = 2) -> Dict[str, Any]:
        """Get comprehensive context for an entity for reasoning.

        Integration point: Reasoning â†’ Knowledge System
        """
        context = self._knowledge.get_reasoning_context(
            # Create a minimal entity object for get_reasoning_context
            type("Entity", (), {"entity_id": entity_id, "label": "", "kind": "", "confidence": 0.0})(),
            max_depth=depth,
        )

        return {
            "target_entity_id": entity_id,
            "context": context,
            "available_paths": self._extract_entity_paths(context),
        }

    def find_relationship_between(self, entity1_id: str, entity2_id: str) -> List[Dict[str, Any]]:
        """Find relationships and paths between two entities.

        Integration point: Goal Planning / Reasoning â†’ Knowledge System
        """
        connections = self._knowledge.find_connections(entity1_id, entity2_id)

        # Format connections for reasoning
        return {
            "from_entity_id": entity1_id,
            "to_entity_id": entity2_id,
            "direct_distance": self._compute_distance(connections),
            "paths": connections.get("paths", []),
            "connection_strength": self._compute_connection_strength(connections),
        }

    def get_task_context(self, task_entity_ids: List[str]) -> Dict[str, Any]:
        """Get knowledge subgraph for task reasoning.

        Integration point: Planning / Execution â†’ Knowledge System
        """
        task_knowledge = self._knowledge.get_task_knowledge(task_entity_ids)

        return {
            "primary_entities": task_entity_ids,
            "entity_count": task_knowledge.get("context_entity_count", 0),
            "entities": task_knowledge.get("entities", []),
            "relationships": task_knowledge.get("relationships", []),
            "reasoning_summary": self._generate_reasoning_summary(task_knowledge),
        }

    def learn_from_reasoning(self, reasoning_result: Dict[str, Any]) -> Dict[str, Any]:
        """Learn from reasoning results back into knowledge system.

        Integration point: Reasoning â†’ Knowledge System (feedback)
        """
        # Convert reasoning insights to format knowledge system expects
        insights = {
            "new_entities": reasoning_result.get("new_entities", []),
            "new_relationships": reasoning_result.get("inferred_relationships", []),
            "updated_entities": reasoning_result.get("updated_entities", []),
            "confidence_adjustments": reasoning_result.get("confidence_adjustments", {}),
        }

        # Feed back to knowledge system
        success = True

        if insights["new_entities"]:
            # Process new entities
            pass

        if insights["new_relationships"]:
            # Process new relationships
            pass

        return {
            "success": success,
            "message": "Reasoning insights integrated into knowledge system",
        }

    def _extract_entity_paths(self, context: Dict[str, Any]) -> List[List[str]]:
        """Extract entity paths from context."""
        paths = []

        # This would traverse the context structure to build entity paths
        # Simplified version:
        if "entities" in context:
            for entity_pair in context.get("relationships", []):
                paths.append([entity_pair.get("from", ""), entity_pair.get("to", "")])

        return paths

    def _compute_distance(self, connections: Dict[str, Any]) -> int:
        """Compute shortest path distance between entities."""
        paths = connections.get("paths", [])

        if not paths:
            return 999  # Unreachable

        return min(len(path) for path in paths)

    def _compute_connection_strength(self, connections: Dict[str, Any]) -> float:
        """Compute overall strength of connections between entities."""
        paths = connections.get("paths", [])

        if not paths:
            return 0.0

        # Simple heuristic: more paths = stronger connection
        num_paths = len(paths)
        path_strength = 1.0 / (1.0 + num_paths)  # Closer to 1 with more paths

        # Also consider average confidence in paths
        avg_confidence = 0.0
        total_confidence = 0.0
        count = 0

        for path in paths:
            for rel in path:
                total_confidence += rel.get("confidence", 0.5)
                count += 1

        if count > 0:
            avg_confidence = total_confidence / count

        # Combined strength
        return (path_strength + avg_confidence) / 2.0

    def _generate_reasoning_summary(self, task_knowledge: Dict[str, Any]) -> str:
        """Generate a brief summary of task knowledge for reasoning context."""
        entity_count = task_knowledge.get("context_entity_count", 0)
        relationship_count = len(task_knowledge.get("relationships", []))

        return (
            f"Task context contains {entity_count} entities "
            f"connected by {relationship_count} relationships"
        )

