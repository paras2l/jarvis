"""Simulation Memory - Stores simulation results and learns from past simulations.

Maintains simulation history for future learning, performance evaluation,
pattern recognition, and continuous improvement of predictions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
import json


@dataclass(slots=True)
class SimulationRecord:
    """Record of a completed simulation."""

    record_id: str = field(default_factory=lambda: str(uuid4()))
    simulation_id: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    world_state_snapshot: Dict[str, Any] = field(default_factory=dict)
    strategies_tested: List[str] = field(default_factory=list)
    best_strategy: str = ""
    actual_outcome: Optional[Dict[str, Any]] = None  # Filled in after execution
    predicted_outcome: Dict[str, Any] = field(default_factory=dict)
    prediction_accuracy: float = 0.0
    learning_insights: List[str] = field(default_factory=list)


class SimulationMemory:
    """Stores and learns from simulation results.

    Maintains:
    - Simulation history for pattern recognition
    - Strategy performance baselines
    - Scenario probability adjustments
    - Prediction model improvements
    - Long-term performance trends

    Enables:
    - Learning from past simulations
    - Identifying patterns in outcomes
    - Improving prediction models
    - Adapting scenario generation
    - Confidence calibration
    """

    def __init__(self, memory_system: Optional[Any] = None) -> None:
        self._memory = memory_system
        self._local_history: List[SimulationRecord] = []
        self._recorded_count = 0
        self._learning_metrics = self._initialize_metrics()

    def store_simulation_result(
        self,
        simulation_id: str,
        world_state: Dict[str, Any],
        strategies_tested: List[str],
        best_strategy: str,
        predicted_outcome: Dict[str, Any],
    ) -> str:
        """Store a simulation result in memory.

        Integration point: Simulation Engine → Simulation Memory

        Args:
            simulation_id: ID of the simulation
            world_state: World state at time of simulation
            strategies_tested: List of strategy IDs evaluated
            best_strategy: ID of best strategy identified
            predicted_outcome: Predicted outcome of best strategy

        Returns:
            Record ID for future reference
        """
        record = SimulationRecord(
            simulation_id=simulation_id,
            world_state_snapshot=world_state,
            strategies_tested=strategies_tested,
            best_strategy=best_strategy,
            predicted_outcome=predicted_outcome,
        )

        # Store locally
        self._local_history.append(record)
        self._recorded_count += 1

        # Store in memory system if available
        if self._memory:
            try:
                self._memory.remember_short_term(
                    key=f"simulation:result:{record.record_id}",
                    value={
                        "simulation_id": simulation_id,
                        "best_strategy": best_strategy,
                        "timestamp": record.timestamp,
                        "world_state_snapshot": world_state,
                    },
                    tags=["simulation", "result"],
                )

                # Store high-confidence results long-term
                if predicted_outcome.get("confidence", 0) > 0.75:
                    self._memory.remember_long_term(
                        key=f"simulation:high_confidence:{record.record_id}",
                        value={
                            "best_strategy": best_strategy,
                            "predicted_outcome": predicted_outcome,
                            "timestamp": record.timestamp,
                        },
                        source="simulation_engine",
                        importance=min(0.95, predicted_outcome.get("confidence", 0.5)),
                        tags=["simulation", "learning"],
                    )
            except Exception:
                pass  # Graceful degradation if memory system fails

        return record.record_id

    def record_actual_outcome(
        self,
        record_id: str,
        actual_outcome: Dict[str, Any],
    ) -> None:
        """Record the actual outcome after a simulated strategy is executed.

        Integration point: Execution → Simulation Memory (feedback)

        Args:
            record_id: ID of the simulation record
            actual_outcome: The actual outcome that occurred
        """
        # Find the record
        for record in self._local_history:
            if record.record_id == record_id:
                record.actual_outcome = actual_outcome

                # Calculate prediction accuracy
                if record.predicted_outcome:
                    accuracy = self._calculate_accuracy(
                        predicted=record.predicted_outcome,
                        actual=actual_outcome,
                    )
                    record.prediction_accuracy = accuracy

                    # Generate insights
                    insights = self._generate_insights(
                        predicted=record.predicted_outcome,
                        actual=actual_outcome,
                        accuracy=accuracy,
                    )
                    record.learning_insights = insights

                # Update learning metrics
                self._update_metrics(record)

                break

    def get_strategy_performance_baseline(self, strategy_id: str) -> Dict[str, Any]:
        """Get historical performance baseline for a strategy.

        Integration point: Reasoning Engine / Planning Engine

        Args:
            strategy_id: Strategy to analyze

        Returns:
            Performance metrics from history
        """
        relevant_records = [
            r for r in self._local_history
            if strategy_id in r.strategies_tested or r.best_strategy == strategy_id
        ]

        if not relevant_records:
            return {
                "strategy_id": strategy_id,
                "historical_sample_size": 0,
                "avg_success_rate": 0.5,
                "avg_prediction_accuracy": 0.0,
                "recommendation": "insufficient_data",
            }

        # Calculate metrics
        success_count = sum(
            1
            for r in relevant_records
            if r.actual_outcome
            and r.actual_outcome.get("success", False)
        )
        success_rate = success_count / len(relevant_records) if relevant_records else 0.0

        accuracies = [r.prediction_accuracy for r in relevant_records if r.prediction_accuracy > 0]
        avg_accuracy = sum(accuracies) / len(accuracies) if accuracies else 0.0

        return {
            "strategy_id": strategy_id,
            "historical_sample_size": len(relevant_records),
            "avg_success_rate": success_rate,
            "avg_prediction_accuracy": avg_accuracy,
            "last_simulation": relevant_records[-1].timestamp if relevant_records else None,
            "recommendation": (
                "high_confidence"
                if success_rate > 0.75
                else "moderate"
                if success_rate > 0.5
                else "low_confidence"
            ),
        }

    def learn_from_patterns(self) -> Dict[str, Any]:
        """Extract learning patterns from simulation history.

        Integration point: Self-Improvement Engine

        Returns:
            Pattern analysis and learning insights
        """
        if not self._local_history:
            return {"pattern_count": 0, "learning_insights": []}

        patterns = {
            "successful_strategies": self._identify_successful_patterns(),
            "common_risks": self._identify_risk_patterns(),
            "timing_patterns": self._identify_timing_patterns(),
            "world_state_correlations": self._identify_state_correlations(),
        }

        learning_insights = self._synthesize_insights(patterns)

        return {
            "records_analyzed": len(self._local_history),
            "patterns_found": sum(len(v) if isinstance(v, (list, dict)) else 0 for v in patterns.values()),
            "patterns": patterns,
            "insights": learning_insights,
            "recommendation": self._generate_learning_recommendation(learning_insights),
        }

    def get_diagnostics(self) -> Dict[str, Any]:
        """Get memory system diagnostics.

        Integration point: Self-Improvement → Health check
        """
        return {
            "total_records": self._recorded_count,
            "local_storage_size": len(self._local_history),
            "memory_integration_active": self._memory is not None,
            "learning_metrics": self._learning_metrics,
            "oldest_record": self._local_history[0].timestamp if self._local_history else None,
            "newest_record": self._local_history[-1].timestamp if self._local_history else None,
        }

    def clear_old_records(self, days_to_keep: int = 90) -> int:
        """Clear old simulation records to manage memory.

        Integration point: Maintenance task

        Args:
            days_to_keep: Keep records from last N days

        Returns:
            Number of records deleted
        """
        from datetime import timedelta

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_to_keep)
        before_count = len(self._local_history)

        self._local_history = [
            r
            for r in self._local_history
            if datetime.fromisoformat(r.timestamp) > cutoff_date
        ]

        return before_count - len(self._local_history)

    def _calculate_accuracy(
        self,
        predicted: Dict[str, Any],
        actual: Dict[str, Any],
    ) -> float:
        """Calculate prediction accuracy by comparing predicted vs actual."""
        # Extract key metrics
        predicted_success = predicted.get("success_rate", 0.5)
        actual_success = 1.0 if actual.get("success", False) else 0.0

        # Calculate difference
        success_error = abs(predicted_success - actual_success)

        predicted_value = predicted.get("avg_outcome_value", 0.0)
        actual_value = actual.get("outcome_value", 0.0)

        # Normalize value error
        max_value = max(abs(predicted_value), abs(actual_value), 1.0)
        value_error = abs(predicted_value - actual_value) / max_value if max_value > 0 else 0

        # Combine errors (lower is better)
        combined_error = (success_error + value_error) / 2.0

        # Convert to accuracy (0-1 where 1 is perfect)
        return max(0.0, 1.0 - combined_error)

    def _generate_insights(
        self,
        predicted: Dict[str, Any],
        actual: Dict[str, Any],
        accuracy: float,
    ) -> List[str]:
        """Generate learning insights from prediction accuracy."""
        insights = []

        if accuracy > 0.8:
            insights.append("Prediction was highly accurate")
        elif accuracy > 0.6:
            insights.append("Prediction was reasonably close")
        else:
            insights.append("Prediction significantly missed actual outcome")

        # Check for specific mismatches
        success_predicted = predicted.get("success_rate", 0.5) > 0.5
        success_actual = actual.get("success", False)

        if success_predicted != success_actual:
            insights.append(f"Success prediction was incorrect (predicted {success_predicted}, actual {success_actual})")

        duration_predicted = predicted.get("avg_outcome_value", 0)
        duration_actual = actual.get("execution_time", 0)

        if duration_predicted and duration_actual:
            if duration_predicted > duration_actual:
                insights.append("Task completed faster than predicted")
            elif duration_predicted < duration_actual:
                insights.append("Task took longer than predicted")

        return insights

    def _identify_successful_patterns(self) -> List[Dict[str, Any]]:
        """Identify patterns in successful strategies."""
        successful_records = [r for r in self._local_history if r.actual_outcome and r.actual_outcome.get("success")]

        if not successful_records:
            return []

        # Group by best strategy
        strategy_success = {}
        for record in successful_records:
            strategy = record.best_strategy
            if strategy not in strategy_success:
                strategy_success[strategy] = []
            strategy_success[strategy].append(record)

        patterns = [
            {
                "strategy": strategy,
                "success_count": len(records),
                "avg_prediction_accuracy": sum(r.prediction_accuracy for r in records) / len(records),
            }
            for strategy, records in strategy_success.items()
        ]

        return sorted(patterns, key=lambda x: x["success_count"], reverse=True)

    def _identify_risk_patterns(self) -> List[Dict[str, Any]]:
        """Identify common risk patterns."""
        # This would analyze failure modes and risk patterns from records
        return []

    def _identify_timing_patterns(self) -> List[Dict[str, Any]]:
        """Identify timing and duration patterns."""
        if not self._local_history:
            return []

        # Analyze predicted vs actual durations
        return []

    def _identify_state_correlations(self) -> Dict[str, Any]:
        """Identify correlations between world state and outcomes."""
        return {}

    def _synthesize_insights(self, patterns: Dict[str, Any]) -> List[str]:
        """Synthesize insights from identified patterns."""
        insights = []

        if patterns.get("successful_strategies"):
            top_strategy = patterns["successful_strategies"][0]
            insights.append(f"Strategy '{top_strategy['strategy']}' has strong historical performance")

        return insights

    def _generate_learning_recommendation(self, insights: List[str]) -> str:
        """Generate a recommendation based on learning insights."""
        if not insights:
            return "Collect more simulation data for pattern analysis"

        return "Continue current approach - patterns support existing strategy"

    def _update_metrics(self, record: SimulationRecord) -> None:
        """Update learning metrics based on new record."""
        if record.prediction_accuracy > 0:
            if "prediction_accuracies" not in self._learning_metrics:
                self._learning_metrics["prediction_accuracies"] = []

            self._learning_metrics["prediction_accuracies"].append(record.prediction_accuracy)

    def _initialize_metrics(self) -> Dict[str, Any]:
        """Initialize learning metrics tracking."""
        return {
            "prediction_accuracies": [],
            "strategy_success_rates": {},
            "scenario_probability_updates": {},
        }
