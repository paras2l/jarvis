"""Decision selector for Pixi World Model Engine.

Coordinates the full world-model flow:
Planner output -> Scenario generation -> Outcome simulation -> Strategy
scoring -> Best strategy selection.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.core.contracts import ContextSnapshot, ExecutionPlan
from Pixi.memory.memory_system import MemorySystem
from Pixi.world_model.outcome_simulator import OutcomeSimulator, SimulatedOutcome
from Pixi.world_model.scenario_generator import Scenario, ScenarioGenerator
from Pixi.world_model.strategy_evaluator import EvaluatedStrategy, StrategyEvaluator
from Pixi.world_model.world_state import WorldStateModel, WorldStateSnapshot


@dataclass(slots=True)
class SelectionResult:
    selected_strategy: str
    selected_score: float
    selected_plan: ExecutionPlan
    world_state: WorldStateSnapshot
    scenarios: List[Scenario] = field(default_factory=list)
    outcomes: List[SimulatedOutcome] = field(default_factory=list)
    evaluations: List[EvaluatedStrategy] = field(default_factory=list)
    decision_trace: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class DecisionSelector:
    """Selects optimal strategy using world-model simulation pipeline."""

    def __init__(
        self,
        memory: MemorySystem,
        world_state_model: WorldStateModel | None = None,
        scenario_generator: ScenarioGenerator | None = None,
        outcome_simulator: OutcomeSimulator | None = None,
        strategy_evaluator: StrategyEvaluator | None = None,
    ) -> None:
        self._memory = memory
        self._world_state = world_state_model or WorldStateModel(memory)
        self._scenario_generator = scenario_generator or ScenarioGenerator()
        self._outcome_simulator = outcome_simulator or OutcomeSimulator(memory)
        self._strategy_evaluator = strategy_evaluator or StrategyEvaluator(memory)

    def select_best_plan(
        self,
        context: ContextSnapshot,
        planner_plan: ExecutionPlan,
        max_scenarios: int = 5,
    ) -> SelectionResult:
        """Run complete world-model decision flow and return chosen plan."""
        # Build current world model snapshot from context + memory knowledge.
        world = self._world_state.refresh(context)

        # Generate alternative strategy scenarios from the planner plan.
        scenarios = self._scenario_generator.generate(planner_plan, world, max_scenarios=max_scenarios)

        # Simulate expected outcomes for each scenario.
        outcomes = self._outcome_simulator.simulate_many(scenarios, world)

        # Score each scenario by success, risk, efficiency, and duration.
        evaluations = self._strategy_evaluator.evaluate_many(scenarios, outcomes, world)
        trace = self._build_decision_trace(world, scenarios, outcomes, evaluations)

        # Select top evaluated strategy and convert back to executable plan.
        if not evaluations:
            selected_scenario = scenarios[0] if scenarios else None
            selected_plan = planner_plan if selected_scenario is None else self._scenario_generator.to_execution_plan(
                planner_plan.goal,
                selected_scenario,
            )
            return SelectionResult(
                selected_strategy=selected_scenario.strategy_name if selected_scenario else "planner_fallback",
                selected_score=0.0,
                selected_plan=selected_plan,
                world_state=world,
                scenarios=scenarios,
                outcomes=outcomes,
                evaluations=evaluations,
                decision_trace=trace,
                metadata={"fallback": True},
            )

        top = evaluations[0]
        selected_scenario = self._find_scenario(top.scenario_id, scenarios)
        if selected_scenario is None:
            selected_plan = planner_plan
            selected_strategy = "planner_fallback"
        else:
            selected_plan = self._scenario_generator.to_execution_plan(planner_plan.goal, selected_scenario)
            selected_strategy = selected_scenario.strategy_name

        result = SelectionResult(
            selected_strategy=selected_strategy,
            selected_score=top.score,
            selected_plan=selected_plan,
            world_state=world,
            scenarios=scenarios,
            outcomes=outcomes,
            evaluations=evaluations,
            decision_trace=trace,
            metadata={"selected_at": datetime.now(timezone.utc).isoformat()},
        )

        self._persist_selection(result)
        return result

    @staticmethod
    def explain_selection(result: SelectionResult) -> str:
        """Return a compact human-readable explanation of selected strategy."""
        lines: List[str] = [
            f"selected_strategy={result.selected_strategy}",
            f"selected_score={result.selected_score:.5f}",
            f"world_health={result.world_state.system_health}",
            f"scenario_count={len(result.scenarios)}",
            f"plan_step_count={len(result.selected_plan.steps)}",
        ]
        if result.evaluations:
            lines.append("top_candidates=" + ",".join(row.strategy_name for row in result.evaluations[:3]))
        if result.decision_trace:
            lines.append("trace=" + "|".join(result.decision_trace[:5]))
        return "; ".join(lines)

    @staticmethod
    def ranked_summary(result: SelectionResult, limit: int = 5) -> List[Dict[str, Any]]:
        """Return ranked strategies with key metrics for telemetry/UI rendering."""
        if limit <= 0:
            return []
        rows: List[Dict[str, Any]] = []
        for item in result.evaluations[:limit]:
            rows.append(
                {
                    "scenario_id": item.scenario_id,
                    "strategy": item.strategy_name,
                    "score": item.score,
                    "recommendation": item.recommendation,
                    "reasoning": list(item.reasoning[:4]),
                }
            )
        return rows

    @staticmethod
    def _build_decision_trace(
        world: WorldStateSnapshot,
        scenarios: List[Scenario],
        outcomes: List[SimulatedOutcome],
        evaluations: List[EvaluatedStrategy],
    ) -> List[str]:
        trace: List[str] = []
        trace.append(f"world_health={world.system_health}")
        trace.append(f"world_confidence={world.confidence:.3f}")
        trace.append(f"scenario_count={len(scenarios)}")
        trace.append(f"outcome_count={len(outcomes)}")
        trace.append(f"evaluation_count={len(evaluations)}")
        if scenarios:
            trace.append("strategies=" + ",".join(row.strategy_name for row in scenarios))
        if evaluations:
            trace.append(f"top_score={evaluations[0].score:.5f}")
            trace.append(f"top_strategy={evaluations[0].strategy_name}")
        return trace

    @staticmethod
    def _find_scenario(scenario_id: str, scenarios: List[Scenario]) -> Scenario | None:
        for row in scenarios:
            if row.scenario_id == scenario_id:
                return row
        return None

    def _persist_selection(self, result: SelectionResult) -> None:
        payload = {
            "selected_strategy": result.selected_strategy,
            "selected_score": result.selected_score,
            "plan_steps": len(result.selected_plan.steps),
            "world_health": result.world_state.system_health,
            "scenario_count": len(result.scenarios),
            "trace": result.decision_trace[:10],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key="world_model:last_selection",
            value=payload,
            tags=["world_model", "selection"],
        )
        self._memory.remember_long_term(
            key=f"world_model:selection:{datetime.now(timezone.utc).timestamp()}",
            value=payload,
            source="decision_selector",
            importance=0.72,
            tags=["world_model", "selection", "strategy"],
        )
        self._memory.remember_semantic(
            doc_id=f"world_model:selection:{datetime.now(timezone.utc).timestamp()}",
            text=(
                f"Selected strategy {result.selected_strategy} score={result.selected_score} "
                f"health={result.world_state.system_health} scenarios={len(result.scenarios)}"
            ),
            metadata={"type": "world_model_selection"},
        )


def _example_decision_selector() -> None:
    from Pixi.core.contracts import PlanStep

    memory = MemorySystem()
    selector = DecisionSelector(memory)

    context = ContextSnapshot(
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        signals={"system_metrics": {"cpu_percent": 43, "memory_percent": 52}},
    )
    plan = ExecutionPlan(
        goal="Create a trading insight report",
        steps=[
            PlanStep("s1", "Collect market headlines", "ResearchAgent", "collect_context"),
            PlanStep("s2", "Analyze setup", "AnalysisAgent", "analyze_data"),
            PlanStep("s3", "Draft summary", "CommunicationAgent", "generate_brief"),
        ],
    )

    result = selector.select_best_plan(context, plan)
    print("Selected strategy:", result.selected_strategy)
    print("Score:", result.selected_score)
    print("Step count:", len(result.selected_plan.steps))


if __name__ == "__main__":
    _example_decision_selector()

