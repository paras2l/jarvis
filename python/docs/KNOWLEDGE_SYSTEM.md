# Pixi Knowledge System Documentation

## Overview

The **Pixi Knowledge System** is the central intelligence repository for the Pixi AI architecture. It provides:

- **Entity Management**: Extraction, storage, and organization of entities from various sources
- **Relationship Management**: Building and inferring connections between entities
- **Context Retrieval**: Finding relevant knowledge for reasoning, planning, and memory tasks
- **Integrated Intelligence**: Seamless integration with reasoning, planning, and memory systems
- **Self-Improvement**: Consolidation, deduplication, and inference of new knowledge

## Architecture

### System Diagram

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                   Pixi KNOWLEDGE SYSTEM                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                   â”‚
â”‚  INPUT SOURCES          â”‚  CORE COMPONENTS        â”‚  OUTPUT      â”‚
â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚  OUTPUTS     â”‚
â”‚                         â”‚                        â”‚                â”‚
â”‚  â€¢ Text Documents   â”€â”€â”€â”€â–º  Entity Extractor  â”€â”€â”€â”€â–º  Reasoning    â”‚
â”‚  â€¢ Observations     â”€â”€â”€â”€â–º  Relation Builder â”€â”€â”€â”€â”€â–º  Planning     â”‚
â”‚  â€¢ Code Analysis    â”€â”€â”€â”€â–º  Knowledge Graph  â”€â”€â”€â”€â”€â–º  Memory       â”‚
â”‚  â€¢ Research Data    â”€â”€â”€â”€â–º  Knowledge Core   â”€â”€â”€â”€â”€â–º  Feedback     â”‚
â”‚                         â”‚  (Orchestrator)        â”‚                â”‚
â”‚                         â”‚                        â”‚                â”‚
â”‚                         â”‚  Support Components    â”‚                â”‚
â”‚                         â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚                â”‚
â”‚                         â”‚  â€¢ Retriever           â”‚                â”‚
â”‚                         â”‚  â€¢ Updater             â”‚                â”‚
â”‚                         â”‚  â€¢ Integration Bridges â”‚                â”‚
â”‚                         â”‚                        â”‚                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Core Components

#### 1. **KnowledgeCore** (Orchestrator)
Central entry point for all knowledge operations. Coordinates extraction, building, retrieval, and updates.

```python
knowledge = KnowledgeCore(memory_system=memory)

# Learning operations
knowledge.learn_from_text(text)
knowledge.learn_from_observations(observations)
knowledge.learn_from_research(research_result)

# Querying operations
entities = knowledge.query_entities("search term")
context = knowledge.get_reasoning_context(entity)
connections = knowledge.find_connections(entity1_id, entity2_id)

# Maintenance
knowledge.consolidate()  # Merge duplicates
snapshot = knowledge.get_snapshot()  # Export state
```

#### 2. **EntityExtractor**
Identifies and extracts entities from various sources using patterns and heuristics.

**Supported Sources:**
- Text documents
- System observations (objects, persons, events)
- Code analysis (classes, functions, variables)
- Structured data

**Entity Kinds:**
- `person` - Individual people
- `organization` - Companies, teams, groups
- `location` - Places, regions, facilities
- `task` - Goals, objectives, work items
- `concept` - Ideas, theories, domains
- `technology` - Tools, frameworks, systems
- `process` - Actions, workflows, procedures
- `attribute` - Properties, characteristics
- `data_point` - Numerical/factual data
- `system` - Software/hardware systems

#### 3. **RelationBuilder**
Builds explicit and inferred relationships between entities.

**Relationship Types:**
- `works_at` - Employment relationship
- `depends_on` - Dependency relationship
- `uses` - Usage relationship
- `creates` - Creation relationship
- `has_attribute` - Property relationship
- `part_of` - Composition relationship
- And many more (see relation_builder.py)

#### 4. **KnowledgeGraph**
In-memory graph database storing entities and relationships.

**Key Features:**
- Efficient entity lookup by ID and label
- Relationship traversal
- Graph statistics
- Snapshot/export capabilities

#### 5. **KnowledgeRetriever**
Retrieves entities, relationships, and context from the graph.

