"""
KNOWLEDGE SYSTEM - QUICK REFERENCE & ARCHITECTURE SUMMARY
=========================================================

This document provides a quick overview of the Knowledge System architecture,
key APIs, and integration points for the Pixi AI system.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

CORE ENTRY POINT
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

from Pixi.knowledge_system import KnowledgeCore

knowledge = KnowledgeCore(memory_system=memory)

MAIN OPERATIONS:
  â€¢ knowledge.learn_from_text(text) â†’ {"entities_added": N, "relations_added": N}
  â€¢ knowledge.query_entities(query) â†’ List[Entity]
  â€¢ knowledge.get_reasoning_context(entity) â†’ Dict with full context
  â€¢ knowledge.find_connections(entity1, entity2) â†’ List[paths]
  â€¢ knowledge.get_task_knowledge(task_ids) â†’ {entities, relationships}
  â€¢ knowledge.consolidate() â†’ {consolidated_count}
  â€¢ knowledge.get_snapshot() â†’ KnowledgeSnapshot

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

LEARNING SOURCES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

1. TEXT LEARNING
   knowledge.learn_from_text(
       "Alice Smith works at TechCorp using Python and machine learning"
   )
   â†’ Extracts: Entities (person, organization, tools)
              Relationships (works_at, uses)

2. OBSERVATION LEARNING
   knowledge.learn_from_observations({
       "objects": [{"name": "laptop", "type": "computer", "confidence": 0.95}],
       "persons": [{"name": "Alice", "confidence": 0.98}],
       "events": [{"type": "code_editing", "confidence": 0.88}]
   })
   â†’ Extracts: Entities from perceived objects, people, and events

3. RESEARCH LEARNING
   knowledge.learn_from_research({
       "topic": "Machine Learning Trends",
       "entities": ["deep learning", "transformers"],
       "relationships": [...]
   })
   â†’ Ingests: Structured research findings

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ENTITY TYPES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

The system recognizes these built-in entity kinds:

  â€¢ person              â†’ Individual people (Alice, Bob)
  â€¢ organization        â†’ Companies, teams (TechCorp, DevOps Team)
  â€¢ location            â†’ Places (San Francisco, Office A)
  â€¢ task                â†’ Goals, work items (Implement Feature X)
  â€¢ concept             â†’ Ideas, domains (Machine Learning, Security)
  â€¢ technology          â†’ Tools, frameworks (Python, TensorFlow)
  â€¢ process             â†’ Actions, workflows (Code Review, Deployment)
  â€¢ attribute           â†’ Properties, values (complexity: high)
  â€¢ data_point          â†’ Numbers, facts (cost: $50000)
  â€¢ system              â†’ Software/hardware systems (Kubernetes)

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

RELATIONSHIP TYPES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Common relationships include:

  â€¢ works_at            â†’ Person works at Organization
  â€¢ depends_on          â†’ X depends on Y (tasks, components)
  â€¢ uses                â†’ Person/System uses Technology
  â€¢ creates             â†’ Person creates Output
  â€¢ part_of             â†’ X is part of Y
  â€¢ has_attribute       â†’ X has attribute Y
  â€¢ precedes            â†’ X precedes Y (ordering)
  â€¢ collaborates_with   â†’ X collaborates with Y

See relation_builder.py for complete list.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

INTEGRATION BRIDGES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

THREE specialized bridges for different system components:

â”Œâ”€ REASONING BRIDGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                               â”‚
â”‚  from Pixi.knowledge_system import ReasoningKnowledgeBridge              â”‚
â”‚                                                                               â”‚
â”‚  bridge = ReasoningKnowledgeBridge(knowledge)                              â”‚
â”‚                                                                               â”‚
â”‚  KEY METHODS:                                                               â”‚
â”‚    â€¢ bridge.search_knowledge_for_reasoning(query, filters)                 â”‚
â”‚    â€¢ bridge.get_context_for_entity(entity_id, depth)                       â”‚
â”‚    â€¢ bridge.find_relationship_between(entity1, entity2)                    â”‚
â”‚    â€¢ bridge.get_task_context(task_ids)                                     â”‚
â”‚    â€¢ bridge.learn_from_reasoning(result) [feedback loop]                   â”‚
â”‚                                                                               â”‚
â”‚  USE: When reasoning engine needs knowledge for logical inference          â”‚
â”‚                                                                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€ PLANNING BRIDGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                               â”‚
â”‚  from Pixi.knowledge_system import PlanningKnowledgeBridge               â”‚
â”‚                                                                               â”‚
â”‚  bridge = PlanningKnowledgeBridge(knowledge)                               â”‚
â”‚                                                                               â”‚
â”‚  KEY METHODS:                                                               â”‚
â”‚    â€¢ bridge.analyze_task_dependencies(task_id)                             â”‚
â”‚    â€¢ bridge.find_prerequisites(task_id)                                    â”‚
â”‚    â€¢ bridge.find_resources(task_id)                                        â”‚
â”‚    â€¢ bridge.check_feasibility(task_id, constraints)                        â”‚
â”‚    â€¢ bridge.decompose_task(task_id)                                        â”‚
â”‚    â€¢ bridge.estimate_effort(task_id)                                       â”‚
â”‚    â€¢ bridge.plan_task_sequence(task_ids)                                   â”‚
â”‚                                                                               â”‚
â”‚  USE: When planning engine needs task analysis and sequencing              â”‚
â”‚                                                                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â”Œâ”€ MEMORY BRIDGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                                               â”‚
â”‚  from Pixi.knowledge_system import MemoryKnowledgeBridge                 â”‚
â”‚                                                                               â”‚
â”‚  bridge = MemoryKnowledgeBridge(knowledge, memory_system)                  â”‚
â”‚                                                                               â”‚
â”‚  KEY METHODS:                                                               â”‚
â”‚    â€¢ bridge.memorize_entity(entity_id, importance)                         â”‚
â”‚    â€¢ bridge.memorize_relationships(entity_id)                              â”‚
â”‚    â€¢ bridge.memorize_insights(insights_dict)                               â”‚
â”‚    â€¢ bridge.recall_memories_as_knowledge(query)                            â”‚
â”‚    â€¢ bridge.consolidate_knowledge_memories()                               â”‚
â”‚    â€¢ bridge.export_knowledge_snapshot()                                    â”‚
â”‚                                                                               â”‚
â”‚  USE: For bidirectional knowledge flow between Knowledge and Memory        â”‚
â”‚                                                                               â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

QUERYING PATTERNS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Pattern 1: Simple Entity Search
  entities = knowledge.query_entities("Python")
  for e in entities:
      print(f"{e.label} ({e.kind})")

Pattern 2: Filtered Search
  entities = knowledge.query_entities("engineer", kind="person", limit=5)

Pattern 3: Get Full Context
  entity = knowledge.find_entity("Alice")
  context = knowledge.get_reasoning_context(entity, max_depth=2)

Pattern 4: Find Connections
  paths = knowledge.find_connections(alice_id, project_id)
  for path in paths:
      for rel in path:
          print(f"{rel['from']} --{rel['type']}--> {rel['to']}")

Pattern 5: Task Knowledge Retrieval
  task_knowledge = knowledge.get_task_knowledge(["task_1", "task_2"])
  entities = task_knowledge["entities"]
  relationships = task_knowledge["relationships"]

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

DATA MODELS AT A GLANCE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ENTITY:
  Fields: entity_id, label, kind, confidence, properties
  Example: Entity(id="alice_1", label="Alice Smith", kind="person", 
                  confidence=0.95, properties={"title": "Engineer"})

RELATIONSHIP:
  Fields: relation_id, from_entity_id, to_entity_id, relation_type, confidence
  Example: Relationship(id="rel_1", from_entity_id="alice_1", 
                        to_entity_id="techcorp_1", relation_type="works_at", 
                        confidence=0.98)

KNOWLEDGE_SNAPSHOT:
  Fields: timestamp, entity_count, relationship_count, entity_kinds, 
          relation_types, health_status
  Use: Track knowledge graph state over time

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

SYSTEM INTEGRATION POINTS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

1. PERCEPTION â†’ KNOWLEDGE SYSTEM
   Sensors/Observations â†’ learn_from_observations()
   (Use MemoryKnowledgeBridge to also store in memory)

2. RESEARCH AGENT â†’ KNOWLEDGE SYSTEM  
   Research results â†’ learn_from_research()
   (Structured findings, confidence scores)

3. KNOWLEDGE SYSTEM â†” REASONING ENGINE
   â† ReasoningKnowledgeBridge for context
   â†’ learn_from_reasoning() for feedback

4. KNOWLEDGE SYSTEM â†” PLANNING ENGINE
   â† PlanningKnowledgeBridge for task analysis
   â†’ Updates from plan execution

5. KNOWLEDGE SYSTEM â†” MEMORY SYSTEM
   â† memorize_*() to export to memory
   â† recall_memories_as_knowledge() to import from memory
   â†’ Periodic snapshot exports via MemoryKnowledgeBridge

6. SELF-IMPROVEMENT â†’ KNOWLEDGE SYSTEM
   Consolidate duplicates, infer relationships
   Check health with get_diagnostics()

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

COMMON WORKFLOWS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

WORKFLOW 1: LEARN AND REASON
  1. knowledge.learn_from_text(input_text)
  2. entities = knowledge.query_entities(search_term)
  3. Use ReasoningBridge to get context for inference

WORKFLOW 2: LEARN AND PLAN
  1. knowledge.learn_from_text(task_description)
  2. Use PlanningBridge to analyze dependencies
  3. plan_bridge.plan_task_sequence(tasks)

WORKFLOW 3: BIDIRECTIONAL MEMORY SYNC
  1. Extract insights from reasoning: insights = reason(context)
  2. Memorize insights: bridge.memorize_insights(insights)
  3. Periodically export: snapshot = bridge.export_knowledge_snapshot()
  4. Recall on startup: recalled = bridge.recall_memories_as_knowledge(query)

WORKFLOW 4: FULL SYSTEM LOOP
  1. Perception â†’ learn_from_observations()
  2. Reasoning â†’ ReasoningBridge.search_knowledge_for_reasoning()
  3. Planning â†’ PlanningBridge.plan_task_sequence()
  4. Memory â† MemoryBridge.memorize_insights()
  5. Self-Improve â†’ knowledge.consolidate()

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

PERFORMANCE HINTS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

FAST OPERATIONS:
  â€¢ find_entity(label) â€” Direct lookup, O(1)
  â€¢ get_entity_info(id) â€” Direct lookup, O(1)
  â€¢ get_snapshot() â€” Quick stats, O(1)

MODERATE OPERATIONS:
  â€¢ query_entities(query) â€” Index search, O(log n)
  â€¢ get_reasoning_context(depth) â€” Graph traversal, O(n^depth)

SLOWER OPERATIONS:
  â€¢ consolidate() â€” Compares all entities, O(nÂ²)
  â€¢ find_connections() â€” Path finding, O(nÂ³) worst case

OPTIMIZATION TIPS:
  â€¢ Use kind filter to narrow queries: query_entities(q, kind="person")
  â€¢ Use limit parameter: query_entities(q, limit=10)
  â€¢ Run consolidate() periodically, not continuously
  â€¢ Monitor with get_diagnostics() for large graphs

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

TROUBLESHOOTING
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ISSUE: Entities not being found
  â†’ Check extraction confidence (may be too strict)
  â†’ Verify entity was actually extracted
  â†’ Lower confidence thresholds if needed

ISSUE: Relationships missing
  â†’ Check RelationBuilder patterns
  â†’ May need to add domain-specific relationship types
  â†’ Run consolidate() to discover inferred relationships

ISSUE: Slow queries
  â†’ Check graph size: get_snapshot()
  â†’ Use limit parameter to restrict results
  â†’ Use kind filter if possible
  â†’ Consider running consolidate() to merge duplicates

ISSUE: Memory not integrating
  â†’ Verify memory_system passed to KnowledgeCore init
  â†’ Check integration status: bridge.get_memory_integrations_status()
  â†’ Ensure memory system implements required interface

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

FILE STRUCTURE
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Pixi/knowledge_system/
  â”œâ”€â”€ __init__.py                      # Package exports
  â”œâ”€â”€ knowledge_core.py               # Main orchestrator (â˜… START HERE)
  â”œâ”€â”€ knowledge_graph.py              # Graph database
  â”œâ”€â”€ entity_extractor.py             # Entity extraction
  â”œâ”€â”€ relation_builder.py             # Relationship building
  â”œâ”€â”€ knowledge_retriever.py          # Query interface
  â”œâ”€â”€ knowledge_updater.py            # Graph updates
  â”œâ”€â”€ reasoning_knowledge_bridge.py   # Reasoning integration
  â”œâ”€â”€ memory_knowledge_bridge.py      # Memory integration
  â””â”€â”€ planning_knowledge_bridge.py    # Planning integration

tests/
  â””â”€â”€ test_knowledge_system.py        # Comprehensive tests

examples/
  â””â”€â”€ knowledge_system_examples.py    # 6 detailed examples

docs/
  â””â”€â”€ KNOWLEDGE_SYSTEM.md             # Full documentation

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

GETTING STARTED (3 STEPS)
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

1. INITIALIZE
   from Pixi.knowledge_system import KnowledgeCore
   knowledge = KnowledgeCore()

2. LEARN
   knowledge.learn_from_text("Your domain text here")
   
3. QUERY
   entities = knowledge.query_entities("search term")
   print([e.label for e in entities])

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ADDITIONAL RESOURCES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  â€¢ Full Docs: docs/KNOWLEDGE_SYSTEM.md
  â€¢ Examples: examples/knowledge_system_examples.py
  â€¢ Tests: tests/test_knowledge_system.py
  â€¢ Integration: See parent system documentation

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
"""

# This file is for reference only - no code to execute
print(__doc__)

