"""Tests for Pixi Knowledge System.

Tests core functionality, integration points, and component interactions.
"""

from __future__ import annotations

import sys
import unittest
from typing import Any, Dict
from unittest.mock import Mock, patch, MagicMock

# Add the parent directory to path for imports
sys.path.insert(0, str((__file__).replace("\\", "/").rsplit("/", 3)[0]))

from Pixi.knowledge_system import (
    KnowledgeCore,
    KnowledgeGraph,
    EntityExtractor,
    RelationBuilder,
    ReasoningKnowledgeBridge,
    MemoryKnowledgeBridge,
    PlanningKnowledgeBridge,
)


class TestKnowledgeCore(unittest.TestCase):
    """Test KnowledgeCore orchestrator."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.knowledge = KnowledgeCore()

    def test_learn_from_text(self) -> None:
        """Test learning from text."""
        text = "John Smith works at Acme Corporation in New York."
        result = self.knowledge.learn_from_text(text, source="test")

        self.assertTrue(result.get("success", False))
        self.assertGreaterEqual(result.get("entities_added", 0), 0)

    def test_learn_from_observations(self) -> None:
        """Test learning from observations."""
        observations = {
            "objects": [
                {
                    "name": "computer",
                    "type": "device",
                    "confidence": 0.95,
                    "description": "A laptop computer",
                }
            ],
            "persons": [
                {
                    "name": "Alice",
                    "confidence": 0.9,
                    "description": "User at the computer",
                }
            ],
        }

        result = self.knowledge.learn_from_observations(observations)

        self.assertTrue(result.get("success", False))

    def test_query_entities(self) -> None:
        """Test entity querying."""
        # Learn something first
        self.knowledge.learn_from_text("Python is a programming language")

        # Query it
        results = self.knowledge.query_entities("Python", limit=5)

        # Results should be a list (even if empty)
        self.assertIsInstance(results, list)

    def test_get_snapshot(self) -> None:
        """Test getting knowledge snapshot."""
        snapshot = self.knowledge.get_snapshot()

        self.assertIsNotNone(snapshot)
        self.assertIsNotNone(snapshot.timestamp)
        self.assertGreaterEqual(snapshot.entity_count, 0)
        self.assertGreaterEqual(snapshot.relationship_count, 0)

    def test_consolidate(self) -> None:
        """Test consolidation."""
        result = self.knowledge.consolidate()

        self.assertTrue(result.get("success", False))
        self.assertIn("consolidated_count", result)

    def test_get_diagnostics(self) -> None:
        """Test getting diagnostics."""
        diagnostics = self.knowledge.get_diagnostics()

        self.assertIsNotNone(diagnostics)
        self.assertIn("graph", diagnostics)


class TestEntityExtractor(unittest.TestCase):
    """Test entity extraction."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.extractor = EntityExtractor()

    def test_extract_from_text(self) -> None:
        """Test text entity extraction."""
        text = "Alice and Bob are software engineers at TechCorp in San Francisco."

        entities = self.extractor.extract_from_text(text)

        self.assertIsInstance(entities, list)
        # Should find at least some entities
        self.assertGreater(len(entities), 0)

    def test_extract_from_observations(self) -> None:
        """Test observation entity extraction."""
        observations = {
            "objects": [
                {
                    "name": "desk",
                    "type": "furniture",
                    "confidence": 0.9,
                    "description": "A wooden desk",
                }
            ],
            "persons": [
                {
                    "name": "John",
                    "confidence": 0.95,
                    "description": "Man sitting at desk",
                }
            ],
            "events": [
                {
                    "type": "typing",
                    "confidence": 0.85,
                    "description": "Person typing on keyboard",
                }
            ],
        }

        entities = self.extractor.extract_from_observations(observations)

        self.assertIsInstance(entities, list)
        # Should extract at least the explicit entities
        labels = [e.label for e in entities]
        self.assertIn("John", labels)

    def test_extract_from_code(self) -> None:
        """Test code entity extraction."""
        code = """
        class DataProcessor:
            def process_data(self, data):
                return self.transform(data)
        """

        entities = self.extractor.extract_from_code(code)

        self.assertIsInstance(entities, list)
        labels = [e.label for e in entities]

        # Should find class and method names
        self.assertIn("DataProcessor", labels)
        self.assertIn("process_data", labels)

    def test_classify_entity(self) -> None:
        """Test entity classification."""
        # Test organization
        kind = self.extractor.classify_entity("Google Inc")
        self.assertIn(kind, ["organization", "concept"])

        # Test location
        kind = self.extractor.classify_entity("San Francisco")
        self.assertIn(kind, ["location", "concept"])


