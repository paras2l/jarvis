"""Jarvis Knowledge System - Central knowledge architecture for intelligent reasoning.

The Knowledge System is responsible for:
1. **Entity Management** - Extracting, storing, and organizing entities
2. **Relationship Building** - Understanding connections between entities
3. **Context Retrieval** - Finding relevant knowledge for tasks
4. **Reasoning Support** - Providing knowledge for intelligent reasoning
5. **Integration** - Connecting with memory, reasoning, and planning engines

### Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     KNOWLEDGE SYSTEM                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │   Entity     │  │ Relationship    │  │  Knowledge   │   │
│  │  Extractor   │  │  Builder        │  │  Graph       │   │
│  └──────────────┘  └─────────────────┘  └──────────────┘   │
│         │                  │                      │          │
│         └──────────────────┼──────────────────────┘          │
│                            │                                 │
│                  ┌─────────▼─────────┐                       │
│                  │  KNOWLEDGE CORE   │                       │
│                  │  (Orchestrator)   │                       │
│                  └─────────┬─────────┘                       │
│         ┌────────────────┬─┴──────────────────┬───────────┐  │
│         │                │                    │           │  │
│    ┌────▼─────┐  ┌──────▼──────┐  ┌─────────▼──┐  ┌────▼─┐ │
│    │ Retriever │  │  Updater    │  │ Knowledge  │  │Graph │ │
│    └──────────┘  └─────────────┘  │ Interfaces │  └──────┘ │
│                                     └────────────┘           │
└─────────────────────────────────────────────────────────────┘
         │              │                    │
    ┌────▼────┐  ┌─────▼──────┐  ┌──────────▼──────┐
    │ Reasoning│  │  Memory    │  │  Planning       │
    │ Bridge   │  │  Bridge    │  │  Bridge         │
    └──────────┘  └────────────┘  └─────────────────┘
         │              │                    │
    ┌────▼────┐  ┌─────▼──────┐  ┌──────────▼──────┐
    │ Reasoning│  │  Memory    │  │  Planning       │
    │ Engine   │  │  System    │  │  Engine         │
    └──────────┘  └────────────┘  └─────────────────┘
```

### Main Classes

- **KnowledgeCore** - Central orchestrator, main entry point
- **EntityExtractor** - Extracts entities from various sources
- **RelationBuilder** - Builds and infers relationships
- **KnowledgeGraph** - Graph database for entities and relationships
- **KnowledgeRetriever** - Retrieves entities and context
- **KnowledgeUpdater** - Updates and maintains the graph

### Integration Bridges

- **ReasoningKnowledgeBridge** - Interfaces with reasoning engine
- **MemoryKnowledgeBridge** - Bidirectional integration with memory system
- **PlanningKnowledgeBridge** - Interfaces with planning engine

### Usage Examples

```python
from jarvis.knowledge_system import KnowledgeCore

# Initialize
knowledge = KnowledgeCore(memory_system=memory)

# Learn from text
result = knowledge.learn_from_text("John Smith works at Acme Corp")
# → Extracts entities: Person(John Smith), Organization(Acme Corp)
# → Builds relationship: works_at

# Query entities
entities = knowledge.query_entities("John Smith")
# → Returns: [Entity(label='John Smith', kind='person', ...)]

# Get context for reasoning
context = knowledge.get_reasoning_context(entity, max_depth=2)
# → Returns: Entity with all connected relationships and entities

# Find connections between entities
paths = knowledge.find_connections(entity1_id, entity2_id)
# → Returns: All relationship paths connecting two entities
```

### Integration Points

1. **Perception → Knowledge**: `learn_from_observations()`
2. **Research → Knowledge**: `learn_from_research()`
3. **Knowledge → Reasoning**: `get_reasoning_context()`, `query_entities()`
4. **Knowledge → Planning**: `get_task_knowledge()`, `find_connections()`
5. **Knowledge → Memory**: `memorize_entity()`, `memorize_insights()`
6. **Self-Improvement**: `consolidate()`, snapshot/diagnostics

### Features

- **Entity Extraction**: Automatic extraction from text, observations, code
- **Relationship Inference**: Builds explicit and inferred relationships
- **Context Retrieval**: Gets full context for reasoning tasks
- **Graph Analysis**: Find paths, connections, and clusters
- **Consolidation**: Merge duplicate entities and infer new relationships
- **Memory Integration**: Bidirectional flow with memory system
- **Planning Integration**: Support for task decomposition and dependency analysis
- **Reasoning Integration**: Direct support for reasoning engine needs
"""

from __future__ import annotations

# Core Components
from jarvis.knowledge_system.knowledge_core import (
    KnowledgeCore,
    KnowledgeQuery,
    KnowledgeSnapshot,
)
from jarvis.knowledge_system.knowledge_graph import (
    KnowledgeGraph,
    Entity,
    Relationship,
)
from jarvis.knowledge_system.entity_extractor import (
    EntityExtractor,
    ExtractedEntity,
    EntityKind,
)
from jarvis.knowledge_system.relation_builder import (
    RelationBuilder,
)
from jarvis.knowledge_system.knowledge_retriever import (
    KnowledgeRetriever,
)
from jarvis.knowledge_system.knowledge_updater import (
    KnowledgeUpdater,
)

# Integration Bridges
from jarvis.knowledge_system.reasoning_knowledge_bridge import (
    ReasoningKnowledgeBridge,
    ReasoningEntity,
)
from jarvis.knowledge_system.memory_knowledge_bridge import (
    MemoryKnowledgeBridge,
    KnowledgeMemory,
    MemoryType,
)
from jarvis.knowledge_system.planning_knowledge_bridge import (
    PlanningKnowledgeBridge,
    PlanningEntity,
    PlanningDependency,
)

__all__ = [
    # Core
    "KnowledgeCore",
    "KnowledgeQuery",
    "KnowledgeSnapshot",
    # Graph Components
    "KnowledgeGraph",
    "Entity",
    "Relationship",
    # Extraction
    "EntityExtractor",
    "ExtractedEntity",
    "EntityKind",
    # Relationship Building
    "RelationBuilder",
    # Retrieval & Updates
    "KnowledgeRetriever",
    "KnowledgeUpdater",
    # Integration Bridges
    "ReasoningKnowledgeBridge",
    "ReasoningEntity",
    "MemoryKnowledgeBridge",
    "KnowledgeMemory",
    "MemoryType",
    "PlanningKnowledgeBridge",
    "PlanningEntity",
    "PlanningDependency",
]

__version__ = "1.0.0"
__doc_title__ = "Jarvis Knowledge System"
__doc_subtitle__ = "Central Knowledge Architecture for Intelligent Reasoning"
