"""Strategy Simulator - Simulates strategies step by step across different scenarios.

Executes strategies within scenario contexts to evaluate their performance,
identify bottlenecks, and understand execution dynamics.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from uuid import uuid4
import random
from datetime import datetime, timedelta, timezone


@dataclass(slots=True)
class StrategyStep:
    """A step in strategy execution."""

    step_id: str = field(default_factory=lambda: str(uuid4()))
    step_number: int = 0
    name: str = ""
    description: str = ""
    estimated_duration_days: int = 1
    success_probability: float = 0.85
    resources_required: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)  # IDs of steps that must complete first


@dataclass(slots=True)
class SimulationExecution:
    """Record of executing a strategy in a scenario."""

    execution_id: str = field(default_factory=lambda: str(uuid4()))
    strategy_id: str = ""
    scenario_id: str = ""
    steps_completed: int = 0
    steps_failed: int = 0
    total_duration_days: int = 0
    success: bool = False
    final_state: Dict[str, Any] = field(default_factory=dict)
    bottlenecks: List[str] = field(default_factory=list)
    milestones_reached: List[Dict[str, Any]] = field(default_factory=list)


class StrategySimulator:
    """Simulates execution of strategies in various scenarios.

    Provides step-by-step simulation of strategy execution:
    - Decomposes strategies into executable steps
    - Simulates each step within scenario context
    - Tracks dependencies and resource constraints
    - Identifies bottlenecks and failure points
    - Evaluates overall strategy performance

    Simulation factors:
    - Step success probabilities (affected by scenario conditions)
    - Resource availability (scenario-dependent)
    - Timeline impacts (scenario effects on duration)
    - Cascading failures (dependencies and risks)
    - Adaptive adjustments (replanning as needed)
    """

    def __init__(self) -> None:
        self._step_store: Dict[str, StrategyStep] = {}

    def simulate_strategy(
        self,
        strategy: Dict[str, Any],
        scenarios: List[Dict[str, Any]],
        world_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Simulate a strategy across multiple scenarios.

        Integration point: Scenario Generator → Strategy Simulator

        Args:
            strategy: Strategy to simulate
            scenarios: Scenarios to test against
            world_state: Current world state context

        Returns:
            Simulation results with performance metrics across scenarios
        """
        strategy_id = strategy.get("id", strategy.get("name", str(uuid4())))
        scenario_results = []

        # Simulate strategy in each scenario
        for scenario in scenarios:
            execution = self._execute_strategy_in_scenario(
                strategy=strategy,
                scenario=scenario,
                world_state=world_state,
            )
            scenario_results.append(self._execution_to_dict(execution))

        # Aggregate results
        aggregated = self._aggregate_scenario_results(scenario_results)

        return {
            "strategy_id": strategy_id,
            "scenario_results": scenario_results,
            "avg_success_rate": aggregated["success_rate"],
            "avg_duration_days": aggregated["avg_duration"],
            "critical_failures": aggregated["critical_failures"],
            "common_bottlenecks": aggregated["common_bottlenecks"],
        }

    def simulate_single_execution(
        self,
        strategy: Dict[str, Any],
        scenario: Dict[str, Any],
        world_state: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Simulate a single strategy execution.

        Integration point: Reasoning Engine → Ad-hoc simulation
        """
        execution = self._execute_strategy_in_scenario(strategy, scenario, world_state)

        return {
            "execution_id": execution.execution_id,
            "strategy_id": execution.strategy_id,
            "scenario_id": execution.scenario_id,
            "success": execution.success,
            "duration_days": execution.total_duration_days,
            "steps_completed": execution.steps_completed,
            "steps_failed": execution.steps_failed,
            "bottlenecks": execution.bottlenecks,
            "final_state": execution.final_state,
        }

    def _execute_strategy_in_scenario(
        self,
        strategy: Dict[str, Any],
        scenario: Dict[str, Any],
        world_state: Dict[str, Any],
    ) -> SimulationExecution:
        """Execute a strategy step-by-step within a scenario."""
        execution = SimulationExecution(
            strategy_id=strategy.get("id", strategy.get("name", "unknown")),
            scenario_id=scenario.get("scenario_id", "unknown"),
        )

        # Decompose strategy into steps (or use provided steps)
        steps = self._decompose_strategy(strategy)

        if not steps:
            execution.success = False
            return execution

        # Execute each step
        completed_steps = []
        failed_steps = []
        total_duration = 0
        current_state = world_state.copy()

        scenario_type = scenario.get("scenario_type", "realistic")
        scenario_events = scenario.get("key_events", [])

        for step in steps:
            # Check if dependencies are met
            if not self._check_dependencies_met(step, completed_steps):
                failed_steps.append(step.name)
                execution.steps_failed += 1
                execution.bottlenecks.append(f"Unmet dependencies for: {step.name}")
                continue

            # Simulate step execution
            step_success = self._execute_step(
                step=step,
                scenario_type=scenario_type,
                current_state=current_state,
                scenario_events=scenario_events,
            )

            if step_success:
                execution.steps_completed += 1
                completed_steps.append(step.step_id)
                total_duration += step.estimated_duration_days
                current_state = self._update_state_after_step(current_state, step)

                # Record milestone
                execution.milestones_reached.append(
                    {
                        "step": step.name,
                        "day": total_duration,
                        "state_update": {k: v for k, v in current_state.items() if k != "original"},
                    }
                )
            else:
                execution.steps_failed += 1
                failed_steps.append(step.name)

                # Check if this is a critical step
                if step.get("critical", False):
                    execution.bottlenecks.append(f"Critical failure: {step.name}")
                    break  # Stop execution on critical failure

        # Finalize execution
        execution.success = len(failed_steps) == 0
        execution.total_duration_days = total_duration
        execution.final_state = current_state

        return execution

    def _decompose_strategy(self, strategy: Dict[str, Any]) -> List[StrategyStep]:
        """Decompose a strategy into executable steps."""
        # If strategy already has steps, use those
        if "steps" in strategy:
            steps = []
            for i, step_data in enumerate(strategy.get("steps", [])):
                step = StrategyStep(
                    step_number=i + 1,
                    name=step_data.get("name", f"Step {i + 1}"),
                    description=step_data.get("description", ""),
                    estimated_duration_days=step_data.get("duration_days", 5),
                    success_probability=step_data.get("success_probability", 0.85),
                    resources_required=step_data.get("resources", []),
                    dependencies=step_data.get("dependencies", []),
                )
                steps.append(step)
            return steps

        # Otherwise, generate generic steps from strategy attributes
        total_duration = strategy.get("estimated_duration_days", 30)
        num_steps = max(1, total_duration // 10)  # Roughly 10 days per step

        steps = []
        for i in range(num_steps):
            step = StrategyStep(
                step_number=i + 1,
                name=strategy.get("name", "Strategy") + f" - Phase {i + 1}",
                description=f"Execute phase {i + 1}",
                estimated_duration_days=max(1, total_duration // num_steps),
                success_probability=0.85 - (i * 0.05),  # Success rate decreases per step
                resources_required=strategy.get("required_resources", []),
            )
            steps.append(step)

        return steps

    def _execute_step(
        self,
        step: StrategyStep,
        scenario_type: str,
        current_state: Dict[str, Any],
        scenario_events: List[Dict[str, Any]],
    ) -> bool:
        """Execute a single step and determine success/failure."""
        base_success_prob = step.success_probability

        # Scenario type affects success probability
        scenario_multipliers = {
            "optimistic": 1.2,
            "realistic": 1.0,
            "pessimistic": 0.7,
            "alternative": 0.9,
        }

        scenario_factor = scenario_multipliers.get(scenario_type, 1.0)

        # Check for interfering events
        event_factor = 1.0
        for event in scenario_events:
            if event.get("type") == "risk" and event.get("severity") == "high":
                event_factor *= 0.8

        # Calculate final success probability
        final_prob = min(0.95, max(0.1, base_success_prob * scenario_factor * event_factor))

        # Simulate step result
        return random.random() < final_prob

    def _check_dependencies_met(self, step: StrategyStep, completed_steps: List[str]) -> bool:
        """Check if step dependencies have been satisfied."""
        if not step.dependencies:
            return True

        # All dependencies must be in completed steps
        return all(dep in completed_steps for dep in step.dependencies)

    def _update_state_after_step(self, current_state: Dict[str, Any], step: StrategyStep) -> Dict[str, Any]:
        """Update world state after successful step execution."""
        new_state = current_state.copy()

        # Progress metrics
        if "progress_percent" in new_state:
            new_state["progress_percent"] = min(100, new_state["progress_percent"] + 10)

        # Resource consumption
        if step.resources_required:
            if "resources_remaining" not in new_state:
                new_state["resources_remaining"] = {}

            for resource in step.resources_required:
                if resource in new_state["resources_remaining"]:
                    new_state["resources_remaining"][resource] = max(
                        0,
                        new_state["resources_remaining"][resource] - 10,
                    )

        # Add step completion marker
        if "completed_steps" not in new_state:
            new_state["completed_steps"] = []
        new_state["completed_steps"].append(step.name)

        return new_state

    def _aggregate_scenario_results(self, scenario_results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate results across scenarios."""
        if not scenario_results:
            return {
                "success_rate": 0.0,
                "avg_duration": 0,
                "critical_failures": [],
                "common_bottlenecks": [],
            }

        success_count = sum(1 for r in scenario_results if r.get("success", False))
        durations = [r.get("total_duration_days", 0) for r in scenario_results]

        # Identify common bottlenecks
        all_bottlenecks = []
        for result in scenario_results:
            all_bottlenecks.extend(result.get("bottlenecks", []))

        bottleneck_counts = {}
        for bottleneck in all_bottlenecks:
            bottleneck_counts[bottleneck] = bottleneck_counts.get(bottleneck, 0) + 1

        common_bottlenecks = [
            {"bottleneck": name, "frequency": count}
            for name, count in sorted(bottleneck_counts.items(), key=lambda x: x[1], reverse=True)[:3]
        ]

        return {
            "success_rate": success_count / len(scenario_results) if scenario_results else 0.0,
            "avg_duration": sum(durations) / len(durations) if durations else 0,
            "critical_failures": [],  # Captured in individual results
            "common_bottlenecks": common_bottlenecks,
        }

    def _execution_to_dict(self, execution: SimulationExecution) -> Dict[str, Any]:
        """Convert execution to dictionary."""
        return {
            "execution_id": execution.execution_id,
            "strategy_id": execution.strategy_id,
            "scenario_id": execution.scenario_id,
            "success": execution.success,
            "steps_completed": execution.steps_completed,
            "steps_failed": execution.steps_failed,
            "total_duration_days": execution.total_duration_days,
            "bottlenecks": execution.bottlenecks,
            "milestones": execution.milestones_reached,
            "final_state": execution.final_state,
        }