**Key Methods:**
- `search_entity(label)` - Find single entity
- `search_entities(query)` - Search multiple entities
- `get_reasoning_context(entity)` - Get full context
- `find_connections(entity1, entity2)` - Find relationship paths

#### 6. **KnowledgeUpdater**
Maintains and updates the knowledge graph.

**Key Operations:**
- `ingest_text()` - Learn from text
- `ingest_observations()` - Learn from observations
- `ingest_research_data()` - Learn from research
- `consolidate_entities()` - Merge duplicates
- `get_graph_health()` - Check graph quality

### Integration Bridges

Integration bridges adapt the knowledge system for specific use cases:

#### **ReasoningKnowledgeBridge**
Interfaces with the reasoning engine.

```python
bridge = ReasoningKnowledgeBridge(knowledge)

# Search for entities relevant to reasoning
entities = bridge.search_knowledge_for_reasoning("concept", filters={"kind": "person"})

# Get comprehensive context for reasoning about an entity
context = bridge.get_context_for_entity(entity_id, depth=2)

# Find relationships between entities
relationships = bridge.find_relationship_between(entity1_id, entity2_id)

# Get task-specific knowledge
task_context = bridge.get_task_context([task_id1, task_id2])

# Feed reasoning insights back
bridge.learn_from_reasoning(reasoning_result)
```

#### **PlanningKnowledgeBridge**
Interfaces with the planning engine.

```python
bridge = PlanningKnowledgeBridge(knowledge)

# Analyze task dependencies
deps = bridge.analyze_task_dependencies(task_id)

# Find prerequisites
prereqs = bridge.find_prerequisites(task_id)

# Find required resources
resources = bridge.find_resources(task_id)

# Check task feasibility
feasible = bridge.check_feasibility(task_id, constraints={})

# Decompose task into subtasks
subtasks = bridge.decompose_task(task_id)

# Estimate task effort
effort = bridge.estimate_effort(task_id)

# Plan optimal task sequence
sequence = bridge.plan_task_sequence([task_id1, task_id2, task_id3])
```

#### **MemoryKnowledgeBridge**
Integrates with the memory system for bidirectional knowledge flow.

```python
bridge = MemoryKnowledgeBridge(knowledge, memory_system)

# Store entity in memory
memory = bridge.memorize_entity(entity_id, importance=0.7)

# Store relationships in memory
bridge.memorize_relationships(entity_id)

# Store high-level insights
bridge.memorize_insights({"text": "...", "entities": [...]})

# Recall memories as knowledge
bridge.recall_memories_as_knowledge("search query")

# Consolidate knowledge memories
bridge.consolidate_knowledge_memories()

# Export snapshot
snapshot = bridge.export_knowledge_snapshot()
```

## Integration Points

### 1. Perception Layer â†’ Knowledge System

**Flow**: Sensor observations â†’ Knowledge System

```python
# From perception/observation systems
observations = {
    "objects": [{
        "name": "laptop",
        "type": "computer",
        "confidence": 0.95,
        "description": "A MacBook Pro"
    }],
    "persons": [{
        "name": "Alice",
        "confidence": 0.98,
        "description": "User at computer"
    }]
}

result = knowledge.learn_from_observations(observations)
```

### 2. Research Agent â†’ Knowledge System

**Flow**: Research output â†’ Knowledge System

```python
research_result = {
    "topic": "Machine Learning Trends",
    "entities": ["machine learning", "neural networks", "deep learning"],
    "relationships": [
        {"from": "deep learning", "to": "neural networks", "type": "part_of"}
    ],
    "confidence": 0.85
}

result = knowledge.learn_from_research(research_result)
```

### 3. Knowledge System â†’ Reasoning Engine

**Flow**: Knowledge queries â† Reasoning needs

```python
# Reasoning engine asks for context
context = knowledge.get_reasoning_context(entity, max_depth=2)

# Find connections for logical inference
paths = knowledge.find_connections(entity1_id, entity2_id)

# Search for relevant entities
entities = knowledge.query_entities("concept", limit=10)
```

### 4. Knowledge System â†’ Planning Engine

**Flow**: Plan queries â† Planning needs

```python
# Planning engine asks for task context
task_knowledge = knowledge.get_task_knowledge([task_id])

# Bridge provides planning-specific analysis
dependencies = bridge.analyze_task_dependencies(task_id)
sequence = bridge.plan_task_sequence([task1, task2, task3])
```

