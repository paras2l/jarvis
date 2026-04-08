"""Examples of using Pixi Knowledge System with various integrations.

Demonstrates:
- Learning from various sources
- Querying and reasoning over knowledge
- Planning with knowledge support
- Memory integration
"""

from __future__ import annotations

from Pixi.knowledge_system import (
    KnowledgeCore,
    ReasoningKnowledgeBridge,
    MemoryKnowledgeBridge,
    PlanningKnowledgeBridge,
)


def example_basic_learning() -> None:
    """Basic learning and querying example."""
    print("=" * 60)
    print("Example 1: Basic Learning and Querying")
    print("=" * 60)

    # Initialize knowledge system
    knowledge = KnowledgeCore()

    # Learn from text
    text = "Alice Smith is a senior software engineer at TechCorp. "
    text += "She specializes in machine learning and Python. "
    text += "Bob Johnson is her colleague who works on cloud infrastructure."

    result = knowledge.learn_from_text(text)

    print(f"\nLearned from text:")
    print(f"  - Entities added: {result.get('entities_added', 0)}")
    print(f"  - Relationships added: {result.get('relations_added', 0)}")

    # Query entities
    print("\nQuerying for Alice Smith:")
    entities = knowledge.query_entities("Alice", limit=5)

    for entity in entities:
        print(f"  - {entity.label} ({entity.kind}, confidence: {entity.confidence:.2f})")

    # Get snapshot
    snapshot = knowledge.get_snapshot()

    print(f"\nKnowledge snapshot:")
    print(f"  - Total entities: {snapshot.entity_count}")
    print(f"  - Total relationships: {snapshot.relationship_count}")
    print(f"  - Health status: {snapshot.health_status}")


def example_learning_from_observations() -> None:
    """Learning from system observations example."""
    print("\n" + "=" * 60)
    print("Example 2: Learning from Observations")
    print("=" * 60)

    knowledge = KnowledgeCore()

    # Simulate perception observations
    observations = {
        "objects": [
            {
                "name": "MacBook Pro",
                "type": "computer",
                "confidence": 0.98,
                "description": "14-inch laptop with M1 chip",
            },
            {
                "name": "Standing Desk",
                "type": "furniture",
                "confidence": 0.95,
                "description": "Electric standing desk",
            },
        ],
        "persons": [
            {
                "name": "Sarah",
                "confidence": 0.92,
                "description": "Engineer working at the computer",
            }
        ],
        "events": [
            {
                "type": "code_editing",
                "confidence": 0.88,
                "description": "Person typing code in editor",
            }
        ],
    }

    result = knowledge.learn_from_observations(observations)

    print(f"\nLearned from observations:")
    print(f"  - Entities added: {result.get('entities_added', 0)}")

    # Query what we learned
    print("\nQuerying observed entities:")

    for obj in observations.get("objects", []):
        name = obj.get("name", "")
        entities = knowledge.query_entities(name, limit=1)

        if entities:
            print(f"  - Found: {entities[0].label} ({entities[0].kind})")


def example_reasoning_integration() -> None:
    """Reasoning engine integration example."""
    print("\n" + "=" * 60)
    print("Example 3: Reasoning Integration")
    print("=" * 60)

    knowledge = KnowledgeCore()
    reasoning_bridge = ReasoningKnowledgeBridge(knowledge)

    # Learn some facts
    facts = [
        "Python is a programming language used for machine learning",
        "TensorFlow is a machine learning framework written in Python",
        "Alice specializes in machine learning using Python and TensorFlow",
    ]

    for fact in facts:
        knowledge.learn_from_text(fact)

    print("\nSearching knowledge for reasoning:")

    # Search with filters
    results = reasoning_bridge.search_knowledge_for_reasoning(
        "machine learning", filters={"limit": 5}
    )

    for entity in results:
        print(f"  - {entity.label} ({entity.kind})")
        print(f"    Incoming relations: {len(entity.incoming_relations)}")
        print(f"    Outgoing relations: {len(entity.outgoing_relations)}")

    # Find connections (reasoning about relationships)
    print("\nFinding connections (if entities exist):")

    if len(results) >= 2:
        entity1_id = results[0].entity_id
        entity2_id = results[1].entity_id

        connections = reasoning_bridge.find_relationship_between(entity1_id, entity2_id)

        print(f"  - From: {results[0].label}")
        print(f"  - To: {results[1].label}")
        print(f"  - Connection strength: {connections.get('connection_strength', 0):.2f}")
        print(f"  - Direct distance: {connections.get('direct_distance', 0)}")


def example_planning_integration() -> None:
    """Planning engine integration example."""
    print("\n" + "=" * 60)
    print("Example 4: Planning Integration")
    print("=" * 60)

    knowledge = KnowledgeCore()
    planning_bridge = PlanningKnowledgeBridge(knowledge)

    # Learn task relationships
    tasks = [
        "Design system requirements for the new project",
        "Implement core components of the system",
        "Write unit tests for each component",
        "Deploy to production environment",
    ]

    # Simulated relationships
    text = (
        "To Implement core components, first Design system requirements. "
        "To Write unit tests, first Implement core components. "
        "To Deploy to production, first Write unit tests."
    )

    knowledge.learn_from_text(text)

    print("\nAnalyzing task dependencies:")

    # For each task, analyze
    for i, task in enumerate(tasks):
        print(f"\nTask: {task}")

        # Estimate effort (simplified - using task index)
        result = planning_bridge.estimate_effort(f"task_{i}")

        if result.get("success"):
            print(f"  - Estimated effort: {result.get('estimated_effort', 0):.2f}")
            print(f"  - Confidence: {result.get('confidence', 0):.2f}")

        # Find prerequisites
        prereqs = planning_bridge.find_prerequisites(f"task_{i}")
        if prereqs.get("prerequisites"):
            print(f"  - Prerequisites: {len(prereqs.get('prerequisites', []))}")

    # Plan sequence
    print("\nPlanning task sequence:")
    task_ids = [f"task_{i}" for i in range(len(tasks))]
    sequence_result = planning_bridge.plan_task_sequence(task_ids)

    if sequence_result.get("is_valid_sequence"):
        print(f"  - Valid sequence found")
        print(f"  - Sequence length: {len(sequence_result.get('sequence', []))}")
    else:
        print(f"  - No valid sequence (might have cycles)")


