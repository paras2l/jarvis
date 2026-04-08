"""
KNOWLEDGE SYSTEM - QUICK REFERENCE & ARCHITECTURE SUMMARY
=========================================================

This document provides a quick overview of the Knowledge System architecture,
key APIs, and integration points for the Jarvis AI system.

═══════════════════════════════════════════════════════════════════════════════

CORE ENTRY POINT
────────────────

from jarvis.knowledge_system import KnowledgeCore

knowledge = KnowledgeCore(memory_system=memory)

MAIN OPERATIONS:
  • knowledge.learn_from_text(text) → {"entities_added": N, "relations_added": N}
  • knowledge.query_entities(query) → List[Entity]
  • knowledge.get_reasoning_context(entity) → Dict with full context
  • knowledge.find_connections(entity1, entity2) → List[paths]
  • knowledge.get_task_knowledge(task_ids) → {entities, relationships}
  • knowledge.consolidate() → {consolidated_count}
  • knowledge.get_snapshot() → KnowledgeSnapshot

═══════════════════════════════════════════════════════════════════════════════

LEARNING SOURCES
────────────────

1. TEXT LEARNING
   knowledge.learn_from_text(
       "Alice Smith works at TechCorp using Python and machine learning"
   )
   → Extracts: Entities (person, organization, tools)
              Relationships (works_at, uses)

2. OBSERVATION LEARNING
   knowledge.learn_from_observations({
       "objects": [{"name": "laptop", "type": "computer", "confidence": 0.95}],
       "persons": [{"name": "Alice", "confidence": 0.98}],
       "events": [{"type": "code_editing", "confidence": 0.88}]
   })
   → Extracts: Entities from perceived objects, people, and events

3. RESEARCH LEARNING
   knowledge.learn_from_research({
       "topic": "Machine Learning Trends",
       "entities": ["deep learning", "transformers"],
       "relationships": [...]
   })
   → Ingests: Structured research findings

═══════════════════════════════════════════════════════════════════════════════

ENTITY TYPES
────────────

The system recognizes these built-in entity kinds:

  • person              → Individual people (Alice, Bob)
  • organization        → Companies, teams (TechCorp, DevOps Team)
  • location            → Places (San Francisco, Office A)
  • task                → Goals, work items (Implement Feature X)
  • concept             → Ideas, domains (Machine Learning, Security)
  • technology          → Tools, frameworks (Python, TensorFlow)
  • process             → Actions, workflows (Code Review, Deployment)
  • attribute           → Properties, values (complexity: high)
  • data_point          → Numbers, facts (cost: $50000)
  • system              → Software/hardware systems (Kubernetes)

═══════════════════════════════════════════════════════════════════════════════

RELATIONSHIP TYPES
──────────────────

Common relationships include:

  • works_at            → Person works at Organization
  • depends_on          → X depends on Y (tasks, components)
  • uses                → Person/System uses Technology
  • creates             → Person creates Output
  • part_of             → X is part of Y
  • has_attribute       → X has attribute Y
  • precedes            → X precedes Y (ordering)
  • collaborates_with   → X collaborates with Y

See relation_builder.py for complete list.

═══════════════════════════════════════════════════════════════════════════════

INTEGRATION BRIDGES
───────────────────

THREE specialized bridges for different system components:

┌─ REASONING BRIDGE ─────────────────────────────────────────────────────────┐
│                                                                               │
│  from jarvis.knowledge_system import ReasoningKnowledgeBridge              │
│                                                                               │
│  bridge = ReasoningKnowledgeBridge(knowledge)                              │
│                                                                               │
│  KEY METHODS:                                                               │
│    • bridge.search_knowledge_for_reasoning(query, filters)                 │
│    • bridge.get_context_for_entity(entity_id, depth)                       │
│    • bridge.find_relationship_between(entity1, entity2)                    │
│    • bridge.get_task_context(task_ids)                                     │
│    • bridge.learn_from_reasoning(result) [feedback loop]                   │
│                                                                               │
│  USE: When reasoning engine needs knowledge for logical inference          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ PLANNING BRIDGE ──────────────────────────────────────────────────────────┐
│                                                                               │
│  from jarvis.knowledge_system import PlanningKnowledgeBridge               │
│                                                                               │
│  bridge = PlanningKnowledgeBridge(knowledge)                               │
│                                                                               │
│  KEY METHODS:                                                               │
│    • bridge.analyze_task_dependencies(task_id)                             │
│    • bridge.find_prerequisites(task_id)                                    │
│    • bridge.find_resources(task_id)                                        │
│    • bridge.check_feasibility(task_id, constraints)                        │
│    • bridge.decompose_task(task_id)                                        │
│    • bridge.estimate_effort(task_id)                                       │
│    • bridge.plan_task_sequence(task_ids)                                   │
│                                                                               │
│  USE: When planning engine needs task analysis and sequencing              │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─ MEMORY BRIDGE ────────────────────────────────────────────────────────────┐
│                                                                               │
│  from jarvis.knowledge_system import MemoryKnowledgeBridge                 │
│                                                                               │
│  bridge = MemoryKnowledgeBridge(knowledge, memory_system)                  │
│                                                                               │
│  KEY METHODS:                                                               │
│    • bridge.memorize_entity(entity_id, importance)                         │
│    • bridge.memorize_relationships(entity_id)                              │
│    • bridge.memorize_insights(insights_dict)                               │
│    • bridge.recall_memories_as_knowledge(query)                            │
│    • bridge.consolidate_knowledge_memories()                               │
│    • bridge.export_knowledge_snapshot()                                    │
│                                                                               │
│  USE: For bidirectional knowledge flow between Knowledge and Memory        │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════

QUERYING PATTERNS
─────────────────

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

═══════════════════════════════════════════════════════════════════════════════

DATA MODELS AT A GLANCE
──────────────────────

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

═══════════════════════════════════════════════════════════════════════════════

SYSTEM INTEGRATION POINTS
────────────────────────

1. PERCEPTION → KNOWLEDGE SYSTEM
   Sensors/Observations → learn_from_observations()
   (Use MemoryKnowledgeBridge to also store in memory)

2. RESEARCH AGENT → KNOWLEDGE SYSTEM  
   Research results → learn_from_research()
   (Structured findings, confidence scores)

3. KNOWLEDGE SYSTEM ↔ REASONING ENGINE
   ← ReasoningKnowledgeBridge for context
   → learn_from_reasoning() for feedback

4. KNOWLEDGE SYSTEM ↔ PLANNING ENGINE
   ← PlanningKnowledgeBridge for task analysis
   → Updates from plan execution

5. KNOWLEDGE SYSTEM ↔ MEMORY SYSTEM
   ← memorize_*() to export to memory
   ← recall_memories_as_knowledge() to import from memory
   → Periodic snapshot exports via MemoryKnowledgeBridge

6. SELF-IMPROVEMENT → KNOWLEDGE SYSTEM
   Consolidate duplicates, infer relationships
   Check health with get_diagnostics()

═══════════════════════════════════════════════════════════════════════════════

COMMON WORKFLOWS
────────────────

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
  1. Perception → learn_from_observations()
  2. Reasoning → ReasoningBridge.search_knowledge_for_reasoning()
  3. Planning → PlanningBridge.plan_task_sequence()
  4. Memory ← MemoryBridge.memorize_insights()
  5. Self-Improve → knowledge.consolidate()

═══════════════════════════════════════════════════════════════════════════════

PERFORMANCE HINTS
─────────────────

FAST OPERATIONS:
  • find_entity(label) — Direct lookup, O(1)
  • get_entity_info(id) — Direct lookup, O(1)
  • get_snapshot() — Quick stats, O(1)

MODERATE OPERATIONS:
  • query_entities(query) — Index search, O(log n)
  • get_reasoning_context(depth) — Graph traversal, O(n^depth)

SLOWER OPERATIONS:
  • consolidate() — Compares all entities, O(n²)
  • find_connections() — Path finding, O(n³) worst case

OPTIMIZATION TIPS:
  • Use kind filter to narrow queries: query_entities(q, kind="person")
  • Use limit parameter: query_entities(q, limit=10)
  • Run consolidate() periodically, not continuously
  • Monitor with get_diagnostics() for large graphs

═══════════════════════════════════════════════════════════════════════════════

TROUBLESHOOTING
───────────────

ISSUE: Entities not being found
  → Check extraction confidence (may be too strict)
  → Verify entity was actually extracted
  → Lower confidence thresholds if needed

ISSUE: Relationships missing
  → Check RelationBuilder patterns
  → May need to add domain-specific relationship types
  → Run consolidate() to discover inferred relationships

ISSUE: Slow queries
  → Check graph size: get_snapshot()
  → Use limit parameter to restrict results
  → Use kind filter if possible
  → Consider running consolidate() to merge duplicates

ISSUE: Memory not integrating
  → Verify memory_system passed to KnowledgeCore init
  → Check integration status: bridge.get_memory_integrations_status()
  → Ensure memory system implements required interface

═══════════════════════════════════════════════════════════════════════════════

FILE STRUCTURE
──────────────

jarvis/knowledge_system/
  ├── __init__.py                      # Package exports
  ├── knowledge_core.py               # Main orchestrator (★ START HERE)
  ├── knowledge_graph.py              # Graph database
  ├── entity_extractor.py             # Entity extraction
  ├── relation_builder.py             # Relationship building
  ├── knowledge_retriever.py          # Query interface
  ├── knowledge_updater.py            # Graph updates
  ├── reasoning_knowledge_bridge.py   # Reasoning integration
  ├── memory_knowledge_bridge.py      # Memory integration
  └── planning_knowledge_bridge.py    # Planning integration

tests/
  └── test_knowledge_system.py        # Comprehensive tests

examples/
  └── knowledge_system_examples.py    # 6 detailed examples

docs/
  └── KNOWLEDGE_SYSTEM.md             # Full documentation

═══════════════════════════════════════════════════════════════════════════════

GETTING STARTED (3 STEPS)
────────────────────────

1. INITIALIZE
   from jarvis.knowledge_system import KnowledgeCore
   knowledge = KnowledgeCore()

2. LEARN
   knowledge.learn_from_text("Your domain text here")
   
3. QUERY
   entities = knowledge.query_entities("search term")
   print([e.label for e in entities])

═══════════════════════════════════════════════════════════════════════════════

ADDITIONAL RESOURCES
─────────────────────

  • Full Docs: docs/KNOWLEDGE_SYSTEM.md
  • Examples: examples/knowledge_system_examples.py
  • Tests: tests/test_knowledge_system.py
  • Integration: See parent system documentation

═══════════════════════════════════════════════════════════════════════════════
"""

# This file is for reference only - no code to execute
print(__doc__)