### 5. Knowledge System â†” Memory System

**Bidirectional Flow**:

```python
# Knowledge â†’ Memory: Periodically export important insights
important_entity = knowledge.find_entity("important_concept")
memory.remember_long_term(
    key="knowledge:entity:important",
    value={...},
    importance=0.9
)

# Memory â†’ Knowledge: Recall and use previously learned facts
recalled = memory.recall_long_term("entity search")
# Apply recalled knowledge to current reasoning
```

### 6. Self-Improvement â†’ Knowledge System

**Flow**: Consolidation and learning from experience

```python
# Consolidate duplicate entities
result = knowledge.consolidate(similarity_threshold=0.85)

# Get graph health metrics
diagnostics = knowledge.get_diagnostics()

# Adjust entity confidence based on success
```

## Usage Examples

### Basic Learning and Querying

```python
from Pixi.knowledge_system import KnowledgeCore

# Initialize
knowledge = KnowledgeCore()

# Learn from text
text = "Alice Smith is a software engineer at TechCorp in San Francisco."
knowledge.learn_from_text(text)

# Query
entities = knowledge.query_entities("Alice")
for entity in entities:
    print(f"{entity.label} ({entity.kind})")
```

### Learning from Multiple Sources

```python
# Text
knowledge.learn_from_text("Python is used for machine learning")

# Observations
knowledge.learn_from_observations({
    "objects": [{"name": "laptop", "type": "computer", ...}],
    "persons": [{"name": "Alice", ...}]
})

# Research
knowledge.learn_from_research({
    "topic": "AI trends",
    "entities": ["machine learning", "natural language processing"]
})
```

### Reasoning Integration

```python
from Pixi.knowledge_system import ReasoningKnowledgeBridge

bridge = ReasoningKnowledgeBridge(knowledge)

# Search with filters
entities = bridge.search_knowledge_for_reasoning(
    "concept",
    filters={"kind": "person", "limit": 10}
)

# Get context for reasoning
context = bridge.get_context_for_entity(entity_id, depth=2)

# Find connections between entities
paths = bridge.find_relationship_between(entity1_id, entity2_id)
```

### Planning Integration

```python
from Pixi.knowledge_system import PlanningKnowledgeBridge

bridge = PlanningKnowledgeBridge(knowledge)

# Analyze dependencies
deps = bridge.analyze_task_dependencies(task_id)

# Plan sequence
sequence = bridge.plan_task_sequence([task1, task2, task3])

# Check feasibility
feasible = bridge.check_feasibility(task_id)
```

### Memory Integration

```python
from Pixi.knowledge_system import MemoryKnowledgeBridge

bridge = MemoryKnowledgeBridge(knowledge, memory_system)

# Memorize insights
bridge.memorize_insights({
    "text": "Key finding about AI trends",
    "entities": ["AI", "machine learning"],
    "confidence": 0.9
})

# Export snapshot
snapshot = bridge.export_knowledge_snapshot()
```

## Data Models

### Entity

```python
@dataclass
class Entity:
    entity_id: str              # Unique identifier
    label: str                  # Display name
    kind: str                   # Entity type (person, organization, etc.)
    confidence: float           # 0.0-1.0 confidence level
    properties: Dict[str, Any]  # Extended properties
    created_at: str             # ISO timestamp
    updated_at: str             # ISO timestamp
    
    # Relationships (populated on demand)
    incoming_relations: List[Relationship]
    outgoing_relations: List[Relationship]
```

### Relationship

```python
@dataclass
class Relationship:
    relation_id: str       # Unique identifier
    from_entity_id: str    # Source entity
    to_entity_id: str      # Target entity
    relation_type: str     # Type of relationship
    confidence: float      # 0.0-1.0 confidence
    properties: Dict[str, Any]
    created_at: str        # ISO timestamp
    inferred: bool         # Is this inferred vs explicit?
```

### KnowledgeSnapshot

```python
@dataclass
class KnowledgeSnapshot:
    timestamp: str              # When snapshot was taken
    entity_count: int           # Total entities
    relationship_count: int     # Total relationships
    entity_kinds: List[str]     # Types of entities present
    relation_types: List[str]   # Types of relationships
    last_update_source: str     # Last update source
    health_status: str          # healthy/degraded/critical
```