def example_memory_integration() -> None:
    """Memory system integration example."""
    print("\n" + "=" * 60)
    print("Example 5: Memory Integration")
    print("=" * 60)

    knowledge = KnowledgeCore()

    # Create a mock memory system for demonstration
    class MockMemorySystem:
        def remember_short_term(self, key: str, value: dict, tags: list) -> None:
            print(f"  [Memory] Stored short-term: {key}")

        def remember_long_term(self, key: str, value: dict, source: str, importance: float, tags: list) -> None:
            print(f"  [Memory] Stored long-term: {key} (importance: {importance})")

    memory = MockMemorySystem()
    memory_bridge = MemoryKnowledgeBridge(knowledge, memory)

    # Learn something
    knowledge.learn_from_text("The Pixi system is an AI assistant for automation")

    print("\nMemorizing insights:")

    # Create and memorize an insight
    insight = {
        "text": "Pixi provides intelligent task automation capabilities",
        "entities": ["Pixi", "Task Automation"],
        "confidence": 0.85,
        "source": "knowledge_reasoning",
    }

    memory = memory_bridge.memorize_insights(insight)

    if memory:
        print(f"\nCreated memory:")
        print(f"  - ID: {memory.memory_id}")
        print(f"  - Type: {memory.memory_type}")
        print(f"  - Importance: {memory.importance}")

    # Export snapshot
    print("\nExporting knowledge snapshot:")
    snapshot = memory_bridge.export_knowledge_snapshot()

    print(f"  - Entities in snapshot: {snapshot.get('entity_count', 0)}")
    print(f"  - Relationships in snapshot: {snapshot.get('relationship_count', 0)}")

    # Check integration status
    print("\nMemory integration status:")
    status = memory_bridge.get_memory_integrations_status()

    print(f"  - Memory system available: {status.get('memory_system_available')}")
    print(f"  - Export buffer size: {status.get('export_buffer_size')}")


def example_consolidated_workflow() -> None:
    """Complete workflow using all integrations."""
    print("\n" + "=" * 60)
    print("Example 6: Consolidated Workflow")
    print("=" * 60)

    # Create all components
    knowledge = KnowledgeCore()
    reasoning_bridge = ReasoningKnowledgeBridge(knowledge)
    planning_bridge = PlanningKnowledgeBridge(knowledge)

    print("\nStep 1: Learning phase")
    print("-" * 40)

    # Learn from multiple sources
    text = """
    The Acme Company has Development, QA, and DevOps teams.
    The Development team is led by Alice and includes Bob.
    They are working on the Project Pixi initiative.
    Project Pixi requires Python, machine learning, and cloud infrastructure.
    """

    knowledge.learn_from_text(text)
    print("âœ“ Learned from organizational text")

    observations = {
        "objects": [
            {"name": "Development Server", "type": "infrastructure", "confidence": 0.95, "description": ""},
        ],
        "persons": [
            {"name": "Alice", "confidence": 0.98, "description": "Team lead"},
            {"name": "Bob", "confidence": 0.96, "description": "Developer"},
        ],
    }

    knowledge.learn_from_observations(observations)
    print("âœ“ Learned from observations")

    print("\nStep 2: Reasoning phase")
    print("-" * 40)

    # Search for entities relevant to reasoning
    entities = reasoning_bridge.search_knowledge_for_reasoning(
        "Project Pixi", filters={"limit": 10}
    )

    print(f"âœ“ Found {len(entities)} entities related to Project Pixi")

    for entity in entities[:3]:
        print(f"  - {entity.label}")

    print("\nStep 3: Planning phase")
    print("-" * 40)

    # Create a hypothetical task for the project
    task_id = "implement_Pixi"

    prereqs = planning_bridge.find_prerequisites(task_id)
    effort = planning_bridge.estimate_effort(task_id)

    print(f"âœ“ Task prerequisites: {len(prereqs.get('prerequisites', []))}")

    if effort.get("success"):
        print(f"âœ“ Estimated effort: {effort.get('estimated_effort', 0):.2f}")

    print("\nStep 4: Knowledge summary")
    print("-" * 40)

    snapshot = knowledge.get_snapshot()

    print(f"âœ“ Knowledge graph state:")
    print(f"  - Entities: {snapshot.entity_count}")
    print(f"  - Relationships: {snapshot.relationship_count}")
    print(f"  - Health: {snapshot.health_status}")


def main() -> None:
    """Run all examples."""
    print("\n")
    print("â•”" + "=" * 58 + "â•—")
    print("â•‘" + " " * 58 + "â•‘")
    print("â•‘" + "  Pixi KNOWLEDGE SYSTEM EXAMPLES".center(58) + "â•‘")
    print("â•‘" + " " * 58 + "â•‘")
    print("â•š" + "=" * 58 + "â•")

    try:
        example_basic_learning()
        example_learning_from_observations()
        example_reasoning_integration()
        example_planning_integration()
        example_memory_integration()
        example_consolidated_workflow()

        print("\n" + "=" * 60)
        print("All examples completed successfully!")
        print("=" * 60 + "\n")

    except Exception as e:
        print(f"\nâŒ Error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()