class TestReasoningKnowledgeBridge(unittest.TestCase):
    """Test reasoning integration bridge."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.knowledge = KnowledgeCore()
        self.bridge = ReasoningKnowledgeBridge(self.knowledge)

    def test_search_knowledge_for_reasoning(self) -> None:
        """Test knowledge search for reasoning."""
        # Learn something first
        self.knowledge.learn_from_text("Machine learning is a subset of AI")

        # Search for it
        entities = self.bridge.search_knowledge_for_reasoning("machine learning")

        self.assertIsInstance(entities, list)

    def test_find_relationship_between(self) -> None:
        """Test finding relationships between entities."""
        result = self.bridge.find_relationship_between("entity1", "entity2")

        self.assertIsNotNone(result)
        self.assertIn("paths", result)


class TestMemoryKnowledgeBridge(unittest.TestCase):
    """Test memory integration bridge."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.knowledge = KnowledgeCore()
        self.memory_system = Mock()  # Mock memory system
        self.bridge = MemoryKnowledgeBridge(self.knowledge, self.memory_system)

    def test_export_knowledge_snapshot(self) -> None:
        """Test exporting knowledge snapshot."""
        snapshot_data = self.bridge.export_knowledge_snapshot()

        self.assertIsNotNone(snapshot_data)
        self.assertIn("timestamp", snapshot_data)
        self.assertIn("entity_count", snapshot_data)

    def test_get_memory_integrations_status(self) -> None:
        """Test getting memory integration status."""
        status = self.bridge.get_memory_integrations_status()

        self.assertIsNotNone(status)
        self.assertIn("memory_system_available", status)
        self.assertTrue(status["memory_system_available"])


class TestPlanningKnowledgeBridge(unittest.TestCase):
    """Test planning integration bridge."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.knowledge = KnowledgeCore()
        self.bridge = PlanningKnowledgeBridge(self.knowledge)

    def test_analyze_task_dependencies(self) -> None:
        """Test task dependency analysis."""
        # Learn a task scenario
        self.knowledge.learn_from_text("Task A requires Task B to be completed first")

        # Analyze dependencies
        result = self.bridge.analyze_task_dependencies("task_a")

        self.assertIsNotNone(result)
        self.assertIn("dependencies", result)

    def test_find_prerequisites(self) -> None:
        """Test finding prerequisites."""
        result = self.bridge.find_prerequisites("task_1")

        self.assertIsNotNone(result)
        self.assertIsInstance(result.get("prerequisites", []), list)

    def test_find_resources(self) -> None:
        """Test finding resources."""
        result = self.bridge.find_resources("task_1")

        self.assertIsNotNone(result)
        self.assertIsInstance(result.get("resources", []), list)

    def test_estimate_effort(self) -> None:
        """Test effort estimation."""
        result = self.bridge.estimate_effort("task_1")

        self.assertTrue(result.get("success", True))
        self.assertIn("estimated_effort", result)

    def test_plan_task_sequence(self) -> None:
        """Test task sequencing."""
        task_ids = ["task_1", "task_2", "task_3"]
        result = self.bridge.plan_task_sequence(task_ids)

        self.assertIsNotNone(result)
        self.assertIn("sequence", result)


class TestKnowledgeIntegration(unittest.TestCase):
    """Test integration between components."""

    def setUp(self) -> None:
        """Set up test fixtures."""
        self.knowledge = KnowledgeCore()

    def test_full_workflow(self) -> None:
        """Test a complete knowledge workflow."""
        # Step 1: Learn from text
        text = "Alice and Bob are working on the Pixi project at Acme Corp"
        learn_result = self.knowledge.learn_from_text(text)

        self.assertTrue(learn_result.get("success", False))

        # Step 2: Query entities
        entities = self.knowledge.query_entities("Alice")
        self.assertIsInstance(entities, list)

        # Step 3: Get diagnostics
        diagnostics = self.knowledge.get_diagnostics()
        self.assertIsNotNone(diagnostics)

        # Step 4: Get snapshot
        snapshot = self.knowledge.get_snapshot()
        self.assertIsNotNone(snapshot)
        self.assertGreater(snapshot.entity_count + snapshot.relationship_count, 0)


def run_tests() -> int:
    """Run all tests and return exit code."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test cases
    suite.addTests(loader.loadTestsFromTestCase(TestKnowledgeCore))
    suite.addTests(loader.loadTestsFromTestCase(TestEntityExtractor))
    suite.addTests(loader.loadTestsFromTestCase(TestReasoningKnowledgeBridge))
    suite.addTests(loader.loadTestsFromTestCase(TestMemoryKnowledgeBridge))
    suite.addTests(loader.loadTestsFromTestCase(TestPlanningKnowledgeBridge))
    suite.addTests(loader.loadTestsFromTestCase(TestKnowledgeIntegration))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Return exit code
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    exit(run_tests())

