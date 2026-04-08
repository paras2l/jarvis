"""Handles querying the knowledge graph for information needed by reasoning and planning.

Supports entity lookup, relationship traversal, subgraph extraction,
and semantic similarity searches.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from jarvis.knowledge_system.knowledge_graph import Entity, KnowledgeGraph, GraphQuery, Relationship


@dataclass(slots=True)
class SearchResult:
    """Result of a knowledge search."""

    entities: List[Entity]
    relationships: List[Relationship]
    relevance_score: float
    query_time_ms: float


class KnowledgeRetriever:
    """Retrieves information from the knowledge graph."""

    def __init__(self, graph: KnowledgeGraph) -> None:
        self._graph = graph

    def search_entity(self, label: str, kind: Optional[str] = None) -> Optional[Entity]:
        """Search for a single entity by label."""
        candidates = self._graph.find_entities(kind=kind, label_prefix=label)
        if candidates:
            # Return the most confident match
            return max(candidates, key=lambda e: e.confidence)
        return None

    def search_entities(self, query: str, kind: Optional[str] = None, limit: int = 10) -> List[Entity]:
        """Search for entities matching a query."""
        candidates = self._graph.find_entities(kind=kind)
        if not candidates:
            return []

        # Score entities by label similarity and kind match
        scored = []
        query_lower = query.lower()
        for entity in candidates:
            score = 0.0
            if query_lower in entity.label.lower():
                score += 2.0
            # Character overlap scoring
            common_chars = sum(1 for c in query.lower() if c in entity.label.lower())
            score += common_chars / max(len(query), len(entity.label))
            score *= entity.confidence  # Factor in graph confidence
            scored.append((entity, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [e for e, _ in scored[:limit]]

    def get_context(self, entity_id: str, depth: int = 2) -> SearchResult:
        """Get contextual information about an entity."""
        import time

        start = time.perf_counter()

        entity = self._graph.get_entity(entity_id)
        if not entity:
            return SearchResult(entities=[], relationships=[], relevance_score=0.0, query_time_ms=0.0)

        query_result = self._graph.get_neighbors(entity_id, max_distance=depth)
        elapsed_ms = (time.perf_counter() - start) * 1000

        return SearchResult(
            entities=query_result.entities,
            relationships=query_result.relationships,
            relevance_score=query_result.confidence_avg,
            query_time_ms=elapsed_ms,
        )

    def find_relations(self, from_entity_id: str, relation_type: Optional[str] = None) -> List[Relationship]:
        """Get relationships from a source entity."""
        entity = self._graph.get_entity(from_entity_id)
        if not entity:
            return []

        if relation_type:
            return [rel for rel in self._graph.get_relations_by_type(relation_type) if rel.from_entity_id == from_entity_id]
        return []

    def find_connections(self, entity1_id: str, entity2_id: str) -> List[List[Relationship]]:
        """Find relationship paths between two entities."""
        return self._graph.find_paths(entity1_id, entity2_id, max_depth=4)

    def get_related_entities(self, entity_id: str, relation_type: Optional[str] = None, limit: int = 10) -> List[Entity]:
        """Get entities related to a given entity."""
        query = self._graph.get_neighbors(entity_id, max_distance=1)

        related = []
        for rel in query.relationships:
            if relation_type and rel.relation_type != relation_type:
                continue

            if rel.from_entity_id == entity_id:
                related.append(self._graph.get_entity(rel.to_entity_id))
            else:
                related.append(self._graph.get_entity(rel.from_entity_id))

        related = [e for e in related if e is not None]
        return related[:limit]

    def query_by_properties(self, kind: str, properties: Dict[str, Any]) -> List[Entity]:
        """Find entities matching specific properties."""
        candidates = self._graph.find_entities(kind=kind)
        results = []

        for entity in candidates:
            matches = True
            for key, value in properties.items():
                if key not in entity.properties or entity.properties[key] != value:
                    matches = False
                    break
            if matches:
                results.append(entity)

        return results

    def get_subgraph_for_task(self, task_entities: List[str]) -> Tuple[List[Entity], List[Relationship]]:
        """Extract a subgraph for task reasoning."""
        return self._graph.get_subgraph(task_entities)

    def get_entity_stats(self, entity_id: str) -> Dict[str, Any]:
        """Get detailed statistics about an entity."""
        entity = self._graph.get_entity(entity_id)
        if not entity:
            return {}

        context = self.get_context(entity_id, depth=1)
        inbound = len([r for r in context.relationships if r.to_entity_id == entity_id])
        outbound = len([r for r in context.relationships if r.from_entity_id == entity_id])

        return {
            "entity_id": entity_id,
            "label": entity.label,
            "kind": entity.kind,
            "confidence": entity.confidence,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "properties": entity.properties,
            "inbound_relations": inbound,
            "outbound_relations": outbound,
            "context_size": len(context.entities),
        }

    def search_similar(self, entity_id: str, similarity_threshold: float = 0.7) -> List[Entity]:
        """Find entities similar to a given one."""
        entity = self._graph.get_entity(entity_id)
        if not entity:
            return []

        # Find entities of the same kind
        same_kind = self._graph.find_entities(kind=entity.kind)

        # Score similarity (simple label overlap for now)
        scored = []
        for candidate in same_kind:
            if candidate.entity_id == entity_id:
                continue

            # Label similarity
            label_score = self._label_similarity(entity.label, candidate.label)
            # Tag overlap
            tag_overlap = len(set(entity.tags) & set(candidate.tags)) / max(len(entity.tags), len(candidate.tags), 1)
            # Combined score
            similarity = (label_score + tag_overlap) / 2

            if similarity >= similarity_threshold:
                scored.append((candidate, similarity))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [e for e, _ in scored]

    def get_reasoning_context(self, entity: Entity, max_depth: int = 2) -> Dict[str, Any]:
        """Get context suitable for reasoning about an entity."""
        context = self.get_context(entity.entity_id, depth=max_depth)

        # Build knowledge summary
        entity_summary = {e.entity_id: {"label": e.label, "kind": e.kind} for e in context.entities}
        relation_summary = [
            {
                "from": r.from_entity_id,
                "to": r.to_entity_id,
                "type": r.relation_type,
                "confidence": r.confidence,
            }
            for r in context.relationships
        ]

        return {
            "entity": entity.to_dict(),
            "entities": entity_summary,
            "relationships": relation_summary,
            "graph_confidence": context.relevance_score,
        }

    def _label_similarity(self, label1: str, label2: str) -> float:
        """Compute string similarity score."""
        l1 = label1.lower()
        l2 = label2.lower()

        if l1 == l2:
            return 1.0
        if l1 in l2 or l2 in l1:
            return 0.8

        # Character overlap
        common = sum(1 for c in l1 if c in l2)
        return common / max(len(l1), len(l2), 1)
