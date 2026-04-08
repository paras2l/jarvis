"""Knowledge Graph representation using entities and relationships.

This module implements a directed knowledge graph where entities are nodes
and relationships are labeled edges connecting them. Supports efficient
retrieval, traversal, and semantic similarity queries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any, Dict, List, Optional, Set, Tuple

import hashlib


@dataclass(slots=True)
class Entity:
    """Represents a node in the knowledge graph."""

    entity_id: str
    label: str
    kind: str  # person, tool, process, concept, place, event, etc.
    properties: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    confidence: float = 0.8
    source: str = "system"
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "label": self.label,
            "kind": self.kind,
            "properties": self.properties,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "confidence": self.confidence,
            "source": self.source,
            "tags": self.tags,
        }


@dataclass(slots=True)
class Relationship:
    """Represents an edge in the knowledge graph."""

    relation_id: str
    from_entity_id: str
    to_entity_id: str
    relation_type: str  # e.g., "uses", "belongs_to", "causes", "part_of"
    properties: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    confidence: float = 0.8
    bidirectional: bool = False
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "relation_id": self.relation_id,
            "from_entity_id": self.from_entity_id,
            "to_entity_id": self.to_entity_id,
            "relation_type": self.relation_type,
            "properties": self.properties,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "confidence": self.confidence,
            "bidirectional": self.bidirectional,
            "tags": self.tags,
        }


@dataclass(slots=True)
class GraphQuery:
    """Result of a knowledge graph query."""

    entities: List[Entity]
    relationships: List[Relationship]
    distance_map: Dict[str, int]  # entity_id -> distance from query start
    confidence_avg: float


class KnowledgeGraph:
    """Directed knowledge graph with entities and relationships."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._entities: Dict[str, Entity] = {}
        self._relationships: Dict[str, Relationship] = {}
        self._outgoing: Dict[str, List[str]] = {}  # entity_id -> relation_ids
        self._incoming: Dict[str, List[str]] = {}  # entity_id -> relation_ids
        self._entity_index: Dict[str, Set[str]] = {}  # kind -> entity_ids
        self._relation_index: Dict[str, Set[str]] = {}  # relation_type -> relation_ids

    def add_entity(self, entity: Entity) -> bool:
        """Add or update an entity."""
        with self._lock:
            self._entities[entity.entity_id] = entity
            if entity.kind not in self._entity_index:
                self._entity_index[entity.kind] = set()
            self._entity_index[entity.kind].add(entity.entity_id)
        return True

    def add_relationship(self, relation: Relationship) -> bool:
        """Add or update a relationship."""
        with self._lock:
            if relation.from_entity_id not in self._entities or relation.to_entity_id not in self._entities:
                return False

            self._relationships[relation.relation_id] = relation

            if relation.from_entity_id not in self._outgoing:
                self._outgoing[relation.from_entity_id] = []
            self._outgoing[relation.from_entity_id].append(relation.relation_id)

            if relation.to_entity_id not in self._incoming:
                self._incoming[relation.to_entity_id] = []
            self._incoming[relation.to_entity_id].append(relation.relation_id)

            if relation.bidirectional:
                if relation.to_entity_id not in self._outgoing:
                    self._outgoing[relation.to_entity_id] = []
                self._outgoing[relation.to_entity_id].append(relation.relation_id)

                if relation.from_entity_id not in self._incoming:
                    self._incoming[relation.from_entity_id] = []
                self._incoming[relation.from_entity_id].append(relation.relation_id)

            if relation.relation_type not in self._relation_index:
                self._relation_index[relation.relation_type] = set()
            self._relation_index[relation.relation_type].add(relation.relation_id)

        return True

    def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Retrieve an entity by ID."""
        with self._lock:
            return self._entities.get(entity_id)

    def find_entities(self, kind: str | None = None, label_prefix: str = "") -> List[Entity]:
        """Find entities by kind and/or label prefix."""
        with self._lock:
            results: List[Entity] = []
            if kind and kind in self._entity_index:
                for eid in self._entity_index[kind]:
                    entity = self._entities[eid]
                    if not label_prefix or entity.label.lower().startswith(label_prefix.lower()):
                        results.append(entity)
            elif not kind:
                for entity in self._entities.values():
                    if not label_prefix or entity.label.lower().startswith(label_prefix.lower()):
                        results.append(entity)
        return results

    def get_neighbors(self, entity_id: str, max_distance: int = 1) -> GraphQuery:
        """Get entities connected within max_distance."""
        with self._lock:
            visited: Set[str] = set()
            distance_map: Dict[str, int] = {entity_id: 0}
            queue: List[Tuple[str, int]] = [(entity_id, 0)]
            entity_ids: Set[str] = {entity_id}
            relation_ids: Set[str] = set()

            while queue:
                eid, dist = queue.pop(0)
                if dist >= max_distance or eid in visited:
                    continue
                visited.add(eid)

                for rid in self._outgoing.get(eid, []):
                    rel = self._relationships[rid]
                    neighbor_id = rel.to_entity_id
                    if neighbor_id not in distance_map:
                        distance_map[neighbor_id] = dist + 1
                        entity_ids.add(neighbor_id)
                        queue.append((neighbor_id, dist + 1))
                    relation_ids.add(rid)

                for rid in self._incoming.get(eid, []):
                    rel = self._relationships[rid]
                    neighbor_id = rel.from_entity_id
                    if neighbor_id not in distance_map:
                        distance_map[neighbor_id] = dist + 1
                        entity_ids.add(neighbor_id)
                        queue.append((neighbor_id, dist + 1))
                    relation_ids.add(rid)

        entities = [self._entities[eid] for eid in entity_ids if eid in self._entities]
        relations = [self._relationships[rid] for rid in relation_ids if rid in self._relationships]
        confidence_avg = sum(e.confidence for e in entities) / len(entities) if entities else 0.0

        return GraphQuery(
            entities=entities,
            relationships=relations,
            distance_map=distance_map,
            confidence_avg=confidence_avg,
        )

    def find_paths(self, from_id: str, to_id: str, max_depth: int = 5) -> List[List[Relationship]]:
        """Find all paths between two entities."""
        paths: List[List[Relationship]] = []

        def dfs(current: str, target: str, path: List[Relationship], visited: Set[str], depth: int) -> None:
            if depth > max_depth or current in visited:
                return
            if current == target:
                paths.append(list(path))
                return

            visited.add(current)
            for rid in self._outgoing.get(current, []):
                rel = self._relationships[rid]
                path.append(rel)
                dfs(rel.to_entity_id, target, path, visited.copy(), depth + 1)
                path.pop()

        if from_id in self._entities and to_id in self._entities:
            dfs(from_id, to_id, [], set(), 0)

        return paths

    def get_relations_by_type(self, relation_type: str) -> List[Relationship]:
        """Get all relationships of a specific type."""
        with self._lock:
            if relation_type not in self._relation_index:
                return []
            return [self._relationships[rid] for rid in self._relation_index[relation_type]]

    def entity_count(self) -> int:
        """Return total entity count."""
        return len(self._entities)

    def relationship_count(self) -> int:
        """Return total relationship count."""
        return len(self._relationships)

    def get_subgraph(self, entity_ids: List[str]) -> Tuple[List[Entity], List[Relationship]]:
        """Extract a subgraph containing specific entities."""
        with self._lock:
            entity_set = set(entity_ids)
            entities = [self._entities[eid] for eid in entity_ids if eid in self._entities]
            relations = []

            for rel in self._relationships.values():
                if rel.from_entity_id in entity_set and rel.to_entity_id in entity_set:
                    relations.append(rel)

        return entities, relations

    def remove_entity(self, entity_id: str) -> bool:
        """Remove an entity and associated relationships."""
        with self._lock:
            if entity_id not in self._entities:
                return False

            entity = self._entities.pop(entity_id)
            if entity.kind in self._entity_index:
                self._entity_index[entity.kind].discard(entity_id)

            # Remove associated relationships
            for rid in list(self._outgoing.get(entity_id, [])) + list(self._incoming.get(entity_id, [])):
                rel = self._relationships.pop(rid, None)
                if rel:
                    if rel.relation_type in self._relation_index:
                        self._relation_index[rel.relation_type].discard(rid)

            self._outgoing.pop(entity_id, None)
            self._incoming.pop(entity_id, None)

        return True

    def snapshot(self) -> Dict[str, Any]:
        """Return a snapshot of graph statistics."""
        return {
            "entity_count": len(self._entities),
            "relationship_count": len(self._relationships),
            "entity_kinds": list(self._entity_index.keys()),
            "relation_types": list(self._relation_index.keys()),
        }
