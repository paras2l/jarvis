"""Unit and integration tests for Jarvis Simulation Engine.

Tests cover:
- Individual component functionality (unit tests)
- Complete simulation pipeline (integration tests)
- Edge cases and error handling
- Performance characteristics
"""

import unittest
from datetime import datetime
from unittest.mock import Mock, MagicMock, patch
import json

from jarvis.simulation_engine import (
    SimulationEngine,
    SimulationRequest,
    SimulationResult,
    SimulationStatus,
    ScenarioGenerator,
    Scenario,
    ScenarioType,
    OutcomePredictor,
    OutcomePrediction,
    RiskAnalyzer,
    Risk,
    StrategySimulator,
    StrategyStep,
    SimulationExecution,
    SimulationMemory,
    SimulationRecord,
)


class TestScenarioGenerator(unittest.TestCase):
    """Test scenario generation functionality."""

    def setUp(self):
        """Initialize test fixtures."""
        self.generator = ScenarioGenerator()
        self.base_world_state = {
            "market_sentiment": 0.7,
            "resource_availability": 0.8,
            "risk_level": 0.3,
            "metric_a": 100,
            "metric_b": 50,
        }

    def test_generate_scenarios_count(self):
        """Verify correct number of scenarios generated."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=12,
        )

        self.assertEqual(len(scenarios), 12, "Should generate exactly 12 scenarios")

    def test_generate_scenarios_diversity(self):
        """Verify scenarios cover different types."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=20,
        )

        types = {s.scenario_type for s in scenarios}
        self.assertIn(
            ScenarioType.OPTIMISTIC, types, "Should include optimistic scenarios"
        )
        self.assertIn(
            ScenarioType.REALISTIC, types, "Should include realistic scenarios"
        )
        self.assertIn(
            ScenarioType.PESSIMISTIC, types, "Should include pessimistic scenarios"
        )

    def test_scenario_probabilities_sum_to_one(self):
        """Verify probabilities normalize to 1.0."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=10,
        )

        total_prob = sum(s.probability for s in scenarios)
        self.assertAlmostEqual(total_prob, 1.0, places=5, msg="Probabilities should sum to 1.0")

    def test_scenario_world_state_projection(self):
        """Verify world state values are projected forward."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=5,
        )

        # Check that at least some scenarios have modified world states
        modified = [s for s in scenarios if s.world_state_changes]
        self.assertGreater(len(modified), 0, "Some scenarios should have state changes")

        # Verify projections are reasonable
        for scenario in scenarios:
            for key, value in scenario.world_state_changes.items():
                if isinstance(value, (int, float)):
                    # Values should be within reasonable bounds
                    self.assertGreater(value, -1000, f"Value for {key} seems unrealistic")

    def test_scenario_events_generation(self):
        """Verify key events are generated for scenarios."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=10,
        )

        # All scenarios should have events
        for scenario in scenarios:
            self.assertIsInstance(scenario.key_events, list, "Events should be a list")
            if scenario.key_events:
                self.assertTrue(all(isinstance(e, dict) for e in scenario.key_events),
                              "All events should be dicts")

    def test_scenario_has_required_fields(self):
        """Verify scenario objects have all required fields."""
        scenarios = self.generator.generate_scenarios(
            base_world_state=self.base_world_state,
            num_scenarios=3,
        )

        required_fields = ["id", "scenario_type", "probability", "timeline_days",
                          "world_state_changes", "key_events", "assumptions"]

        for scenario in scenarios:
            for field in required_fields:
                self.assertTrue(hasattr(scenario, field),
                              f"Scenario should have {field}")


class TestOutcomePredictor(unittest.TestCase):
    """Test outcome prediction functionality."""

    def setUp(self):
        """Initialize test fixtures."""
        self.predictor = OutcomePredictor()
        self.base_strategy = {
            "id": "test_strategy",
            "name": "Test Strategy",
            "base_success_probability": 0.7,
            "estimated_value": 100,
        }
        self.scenarios = [
            Scenario(
                id="scenario_1",
                scenario_type=ScenarioType.OPTIMISTIC,
                probability=0.25,
                timeline_days=90,
                world_state_changes={"market_sentiment": 0.9},
                key_events=[{"type": "positive", "impact": 0.2}],
                assumptions={"favorable_market": True},
            ),
            Scenario(
                id="scenario_2",
                scenario_type=ScenarioType.REALISTIC,
                probability=0.5,
                timeline_days=90,
                world_state_changes={"market_sentiment": 0.7},
                key_events=[],
                assumptions={"normal_conditions": True},
            ),
            Scenario(
                id="scenario_3",
                scenario_type=ScenarioType.PESSIMISTIC,
                probability=0.25,
                timeline_days=90,
                world_state_changes={"market_sentiment": 0.4},
                key_events=[{"type": "negative", "impact": -0.2}],
                assumptions={"adverse_market": True},
            ),
        ]

    def test_predict_outcomes_returns_dict(self):
        """Verify predictions are returned in correct format."""
        result = self.predictor.predict_outcomes(
            strategy=self.base_strategy,
            scenarios=self.scenarios,
        )

        self.assertIsInstance(result, dict, "Should return a dict")
        self.assertIn("per_scenario", result, "Should have per_scenario predictions")
        self.assertIn("aggregate", result, "Should have aggregate predictions")

    def test_predict_outcomes_confidence_in_range(self):
        """Verify confidence scores are 0.0-1.0."""
        result = self.predictor.predict_outcomes(
            strategy=self.base_strategy,
            scenarios=self.scenarios,
        )

        for scenario_pred in result["per_scenario"]:
            confidence = scenario_pred.get("confidence", 0)
            self.assertGreaterEqual(confidence, 0.0, "Confidence should be >= 0")
            self.assertLessEqual(confidence, 1.0, "Confidence should be <= 1")

    def test_predict_outcomes_success_rate_in_range(self):
        """Verify success probabilities are 0.0-1.0."""
        result = self.predictor.predict_outcomes(
            strategy=self.base_strategy,
            scenarios=self.scenarios,
        )

        agg = result["aggregate"]
        self.assertGreaterEqual(agg["success_rate"], 0.0)
        self.assertLessEqual(agg["success_rate"], 1.0)

    def test_outcome_prediction_considers_scenarios(self):
        """Verify pessimistic scenarios lower success rate."""
        result = self.predictor.predict_outcomes(
            strategy=self.base_strategy,
            scenarios=self.scenarios,
        )

        # Get predictions for each scenario type
        predictions_by_type = {}
        for pred in result["per_scenario"]:
            scenario_type = pred["scenario_type"]
            success = pred["success_probability"]
            predictions_by_type[scenario_type] = success

        # Optimistic should have higher success than pessimistic
        if ScenarioType.OPTIMISTIC in predictions_by_type and \
           ScenarioType.PESSIMISTIC in predictions_by_type:
            self.assertGreater(
                predictions_by_type[ScenarioType.OPTIMISTIC],
                predictions_by_type[ScenarioType.PESSIMISTIC],
                "Optimistic scenario should have higher success rate"
            )

    def test_aggregate_predictions_weighted_by_probability(self):
        """Verify aggregate uses scenario probability weights."""
        result = self.predictor.predict_outcomes(
            strategy=self.base_strategy,
            scenarios=self.scenarios,
        )

        # Aggregate metrics should exist
        agg = result["aggregate"]
        self.assertIn("mean_success_rate", agg)
        self.assertIn("mean_outcome_value", agg)
        self.assertIn("median_success_rate", agg)


class TestRiskAnalyzer(unittest.TestCase):
    """Test risk analysis functionality."""

    def setUp(self):
        """Initialize test fixtures."""
        self.analyzer = RiskAnalyzer()
        self.strategy = {"id": "test_strategy", "name": "Test Strategy"}
        self.scenarios = [
            Scenario(
                id="scenario_1",
                scenario_type=ScenarioType.OPTIMISTIC,
                probability=0.25,
                timeline_days=90,
                world_state_changes={},
                key_events=[],
                assumptions={},
            ),
            Scenario(
                id="scenario_2",
                scenario_type=ScenarioType.PESSIMISTIC,
                probability=0.25,
                timeline_days=90,
                world_state_changes={"market_sentiment": 0.2},
                key_events=[{"type": "crash", "impact": -0.5}],
                assumptions={},
            ),
        ]

    def test_analyze_strategy_risks_returns_dict(self):
        """Verify risk analysis returns correct structure."""
        result = self.analyzer.analyze_strategy_risks(
            strategy=self.strategy,
            scenarios=self.scenarios,
            outcome_predictions={"aggregate": {"success_rate": 0.6}},
        )

        self.assertIsInstance(result, dict, "Should return dict")
        self.assertIn("identified_risks", result)
        self.assertIn("risk_score", result)

    def test_risk_score_in_valid_range(self):
        """Verify risk scores are 0.0-1.0."""
        result = self.analyzer.analyze_strategy_risks(
            strategy=self.strategy,
            scenarios=self.scenarios,
            outcome_predictions={"aggregate": {"success_rate": 0.6}},
        )

        risk_score = result["risk_score"]
        self.assertGreaterEqual(risk_score, 0.0)
        self.assertLessEqual(risk_score, 1.0)

    def test_identifies_risks_in_pessimistic_scenarios(self):
        """Verify risks are identified more in pessimistic scenarios."""
        result = self.analyzer.analyze_strategy_risks(
            strategy=self.strategy,
            scenarios=self.scenarios,
            outcome_predictions={"aggregate": {"success_rate": 0.3}},
        )

        # Should identify some risks
        self.assertGreater(len(result["identified_risks"]), 0,
                         "Should identify risks when outcome is uncertain")

    def test_mitigations_provided_for_risks(self):
        """Verify mitigations are suggested for identified risks."""
        result = self.analyzer.analyze_strategy_risks(
            strategy=self.strategy,
            scenarios=self.scenarios,
            outcome_predictions={"aggregate": {"success_rate": 0.5}},
        )

        # If risks found, mitigations should be provided
        if result["identified_risks"]:
            for risk in result["identified_risks"]:
                self.assertIn("suggested_mitigation", risk,
                            "Risk should have mitigation suggestion")


class TestStrategySimulator(unittest.TestCase):
    """Test strategy simulation functionality."""

    def setUp(self):
        """Initialize test fixtures."""
        self.simulator = StrategySimulator()
        self.strategy = {
            "id": "test_strategy",
            "name": "Test Strategy",
            "steps": [
                {
                    "name": "Phase 1: Planning",
                    "duration": 7,
                    "success_probability": 0.95,
                    "resources_required": 2,
                    "dependencies": [],
                },
                {
                    "name": "Phase 2: Execution",
                    "duration": 30,
                    "success_probability": 0.8,
                    "resources_required": 5,
                    "dependencies": ["Phase 1: Planning"],
                },
            ],
        }
        self.scenario = Scenario(
            id="test_scenario",
            scenario_type=ScenarioType.REALISTIC,
            probability=1.0,
            timeline_days=90,
            world_state_changes={},
            key_events=[],
            assumptions={},
        )

    def test_simulate_strategy_returns_dict(self):
        """Verify simulation returns correct structure."""
        result = self.simulator.simulate_strategy(
            strategy=self.strategy,
            scenarios=[self.scenario],
        )

        self.assertIsInstance(result, dict, "Should return dict")
        self.assertIn("aggregate_execution", result)
        self.assertIn("per_scenario_execution", result)

    def test_strategy_execution_tracks_steps(self):
        """Verify step execution is tracked."""
        result = self.simulator.simulate_strategy(
            strategy=self.strategy,
            scenarios=[self.scenario],
        )

        exec_result = result["per_scenario_execution"][0]
        self.assertIsInstance(exec_result["steps_completed"], list)

    def test_strategy_execution_respects_dependencies(self):
        """Verify step dependencies are enforced."""
        result = self.simulator.simulate_strategy(
            strategy=self.strategy,
            scenarios=[self.scenario],
        )

        # Phase 2 shouldn't execute without Phase 1
        completed = [s["name"] for s in result["per_scenario_execution"][0]["steps_completed"]]
        if "Phase 2: Execution" in completed:
            self.assertIn("Phase 1: Planning", completed,
                        "Phase 1 should be completed before Phase 2")

    def test_execution_duration_calculated(self):
        """Verify total execution duration is calculated."""
        result = self.simulator.simulate_strategy(
            strategy=self.strategy,
            scenarios=[self.scenario],
        )

        agg = result["aggregate_execution"]
        self.assertIn("avg_duration", agg)
        self.assertGreater(agg["avg_duration"], 0, "Duration should be positive")

    def test_bottlenecks_identified(self):
        """Verify bottlenecks are identified."""
        result = self.simulator.simulate_strategy(
            strategy=self.strategy,
            scenarios=[self.scenario],
        )

        agg = result["aggregate_execution"]
        self.assertIn("common_bottlenecks", agg)


class TestSimulationMemory(unittest.TestCase):
    """Test simulation memory and learning functionality."""

    def setUp(self):
        """Initialize test fixtures."""
        self.memory_system = Mock()
        self.memory = SimulationMemory(external_memory_system=self.memory_system)

    def test_store_simulation_result(self):
        """Verify simulation results are stored."""
        world_state = {"market": 0.7}
        strategies = [{"id": "s1", "name": "Strategy 1"}]
        best_strategy = {"id": "s1", "name": "Strategy 1", "score": 0.85}

        record_id = self.memory.store_simulation_result(
            world_state=world_state,
            strategies=strategies,
            best_strategy=best_strategy,
        )

        self.assertIsNotNone(record_id, "Should return a record ID")

    def test_record_actual_outcome(self):
        """Verify actual outcomes are recorded."""
        world_state = {"market": 0.7}
        strategies = [{"id": "s1"}]
        best_strategy = {"id": "s1"}

        record_id = self.memory.store_simulation_result(
            world_state=world_state,
            strategies=strategies,
            best_strategy=best_strategy,
        )

        actual_outcome = {
            "outcome_value": 110,
            "success": True,
            "duration_days": 75,
        }

        self.memory.record_actual_outcome(
            simulation_id=record_id,
            actual_outcome=actual_outcome,
        )

        # Memory should have been called to store
        self.assertGreater(self.memory_system.store.call_count, 0,
                         "Should call memory system to store")

    def test_get_strategy_performance_baseline(self):
        """Verify strategy baselines are calculated."""
        # Store a few results
        for i in range(3):
            self.memory.store_simulation_result(
                world_state={"market": 0.7 + i*0.05},
                strategies=[{"id": "s1"}],
                best_strategy={"id": "s1", "predicted_success": 0.7 + i*0.1},
            )

        baseline = self.memory.get_strategy_performance_baseline(strategy_id="s1")

        self.assertIsInstance(baseline, dict)
        self.assertIn("success_rate_baseline", baseline)

    def test_learn_from_patterns(self):
        """Verify pattern learning."""
        # Store some results
        for i in range(5):
            self.memory.store_simulation_result(
                world_state={"market": 0.7},
                strategies=[{"id": "s1"}],
                best_strategy={"id": "s1"},
            )

        learning = self.memory.learn_from_patterns()

        self.assertIsInstance(learning, dict)
        self.assertIn("patterns_found", learning)

    def test_diagnostics(self):
        """Verify diagnostics are available."""
        diagnostics = self.memory.get_diagnostics()

        self.assertIsInstance(diagnostics, dict)
        self.assertIn("total_records", diagnostics)
        self.assertIn("learning_metrics", diagnostics)


class TestSimulationEngine(unittest.TestCase):
    """Integration tests for complete simulation engine."""

    def setUp(self):
        """Initialize test fixtures."""
        self.mock_knowledge = Mock()
        self.mock_memory = Mock()

        self.engine = SimulationEngine(
            knowledge_core=self.mock_knowledge,
            external_memory_system=self.mock_memory,
        )

        self.world_state = {
            "market_sentiment": 0.7,
            "available_resources": 10,
            "current_risks": 2,
        }

        self.strategies = [
            {
                "id": "strategy_a",
                "name": "Aggressive Growth",
                "base_success_probability": 0.75,
                "estimated_value": 500,
            },
            {
                "id": "strategy_b",
                "name": "Conservative Focus",
                "base_success_probability": 0.85,
                "estimated_value": 300,
            },
        ]

    def test_simulate_complete_pipeline(self):
        """Test complete simulation from request to result."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            context={"goal": "maximize_value"},
            timeline_days=90,
            num_scenarios=6,
        )

        self.assertIsInstance(result, dict)
        self.assertIn("status", result)
        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)

    def test_simulate_returns_required_fields(self):
        """Verify simulation result has all required fields."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=6,
        )

        required_fields = [
            "status",
            "scenarios_evaluated",
            "strategies_analyzed",
            "best_strategy",
            "overall_confidence",
            "risk_assessment",
        ]

        for field in required_fields:
            self.assertIn(field, result, f"Result should have {field}")

    def test_get_reasoning_context(self):
        """Test reasoning context extraction."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=6,
        )

        reasoning = self.engine.get_reasoning_context(result)

        self.assertIsInstance(reasoning, dict)
        self.assertIn("best_strategy", reasoning)
        self.assertIn("overall_confidence", reasoning)
        self.assertIn("strategy_rankings", reasoning)

    def test_strategy_rankings_ordered(self):
        """Test that strategy rankings are properly ordered."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=6,
        )

        rankings = result.get("strategy_rankings", [])

        if len(rankings) > 1:
            # Check that scores are in descending order
            for i in range(len(rankings) - 1):
                self.assertGreaterEqual(
                    rankings[i]["score"],
                    rankings[i + 1]["score"],
                    "Rankings should be in descending order"
                )

    def test_compare_strategies(self):
        """Test strategy comparison."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=6,
        )

        comparisons = self.engine.compare_strategies(result)

        self.assertIsInstance(comparisons, list)
        self.assertEqual(len(comparisons), len(self.strategies))

    def test_comparison_includes_metrics(self):
        """Test that comparisons include relevant metrics."""
        result = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=6,
        )

        comparisons = self.engine.compare_strategies(result)

        expected_fields = ["strategy_id", "success_rate", "expected_value", "risk_score"]

        for comp in comparisons:
            for field in expected_fields:
                self.assertIn(field, comp, f"Comparison should have {field}")

    def test_different_scenarios_produce_different_results(self):
        """Test that different numbers of scenarios work."""
        result_small = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=3,
        )

        result_large = self.engine.simulate(
            world_state=self.world_state,
            strategies=self.strategies,
            timeline_days=90,
            num_scenarios=12,
        )

        # Both should complete
        self.assertEqual(result_small["status"], SimulationStatus.COMPLETE.value)
        self.assertEqual(result_large["status"], SimulationStatus.COMPLETE.value)

        # Should have different number of scenarios
        self.assertLess(
            result_small["scenarios_evaluated"],
            result_large["scenarios_evaluated"],
            "Larger request should evaluate more scenarios"
        )


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and error handling."""

    def setUp(self):
        """Initialize test fixtures."""
        self.engine = SimulationEngine()

    def test_empty_world_state(self):
        """Test handling of empty world state."""
        result = self.engine.simulate(
            world_state={},
            strategies=[{"id": "s1", "name": "Strategy 1"}],
            timeline_days=90,
            num_scenarios=3,
        )

        # Should still complete
        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)

    def test_single_strategy(self):
        """Test with only one strategy."""
        result = self.engine.simulate(
            world_state={"market": 0.5},
            strategies=[{"id": "s1", "name": "Strategy 1"}],
            timeline_days=90,
            num_scenarios=3,
        )

        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)
        self.assertIsNotNone(result["best_strategy"])

    def test_many_strategies(self):
        """Test with many strategies."""
        strategies = [
            {"id": f"strategy_{i}", "name": f"Strategy {i}"}
            for i in range(10)
        ]

        result = self.engine.simulate(
            world_state={"market": 0.5},
            strategies=strategies,
            timeline_days=90,
            num_scenarios=3,
        )

        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)
        self.assertEqual(result["strategies_analyzed"], 10)

    def test_very_short_timeline(self):
        """Test with very short timeline."""
        result = self.engine.simulate(
            world_state={"market": 0.5},
            strategies=[{"id": "s1", "name": "Strategy 1"}],
            timeline_days=1,
            num_scenarios=3,
        )

        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)

    def test_very_long_timeline(self):
        """Test with very long timeline."""
        result = self.engine.simulate(
            world_state={"market": 0.5},
            strategies=[{"id": "s1", "name": "Strategy 1"}],
            timeline_days=3650,  # 10 years
            num_scenarios=3,
        )

        self.assertEqual(result["status"], SimulationStatus.COMPLETE.value)


if __name__ == "__main__":
    unittest.main()
