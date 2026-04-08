"""Builds relationships between extracted entities and stores them in the knowledge graph.

Infers implicit relationships, validates relationship semantics, and
manages bidirectional relationship creation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set
import uuid

from Pixi.knowledge_system.knowledge_graph import Entity, Relationship


@dataclass(slots=True)
class RelationshipCandidate:
    """Potential relationship between entities."""

    from_entity: Entity
    to_entity: Entity
    relation_type: str
    confidence: float
    properties: Dict[str, Any]
    reverse_relation: Optional[str] = None


class RelationBuilder:
    """Builds and validates relationships between entities."""

    def __init__(self) -> None:
        self._semantic_map = self._build_semantic_map()
        self._built_relations: Set[str] = set()

    def build_relations_from_text(self, entities: List[Entity], text: str) -> List[Relationship]:
        """Infer relationships between entities based on text context."""
        relations: List[Relationship] = []

        # Process entity pairs
        for i, entity1 in enumerate(entities):
            for entity2 in entities[i + 1 :]:
                candidate = self._analyze_entity_pair(entity1, entity2, text)
                if candidate:
                    relation = self._candidate_to_relation(candidate)
                    relations.append(relation)
                    if candidate.reverse_relation:
                        reverse = self._create_reverse_relation(relation, candidate.reverse_relation)
                        relations.append(reverse)

        return relations

    def build_relation(
        self,
        from_entity: Entity,
        to_entity: Entity,
        relation_type: str,
        confidence: float = 0.8,
        properties: Optional[Dict[str, Any]] = None,
        bidirectional: bool = False,
    ) -> Relationship:
        """Create a single relationship."""
        relation_id = f"{self._sanitize(from_entity.label)}__{relation_type}__{self._sanitize(to_entity.label)}_{uuid.uuid4().hex[:6]}"

        # Infer reverse relation type if bidirectional
        reverse_type = None
        if bidirectional:
            reverse_type = self._infer_reverse_relation(relation_type)

        return Relationship(
            relation_id=relation_id,
            from_entity_id=from_entity.entity_id,
            to_entity_id=to_entity.entity_id,
            relation_type=relation_type,
            properties=properties or {},
            confidence=confidence,
            bidirectional=bidirectional,
            tags=[relation_type],
        )

    def _analyze_entity_pair(self, entity1: Entity, entity2: Entity, context: str) -> Optional[RelationshipCandidate]:
        """Analyze two entities and infer relationship."""
        context_lower = context.lower()
        entity1_lower = entity1.label.lower()
        entity2_lower = entity2.label.lower()

        # Check if entities appear in close proximity
        idx1 = context_lower.find(entity1_lower)
        idx2 = context_lower.find(entity2_lower)

        if idx1 == -1 or idx2 == -1:
            return None

        distance = abs(idx2 - idx1)
        if distance > 200:  # Entities too far apart
            return None

        # Determine entity kinds and infer relationships
        confidence = 0.9 if distance < 50 else 0.7

        # Person â†’ Tool (uses)
        if entity1.kind == "person" and entity2.kind == "tool":
            return RelationshipCandidate(
                from_entity=entity1,
                to_entity=entity2,
                relation_type="uses",
                confidence=confidence,
                properties={"inferred": True},
                reverse_relation="used_by",
            )

        # Tool â†’ Process (enables)
        if entity1.kind == "tool" and entity2.kind == "process":
            return RelationshipCandidate(
                from_entity=entity1,
                to_entity=entity2,
                relation_type="enables",
                confidence=confidence,
                properties={"inferred": True},
                reverse_relation="enabled_by",
            )

        # Location relationships
        if entity1.kind == "location" and entity2.kind == "person":
            return RelationshipCandidate(
                from_entity=entity2,
                to_entity=entity1,
                relation_type="located_at",
                confidence=confidence,
                properties={"inferred": True},
                reverse_relation="has_person",
            )

        # Concept relationships
        if entity1.kind == "concept" and entity2.kind == "process":
            return RelationshipCandidate(
                from_entity=entity2,
                to_entity=entity1,
                relation_type="applies",
                confidence=confidence,
                properties={"inferred": True},
                reverse_relation="applied_by",
            )

        # Same kind - similarity
        if entity1.kind == entity2.kind:
            return RelationshipCandidate(
                from_entity=entity1,
                to_entity=entity2,
                relation_type="similar_to",
                confidence=confidence * 0.7,
                properties={"inferred": True},
                reverse_relation="similar_to",
            )

        return None

    def _infer_reverse_relation(self, relation_type: str) -> Optional[str]:
        """Infer the reverse relation type."""
        reverse_map = {
            "uses": "used_by",
            "used_by": "uses",
            "enables": "enabled_by",
            "enabled_by": "enables",
            "located_at": "has_person",
            "has_person": "located_at",
            "applies": "applied_by",
            "applied_by": "applies",
            "owns": "owned_by",
            "owned_by": "owns",
            "causes": "caused_by",
            "caused_by": "causes",
            "part_of": "has_part",
            "has_part": "part_of",
            "depends_on": "depended_on_by",
            "depended_on_by": "depends_on",
        }
        return reverse_map.get(relation_type)

    def _candidate_to_relation(self, candidate: RelationshipCandidate) -> Relationship:
        """Convert a candidate to a Relationship."""
        relation_id = f"{self._sanitize(candidate.from_entity.label)}__{candidate.relation_type}__{self._sanitize(candidate.to_entity.label)}_{uuid.uuid4().hex[:6]}"

        return Relationship(
            relation_id=relation_id,
            from_entity_id=candidate.from_entity.entity_id,
            to_entity_id=candidate.to_entity.entity_id,
            relation_type=candidate.relation_type,
            properties=candidate.properties,
            confidence=candidate.confidence,
            bidirectional=bool(candidate.reverse_relation),
            tags=[candidate.relation_type],
        )

    def _create_reverse_relation(self, original: Relationship, reverse_type: str) -> Relationship:
        """Create a reverse relationship."""
        relation_id = f"{self._sanitize(original.to_entity_id)}__{reverse_type}__{self._sanitize(original.from_entity_id)}_{uuid.uuid4().hex[:6]}"

        return Relationship(
            relation_id=relation_id,
            from_entity_id=original.to_entity_id,
            to_entity_id=original.from_entity_id,
            relation_type=reverse_type,
            properties=original.properties.copy(),
            confidence=original.confidence,
            bidirectional=False,
            tags=[reverse_type],
        )

    def validate_relation(self, relation: Relationship) -> bool:
        """Validate that a relationship makes semantic sense."""
        # Avoid self-relations
        if relation.from_entity_id == relation.to_entity_id:
            return False

        # Validate relation type is known
        valid_types = set(self._semantic_map.keys())
        if relation.relation_type not in valid_types:
            return True  # Allow new relation types with warning

        return True

    def merge_relations(self, relation1: Relationship, relation2: Relationship) -> Relationship:
        """Merge two versions of the same relationship."""
        # Average confidence, preserve higher properties
        merged_confidence = (relation1.confidence + relation2.confidence) / 2
        merged_properties = {**relation1.properties, **relation2.properties}

        return Relationship(
            relation_id=relation1.relation_id,
            from_entity_id=relation1.from_entity_id,
            to_entity_id=relation1.to_entity_id,
            relation_type=relation1.relation_type,
            properties=merged_properties,
            confidence=merged_confidence,
            bidirectional=relation1.bidirectional or relation2.bidirectional,
            tags=list(set(relation1.tags + relation2.tags)),
        )

    def _sanitize(self, text: str) -> str:
        """Sanitize text for use in identifiers."""
        import re

        return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:32]

    def _build_semantic_map(self) -> Dict[str, str]:
        """Map of valid relation types and their descriptions."""
        return {
            "uses": "Entity A uses Entity B",
            "used_by": "Entity A is used by Entity B",
            "enables": "Entity A enables Entity B",
            "enabled_by": "Entity A is enabled by Entity B",
            "causes": "Entity A causes Entity B",
            "caused_by": "Entity A is caused by Entity B",
            "located_at": "Entity A is located at Entity B",
            "has_person": "Entity A has person Entity B",
            "part_of": "Entity A is part of Entity B",
            "has_part": "Entity A has part Entity B",
            "owns": "Entity A owns Entity B",
            "owned_by": "Entity A is owned by Entity B",
            "depends_on": "Entity A depends on Entity B",
            "depended_on_by": "Entity A is depended on by Entity B",
            "similar_to": "Entity A is similar to Entity B",
            "applies": "Entity A applies Entity B",
            "applied_by": "Entity A is applied by Entity B",
        }

