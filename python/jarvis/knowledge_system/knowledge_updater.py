"""Continuously updates the knowledge graph with new data from perception, research, and learning.

Manages knowledge discovery, conflict resolution, and source provenance
tracking for graph evolution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from threading import RLock

from jarvis.knowledge_system.knowledge_graph import Entity, KnowledgeGraph, Relationship
from jarvis.knowledge_system.entity_extractor import EntityExtractor, ExtractedEntity
from jarvis.knowledge_system.relation_builder import RelationBuilder


@dataclass(slots=True)
class UpdateRecord:
    """Record of a knowledge graph update."""

    entity_id: str
    update_type: str  # "entity_added", "entity_updated", "relation_added", "relation_updated", "entity_removed"
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    source: str = "system"
    details: Dict[str, Any] = field(default_factory=dict)


class KnowledgeUpdater:
    """Updates and maintains the knowledge graph."""

    def __init__(self, graph: KnowledgeGraph, extractor: EntityExtractor, builder: RelationBuilder) -> None:
        self._graph = graph
        self._extractor = extractor
        self._builder = builder
        self._lock = RLock()
        self._update_log: List[UpdateRecord] = []
        self._entity_sources: Dict[str, List[str]] = {}  # entity_id -> [source1, source2, ...]
        self._max_log_size = 1000

    def ingest_text(self, text: str, source: str = "unknown_source") -> Dict[str, int]:
        """Ingest text and update the knowledge graph."""
        if not text or not isinstance(text, str):
            return {"entities_added": 0, "relations_added": 0}

        # Extract entities
        extracted_entities = self._extractor.extract_from_text(text, source=source)
        if not extracted_entities:
            return {"entities_added": 0, "relations_added": 0}

        # Convert to graph entities
        entities: List[Entity] = []
        for extracted in extracted_entities:
            entity = self._extractor.convert_to_entity(extracted)
            added = self._add_or_update_entity(entity, source)
            if added:
                entities.append(entity)

        # Build relationships
        relations = self._builder.build_relations_from_text(entities, text)
        added_relations = 0
        for relation in relations:
            if self._add_or_update_relation(relation, source):
                added_relations += 1

        return {"entities_added": len(entities), "relations_added": added_relations}

    def ingest_observations(self, observations: Dict[str, Any], source: str = "perception") -> Dict[str, int]:
        """Ingest system observations and update knowledge graph."""
        if not observations:
            return {"entities_added": 0, "relations_added": 0}

        extracted_entities = self._extractor.extract_from_observations(observations)
        if not extracted_entities:
            return {"entities_added": 0, "relations_added": 0}

        entities: List[Entity] = []
        for extracted in extracted_entities:
            entity = self._extractor.convert_to_entity(extracted)
            added = self._add_or_update_entity(entity, source)
            if added:
                entities.append(entity)

        return {"entities_added": len(entities), "relations_added": 0}

    def ingest_research_data(self, research_result: Dict[str, Any], source: str = "research_agent") -> Dict[str, int]:
        """Ingest research data with higher confidence weighting."""
        if "summary" not in research_result:
            return {"entities_added": 0, "relations_added": 0}

        summary = research_result.get("summary", "")
        extracted = self._extractor.extract_from_text(summary, source=source)

        entities: List[Entity] = []
        for ext in extracted:
            # Boost confidence for research data
            ext.confidence = min(0.95, ext.confidence + 0.15)
            entity = self._extractor.convert_to_entity(ext)
            added = self._add_or_update_entity(entity, source)
            if added:
                entities.append(entity)

        # Add source provenance
        if "sources" in research_result:
            for src_url in research_result.get("sources", []):
                for entity in entities:
                    self._track_source(entity.entity_id, f"research:{src_url}")

        return {"entities_added": len(entities), "relations_added": 0}

    def _add_or_update_entity(self, entity: Entity, source: str) -> bool:
        """Add a new entity or update an existing one."""
        with self._lock:
            existing = self._graph.get_entity(entity.entity_id)

            if existing:
                # Update confidence using weighted average
                weight_new = 0.3
                weight_existing = 0.7
                new_confidence = (weight_new * entity.confidence) + (weight_existing * existing.confidence)

                existing.confidence = new_confidence
                existing.updated_at = datetime.now(timezone.utc).isoformat()
                existing.properties = {**existing.properties, **entity.properties}

                # Track source
                self._track_source(entity.entity_id, source)

                self._graph.add_entity(existing)
                self._log_update(
                    UpdateRecord(
                        entity_id=entity.entity_id,
                        update_type="entity_updated",
                        source=source,
                        details={"confidence": new_confidence},
                    )
                )
                return False  # Updated, not added
            else:
                # Add new entity
                self._graph.add_entity(entity)
                self._track_source(entity.entity_id, source)
                self._log_update(
                    UpdateRecord(
                        entity_id=entity.entity_id,
                        update_type="entity_added",
                        source=source,
                        details={"kind": entity.kind},
                    )
                )
                return True  # Added new

    def _add_or_update_relation(self, relation: Relationship, source: str) -> bool:
        """Add a new relationship or update an existing one."""
        if not self._builder.validate_relation(relation):
            return False

        with self._lock:
            # Check if similar relation exists
            existing_rels = [
                r
                for r in self._graph.get_relations_by_type(relation.relation_type)
                if r.from_entity_id == relation.from_entity_id and r.to_entity_id == relation.to_entity_id
            ]

            if existing_rels:
                # Merge with existing
                merged = self._builder.merge_relations(existing_rels[0], relation)
                self._graph.add_relationship(merged)
                self._log_update(
                    UpdateRecord(
                        entity_id=relation.from_entity_id,
                        update_type="relation_updated",
                        source=source,
                        details={"to": relation.to_entity_id, "type": relation.relation_type},
                    )
                )
                return False  # Updated, not added
            else:
                # Add new relation
                self._graph.add_relationship(relation)
                self._log_update(
                    UpdateRecord(
                        entity_id=relation.from_entity_id,
                        update_type="relation_added",
                        source=source,
                        details={"to": relation.to_entity_id, "type": relation.relation_type},
                    )
                )
                return True  # Added new

    def resolve_conflict(self, entity1: Entity, entity2: Entity) -> Entity:
        """Resolve conflicts between two entity versions."""
        # Keep the one with higher confidence
        if entity1.confidence >= entity2.confidence:
            # Merge entity2's properties into entity1
            entity1.properties = {**entity2.properties, **entity1.properties}
            return entity1
        else:
            entity2.properties = {**entity1.properties, **entity2.properties}
            return entity2

    def consolidate_entities(self, similarity_threshold: float = 0.85) -> int:
        """Consolidate duplicate or similar entities."""
        consolidated_count = 0

        # Group entities by kind and find similar ones
        kind_groups: Dict[str, List[Entity]] = {}
        for entity in self._graph.find_entities():
            if entity.kind not in kind_groups:
                kind_groups[entity.kind] = []
            kind_groups[entity.kind].append(entity)

        for entities in kind_groups.values():
            for i, entity1 in enumerate(entities):
                for entity2 in entities[i + 1 :]:
                    if self._entities_similar(entity1, entity2, similarity_threshold):
                        # Merge entity2 into entity1
                        merged = self.resolve_conflict(entity1, entity2)
                        self._graph.add_entity(merged)
                        self._graph.remove_entity(entity2.entity_id)
                        consolidated_count += 1

        return consolidated_count

    def forget_entity(self, entity_id: str, reason: str = "consolidation") -> bool:
        """Remove an entity from the knowledge graph."""
        with self._lock:
            removed = self._graph.remove_entity(entity_id)
            if removed:
                self._log_update(
                    UpdateRecord(
                        entity_id=entity_id,
                        update_type="entity_removed",
                        source="updater",
                        details={"reason": reason},
                    )
                )
        return removed

    def get_update_log(self, limit: int = 100) -> List[UpdateRecord]:
        """Get recent update log entries."""
        with self._lock:
            return list(reversed(self._update_log[-limit:]))

    def _track_source(self, entity_id: str, source: str) -> None:
        """Track the sources that have contributed to an entity."""
        if entity_id not in self._entity_sources:
            self._entity_sources[entity_id] = []
        if source not in self._entity_sources[entity_id]:
            self._entity_sources[entity_id].append(source)

    def _log_update(self, record: UpdateRecord) -> None:
        """Log an update to the knowledge graph."""
        with self._lock:
            self._update_log.append(record)
            if len(self._update_log) > self._max_log_size:
                self._update_log.pop(0)

    def _entities_similar(self, entity1: Entity, entity2: Entity, threshold: float) -> bool:
        """Check if two entities are similar enough to consolidate."""
        # Label similarity
        l1 = entity1.label.lower()
        l2 = entity2.label.lower()

        if l1 == l2:
            return True
        if l1 in l2 or l2 in l1:
            return len(l1) / max(len(l1), len(l2)) > threshold

        # Character overlap
        common = sum(1 for c in l1 if c in l2)
        overlap_score = common / max(len(l1), len(l2), 1)

        return overlap_score > threshold

    def get_graph_health(self) -> Dict[str, Any]:
        """Get health metrics for the knowledge graph."""
        snapshot = self._graph.snapshot()
        return {
            "entity_count": snapshot["entity_count"],
            "relationship_count": snapshot["relationship_count"],
            "entity_kinds": len(snapshot["entity_kinds"]),
            "relation_types": len(snapshot["relation_types"]),
            "update_log_size": len(self._update_log),
            "tracked_sources": len(self._entity_sources),
        }
