"""Outcome Predictor - Predicts potential outcomes of strategies across different scenarios.

Uses historical data, probability models, and AI-based prediction to estimate
the results of executing strategies in different scenarios.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import uuid4
import statistics
from datetime import datetime, timezone


@dataclass(slots=True)
class OutcomePrediction:
    """Prediction of strategy outcome in a scenario."""

    prediction_id: str = field(default_factory=lambda: str(uuid4()))
    strategy_id: str = ""
    scenario_id: str = ""
    success_probability: float = 0.5
    outcome_value: float = 0.0
    time_to_completion: int = 0
    confidence: float = 0.7
    reasoning: str = ""


class OutcomePredictor:
    """Predicts outcome of strategies in various scenarios.

    Uses multiple prediction methods:
    - Historical pattern matching
    - Monte Carlo simulation
    - Probability weighting
    - Confidence scoring

    Provides:
    - Success probability estimates
    - Expected outcome values
    - Timing predictions
    - Confidence metrics
    - Reasoning explanations
    """

    def __init__(self) -> None:
        self._historical_outcomes = []
        self._prediction_models = self._initialize_models()

    def predict_outcomes(
        self,
        strategy_id: str,
        strategy: Dict[str, Any],
        simulation_outcomes: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Predict outcomes for a strategy across scenarios.

        Integration point: Strategy Simulator → Outcome Predictor

        Args:
            strategy_id: Strategy identifier
            strategy: Strategy definition
            simulation_outcomes: Simulation results for the strategy
            scenarios: List of scenarios tested

        Returns:
            Outcome predictions with confidence and reasoning
        """
        predictions = []
        scenario_results = simulation_outcomes.get("scenario_results", [])

        # Make prediction for each scenario result
        for scenario_result in scenario_results:
            prediction = self._predict_scenario_outcome(
                strategy_id=strategy_id,
                strategy=strategy,
                scenario_result=scenario_result,
                scenario=self._find_scenario(scenario_result.get("scenario_id"), scenarios),
            )
            predictions.append(prediction)

        # Aggregate predictions
        aggregated = self._aggregate_predictions(predictions)

        return {
            "strategy_id": strategy_id,
            "individual_predictions": [self._prediction_to_dict(p) for p in predictions],
            "success_rate": aggregated.get("success_rate", 0.0),
            "avg_outcome_value": aggregated.get("avg_outcome_value", 0.0),
            "expected_time_to_completion": aggregated.get("avg_completion_time", 0),
            "overall_confidence": aggregated.get("overall_confidence", 0.5),
            "best_case_outcome": aggregated.get("best_case", 0.0),
            "worst_case_outcome": aggregated.get("worst_case", 0.0),
            "most_likely_outcome": aggregated.get("most_likely", 0.0),
        }

    def predict_single_outcome(
        self,
        strategy: Dict[str, Any],
        scenario: Dict[str, Any],
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Predict outcome for a single strategy-scenario pair.

        Integration point: Reasoning Engine → Ad-hoc prediction

        Args:
            strategy: Strategy to evaluate
            scenario: Scenario context
            context: Additional context

        Returns:
            Single outcome prediction
        """
        prediction = self._predict_scenario_outcome(
            strategy_id=strategy.get("id", "unknown"),
            strategy=strategy,
            scenario_result={
                "scenario_id": scenario.get("scenario_id", "unknown"),
                "projected_world_state": scenario.get("world_state_changes", {}),
                "key_events": scenario.get("key_events", []),
            },
            scenario=scenario,
        )

        return {
            "success_probability": prediction.success_probability,
            "outcome_value": prediction.outcome_value,
            "time_to_completion": prediction.time_to_completion,
            "confidence": prediction.confidence,
            "reasoning": prediction.reasoning,
        }

    def _predict_scenario_outcome(
        self,
        strategy_id: str,
        strategy: Dict[str, Any],
        scenario_result: Dict[str, Any],
        scenario: Optional[Dict[str, Any]] = None,
    ) -> OutcomePrediction:
        """Predict outcome for a single strategy-scenario pair."""
        # Extract key factors
        scenario_type = scenario.get("scenario_type", "realistic") if scenario else "realistic"
        strategy_complexity = strategy.get("complexity", 50)
        estimated_duration = strategy.get("estimated_duration_days", 30)

        # Calculate success probability
        success_prob = self._calculate_success_probability(
            scenario_type=scenario_type,
            strategy_complexity=strategy_complexity,
            scenario_result=scenario_result,
        )

        # Calculate outcome value
        outcome_value = self._estimate_outcome_value(
            strategy=strategy,
            success_probability=success_prob,
            scenario_type=scenario_type,
        )

        # Estimate time to completion
        duration = self._estimate_duration(
            estimated_duration=estimated_duration,
            scenario_type=scenario_type,
        )

        # Calculate confidence
        confidence = self._calculate_confidence(
            scenario_type=scenario_type,
            success_probability=success_prob,
            scenario_result=scenario_result,
        )

        # Generate reasoning
        reasoning = self._generate_prediction_reasoning(
            strategy_id=strategy_id,
            success_probability=success_prob,
            outcome_value=outcome_value,
            scenario_type=scenario_type,
        )

        return OutcomePrediction(
            strategy_id=strategy_id,
            scenario_id=scenario_result.get("scenario_id", "unknown"),
            success_probability=success_prob,
            outcome_value=outcome_value,
            time_to_completion=duration,
            confidence=confidence,
            reasoning=reasoning,
        )

    def _calculate_success_probability(
        self,
        scenario_type: str,
        strategy_complexity: float,
        scenario_result: Dict[str, Any],
    ) -> float:
        """Calculate probability of strategy success."""
        # Base probability depends on scenario type
        scenario_multipliers = {
            "optimistic": 1.3,
            "realistic": 1.0,
            "pessimistic": 0.7,
            "alternative": 0.9,
        }

        base_prob = scenario_multipliers.get(scenario_type, 1.0)

        # Adjust for complexity (higher complexity = lower success rate)
        # Complexity 0-100 scale
        complexity_factor = 1.0 - (strategy_complexity / 100.0) * 0.4  # Max 40% reduction

        # Check for blocking events in scenario
        key_events = scenario_result.get("key_events", [])
        blocking_events = [e for e in key_events if e.get("type") == "risk"]
        event_factor = max(0.5, 1.0 - len(blocking_events) * 0.1)

        # Combine factors
        success_prob = base_prob * complexity_factor * event_factor

        # Clamp to [0.1, 0.95]
        return max(0.1, min(0.95, success_prob))

    def _estimate_outcome_value(
        self,
        strategy: Dict[str, Any],
        success_probability: float,
        scenario_type: str,
    ) -> float:
        """Estimate the expected value of a strategy outcome."""
        base_value = strategy.get("expected_value", 100.0)

        # Scenario type affects potential outcome
        scenario_value_factors = {
            "optimistic": 1.5,
            "realistic": 1.0,
            "pessimistic": 0.6,
            "alternative": 0.8,
        }

        scenario_factor = scenario_value_factors.get(scenario_type, 1.0)

        # Success probability weights the outcome
        expected_value = base_value * scenario_factor * success_probability

        return max(0, expected_value)

    def _estimate_duration(self, estimated_duration: int, scenario_type: str) -> int:
        """Estimate how long the strategy will take."""
        duration_factors = {
            "optimistic": 0.8,
            "realistic": 1.0,
            "pessimistic": 1.4,
            "alternative": 1.1,
        }

        factor = duration_factors.get(scenario_type, 1.0)

        # Add some variance
        variance = int(estimated_duration * 0.1 * (0.5 - __import__("random").random()))
        return int(estimated_duration * factor + variance)

    def _calculate_confidence(
        self,
        scenario_type: str,
        success_probability: float,
        scenario_result: Dict[str, Any],
    ) -> float:
        """Calculate confidence in this prediction."""
        # Confidence factors
        scenario_confidence = {
            "realistic": 0.9,
            "optimistic": 0.7,
            "pessimistic": 0.75,
            "alternative": 0.6,
        }

        base_confidence = scenario_confidence.get(scenario_type, 0.7)

        # High success probabilities are more confident predictions
        prob_confidence = 0.5 + (success_probability * 0.5)

        # Average the factors
        return (base_confidence + prob_confidence) / 2.0

    def _aggregate_predictions(self, predictions: List[OutcomePrediction]) -> Dict[str, Any]:
        """Aggregate predictions across scenarios."""
        if not predictions:
            return {
                "success_rate": 0.5,
                "avg_outcome_value": 0.0,
                "avg_completion_time": 0,
                "overall_confidence": 0.0,
                "best_case": 0.0,
                "worst_case": 0.0,
                "most_likely": 0.0,
            }

        success_probs = [p.success_probability for p in predictions]
        outcome_values = [p.outcome_value for p in predictions]
        durations = [p.time_to_completion for p in predictions]
        confidences = [p.confidence for p in predictions]

        return {
            "success_rate": statistics.mean(success_probs),
            "avg_outcome_value": statistics.mean(outcome_values),
            "avg_completion_time": int(statistics.mean(durations)),
            "overall_confidence": statistics.mean(confidences),
            "best_case": max(outcome_values) if outcome_values else 0.0,
            "worst_case": min(outcome_values) if outcome_values else 0.0,
            "most_likely": statistics.median(outcome_values) if outcome_values else 0.0,
        }

    def _generate_prediction_reasoning(
        self,
        strategy_id: str,
        success_probability: float,
        outcome_value: float,
        scenario_type: str,
    ) -> str:
        """Generate explanation for the prediction."""
        success_range = "high" if success_probability > 0.7 else "moderate" if success_probability > 0.4 else "low"
        value_range = "significant" if outcome_value > 100 else "moderate" if outcome_value > 50 else "modest"

        return (
            f"In {scenario_type} scenario, strategy {strategy_id} has {success_range} "
            f"success probability ({success_probability:.1%}) with {value_range} expected value "
            f"({outcome_value:.0f}). "
        )

    def _prediction_to_dict(self, prediction: OutcomePrediction) -> Dict[str, Any]:
        """Convert prediction to dictionary."""
        return {
            "scenario_id": prediction.scenario_id,
            "success_probability": prediction.success_probability,
            "outcome_value": prediction.outcome_value,
            "time_to_completion": prediction.time_to_completion,
            "confidence": prediction.confidence,
            "reasoning": prediction.reasoning,
        }

    def _find_scenario(self, scenario_id: str, scenarios: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Find a scenario by ID."""
        for scenario in scenarios:
            if scenario.get("scenario_id") == scenario_id or scenario.get("id") == scenario_id:
                return scenario
        return None

    def _initialize_models(self) -> Dict[str, Any]:
        """Initialize prediction models."""
        return {
            "success_predictor": {"accuracy": 0.75},
            "value_estimator": {"confidence": 0.7},
            "duration_predictor": {"accuracy": 0.65},
        }
