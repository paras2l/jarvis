"""Central Knowledge Core for Jarvis AI architecture.

Manages the knowledge system, coordinating entity extraction, relationship
building, graph operations, and integration with reasoning/planning.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from threading import RLock

from jarvis.knowledge_system.knowledge_graph import KnowledgeGraph, Entity, Relationship
from jarvis.knowledge_system.entity_extractor import EntityExtractor
from jarvis.knowledge_system.relation_builder import RelationBuilder
from jarvis.knowledge_system.knowledge_retriever import KnowledgeRetriever
from jarvis.knowledge_system.knowledge_updater import KnowledgeUpdater


@dataclass(slots=True)
class KnowledgeQuery:
    """A query against the knowledge system."""

    query_id: str
    query_type: str  # "entity_search", "relation_query", "context_retrieval", "path_finding"
    parameters: Dict[str, Any]
    result_count: int = 0
    execution_time_ms: float = 0.0


@dataclass(slots=True)
class KnowledgeSnapshot:
    """System-wide knowledge snapshot for diagnostics."""

    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    entity_count: int = 0
    relationship_count: int = 0
    entity_kinds: List[str] = field(default_factory=list)
    relation_types: List[str] = field(default_factory=list)
    last_update_source: str = ""
    health_status: str = "healthy"  # healthy, degraded, critical


class KnowledgeCore:
    """Central orchestrator for the Knowledge System.

    Integrates entity extraction, relationship building, graph operations,
    and provides unified interface for reasoning/planning/memory systems.
    """

    def __init__(self, memory_system: Optional[Any] = None) -> None:
        self._memory = memory_system
        self._lock = RLock()

        # Core components
        self._graph = KnowledgeGraph()
        self._extractor = EntityExtractor()
        self._builder = RelationBuilder()
        self._retriever = KnowledgeRetriever(self._graph)
        self._updater = KnowledgeUpdater(self._graph, self._extractor, self._builder)

        # Metrics
        self._query_log: List[KnowledgeQuery] = []
        self._last_consolidation = datetime.now(timezone.utc)

    def learn_from_text(self, text: str, source: str = "document") -> Dict[str, Any]:
        """Learn entities and relationships from text.

        Integration point: Perception Layer → Knowledge System
        """
        if not text:
            return {"success": False, "message": "No text provided"}

        updates = self._updater.ingest_text(text, source=source)

        self._persist_to_memory(
            f"knowledge:learn_from_text:{source}",
            {"text": text[:500], "updates": updates, "timestamp": datetime.now(timezone.utc).isoformat()},
            source="knowledge_core",
        )

        return {
            "success": True,
            "entities_added": updates.get("entities_added", 0),
            "relations_added": updates.get("relations_added", 0),
        }

    def learn_from_observations(self, observations: Dict[str, Any]) -> Dict[str, Any]:
        """Learn entities from system observations.

        Integration point: Perception Layer → Knowledge System
        """
        if not observations:
            return {"success": False, "message": "No observations provided"}

        updates = self._updater.ingest_observations(observations, source="perception")

        return {
            "success": True,
            "entities_added": updates.get("entities_added", 0),
        }

    def learn_from_research(self, research_result: Dict[str, Any]) -> Dict[str, Any]:
        """Learn from research agent results.

        Integration point: Research Agent → Knowledge System
        """
        if not research_result:
            return {"success": False, "message": "No research result"}

        updates = self._updater.ingest_research_data(research_result, source="research_agent")

        self._persist_to_memory(
            "knowledge:learn_from_research",
            {
                "topic": research_result.get("topic", "unknown"),
                "updates": updates,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            source="knowledge_core",
            importance=0.75,
        )

        return {
            "success": True,
            "entities_added": updates.get("entities_added", 0),
        }

    def find_entity(self, label: str, kind: Optional[str] = None) -> Optional[Entity]:
        """Retrieve a single entity.

        Integration point: Reasoning Engine → Knowledge System
        """
        return self._retriever.search_entity(label, kind=kind)

    def query_entities(self, query: str, kind: Optional[str] = None, limit: int = 10) -> List[Entity]:
        """Search for entities.

        Integration point: World Model / Reasoning Engine → Knowledge System
        """
        import time

        start = time.perf_counter()
        results = self._retriever.search_entities(query, kind=kind, limit=limit)
        elapsed_ms = (time.perf_counter() - start) * 1000

        self._log_query(
            KnowledgeQuery(
                query_id=f"entity_search_{int(time.time()*1000)}",
                query_type="entity_search",
                parameters={"query": query, "kind": kind, "limit": limit},
                result_count=len(results),
                execution_time_ms=elapsed_ms,
            )
        )

        return results

    def get_reasoning_context(self, entity: Entity, max_depth: int = 2) -> Dict[str, Any]:
        """Get context for reasoning about an entity.

        Integration point: Reasoning Engine → Knowledge System
        """
        return self._retriever.get_reasoning_context(entity, max_depth=max_depth)

    def get_task_knowledge(self, task_entity_ids: List[str]) -> Dict[str, Any]:
        """Get knowledge subgraph for a task.

        Integration point: Planning / Execution → Knowledge System
        """
        entities, relationships = self._retriever.get_subgraph_for_task(task_entity_ids)

        return {
            "entities": [e.to_dict() for e in entities],
            "relationships": [r.to_dict() for r in relationships],
            "task_entity_count": len(task_entity_ids),
            "context_entity_count": len(entities),
        }

    def find_connections(self, entity1_id: str, entity2_id: str) -> Dict[str, Any]:
        """Find relationship paths between entities.

        Integration point: Goal Planning / Reasoning → Knowledge System
        """
        paths = self._retriever.find_connections(entity1_id, entity2_id)

        return {
            "path_count": len(paths),
            "paths": [
                [
                    {
                        "from": rel.from_entity_id,
                        "to": rel.to_entity_id,
                        "type": rel.relation_type,
                        "confidence": rel.confidence,
                    }
                    for rel in path
                ]
                for path in paths[:5]  # Limit to top 5 paths
            ],
        }

    def get_entity_info(self, entity_id: str) -> Dict[str, Any]:
        """Get detailed entity information including context and statistics."""
        return self._retriever.get_entity_stats(entity_id)

    def consolidate(self, similarity_threshold: float = 0.85) -> Dict[str, Any]:
        """Consolidate duplicate entities.

        Integration point: Self-Improvement Engine → Knowledge System
        """
        consolidated_count = self._updater.consolidate_entities(similarity_threshold)

        self._persist_to_memory(
            "knowledge:consolidation",
            {
                "consolidated_count": consolidated_count,
                "similarity_threshold": similarity_threshold,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            source="knowledge_core",
            importance=0.6,
        )

        return {
            "success": True,
            "consolidated_count": consolidated_count,
        }

    def get_snapshot(self) -> KnowledgeSnapshot:
        """Get a snapshot of knowledge system state."""
        graph_snapshot = self._graph.snapshot()

        return KnowledgeSnapshot(
            entity_count=graph_snapshot["entity_count"],
            relationship_count=graph_snapshot["relationship_count"],
            entity_kinds=graph_snapshot["entity_kinds"],
            relation_types=graph_snapshot["relation_types"],
            last_update_source="knowledge_system",
            health_status=self._assess_health(graph_snapshot),
        )

    def get_diagnostics(self) -> Dict[str, Any]:
        """Get diagnostic information about knowledge system health."""
        graph_health = self._updater.get_graph_health()
        recent_queries = self._query_log[-10:] if self._query_log else []

        return {
            "graph": graph_health,
            "recent_queries": [
                {
                    "query_type": q.query_type,
                    "result_count": q.result_count,
                    "execution_time_ms": q.execution_time_ms,
                }
                for q in recent_queries
            ],
            "update_log_recent": [r.update_type for r in self._updater.get_update_log(limit=5)],
        }

    def export_subgraph(self, entity_ids: List[str]) -> Dict[str, Any]:
        """Export a subgraph for analysis or visualization."""
        entities, relationships = self._retriever.get_subgraph_for_task(entity_ids)

        return {
            "entities": [e.to_dict() for e in entities],
            "relationships": [r.to_dict() for r in relationships],
        }

    def _assess_health(self, graph_snapshot: Dict[str, Any]) -> str:
        """Assess overall health of the knowledge graph."""
        entity_count = graph_snapshot["entity_count"]
        relationship_count = graph_snapshot["relationship_count"]

        # Very sparse graph is concerning
        if entity_count < 10:
            return "degraded"

        # Ratio of relationships to entities
        density = relationship_count / max(entity_count, 1)
        if density < 0.1:  # Less than 0.1 relationships per entity on average
            return "degraded"

        return "healthy"

    def _log_query(self, query: KnowledgeQuery) -> None:
        """Log a query for diagnostics."""
        with self._lock:
            self._query_log.append(query)
            if len(self._query_log) > 200:
                self._query_log.pop(0)

    def _persist_to_memory(
        self,
        key: str,
        value: Dict[str, Any],
        source: str = "knowledge_core",
        importance: float = 0.7,
    ) -> None:
        """Persist knowledge insights to memory system.

        Integration point: Knowledge System → Memory System
        """
        if not self._memory:
            return

        try:
            self._memory.remember_short_term(
                key=f"knowledge:{key}",
                value=value,
                tags=["knowledge_system", source],
            )

            self._memory.remember_long_term(
                key=f"knowledge:{key}",
                value=value,
                source=source,
                importance=importance,
                tags=["knowledge_system", source],
            )
        except Exception:
            pass  # Silent fail; memory integration is optional