## Configuration

### KnowledgeCore Initialization

```python
knowledge = KnowledgeCore(
    memory_system=memory,  # Optional memory system for integration
)
```

### Entity Extraction Configuration

Entity extraction behavior can be tuned via confidence thresholds and pattern sets. Default patterns handle:
- Email addresses
- URLs
- Code references
- Quoted phrases
- Measurements with units
- Capitalized noun phrases

### Graph Consolidation

```python
result = knowledge.consolidate(
    similarity_threshold=0.85  # Adjust entity merging threshold
)
```

## Performance Considerations

### Entity Query Performance
- **Index**: Uses fast lookup by label and kind
- **Limit**: Specify `limit` parameter to reduce results
- **Filtering**: Use `kind` filter to narrow search

### Graph Size Management
- Monitor with `get_snapshot()` and `get_diagnostics()`
- Run periodic `consolidate()` to merge duplicates
- Export/archive old snapshots via memory system

### Memory Usage
- In-memory graph is suitable for ~100K entities
- For larger knowledge bases, consider persistence layer
- Relationship count grows as O(nÂ²) in worst case

## Extending the Knowledge System

### Custom Entity Extractors

```python
from Pixi.knowledge_system.entity_extractor import EntityExtractor, ExtractedEntity

class CustomExtractor(EntityExtractor):
    def extract_domain_specific(self, text: str) -> List[ExtractedEntity]:
        # Custom extraction logic
        pass
```

### Custom Relation Types

Add new relationship types to `RelationBuilder`:

```python
# In relation_builder.py
CUSTOM_RELATIONS = {
    "manages": {"inverse": "managed_by", "symmetric": False},
    "collaborates_with": {"inverse": "collaborates_with", "symmetric": True},
}
```

### Custom Search/Retrieval

Extend `KnowledgeRetriever` for domain-specific search:

```python
class CustomRetriever(KnowledgeRetriever):
    def search_by_domain(self, domain: str) -> List[Entity]:
        # Custom search logic
        pass
```

## Troubleshooting

### Issue: Knowledge graph not growing

**Cause**: Extraction confidence too high, or weak input

**Solution**:
- Check extraction results: `extractor.extract_from_text(text)`
- Verify entity confidence levels
- Lower confidence thresholds if needed

### Issue: Many duplicate entities

**Cause**: Similar entities not consolidated

**Solution**:
```python
# Run consolidation with lower threshold
result = knowledge.consolidate(similarity_threshold=0.7)
```

### Issue: Slow queries

**Cause**: Large graph or inefficient search

**Solution**:
- Use `limit` parameter in queries
- Add `kind` filter if known
- Check diagnostics: `knowledge.get_diagnostics()`

### Issue: Memory integration not working

**Cause**: Memory system not properly initialized

**Solution**:
```python
# Verify memory_system is passed to KnowledgeCore
knowledge = KnowledgeCore(memory_system=memory)

# Check integration status
status = bridge.get_memory_integrations_status()
assert status['memory_system_available']
```

## Testing

Run comprehensive tests:

```bash
python -m pytest tests/test_knowledge_system.py -v
```

Or run examples:

```bash
python examples/knowledge_system_examples.py
```

## Future Enhancements

### Planned Features
- [ ] Persistent storage (SQL/graph database backend)
- [ ] Similarity-based entity deduplication
- [ ] Inferred relationship types
- [ ] Entity temporal evolution tracking
- [ ] Distributed knowledge graph support
- [ ] Knowledge graph visualization
- [ ] Advanced inference engines
- [ ] Natural language query interface

### Open Issues
- Performance optimization for large graphs
- Better confidence propagation
- More sophisticated relationship inference
- Circular dependency handling in planning

## Related Documentation

- **Mempory System**: See `MEMORY_SYSTEM.md`
- **Reasoning Engine**: See `REASONING_ENGINE.md`
- **Planning Engine**: See `PLANNING_ENGINE.md`
- **Architecture Overview**: See `ARCHITECTURE.md`

## License

Part of the Pixi AI Architecture. See LICENSE file for details.

