"""Scenario generator for Jarvis World Model Engine.

Creates multiple strategy variants from planner output so downstream simulation
can evaluate alternative execution paths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from jarvis.core.contracts import ExecutionPlan, PlanStep
from jarvis.world_model.world_state import WorldStateSnapshot


@dataclass(slots=True)
class ScenarioStep:
    step_id: str
    description: str
    agent_role: str
    skill_name: str
    estimated_minutes: int
    risk_weight: float


@dataclass(slots=True)
class Scenario:
    scenario_id: str
    strategy_name: str
    rationale: str
    steps: List[ScenarioStep]
    assumptions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ScenarioGenerator:
    """Generates strategy scenarios from an execution plan."""

    def __init__(self) -> None:
        self._counter = 0

    def generate(
        self,
        plan: ExecutionPlan,
        world_state: WorldStateSnapshot,
        max_scenarios: int = 5,
    ) -> List[Scenario]:
        base = self._baseline_scenario(plan, world_state)
        candidates: List[Scenario] = [base]

        candidates.append(self._risk_control_scenario(plan, world_state))
        candidates.append(self._speed_optimized_scenario(plan, world_state))
        candidates.append(self._parallel_execution_scenario(plan, world_state))
        candidates.append(self._memory_guided_scenario(plan, world_state))

        # Optional exploratory strategy when uncertainty is high.
        if world_state.confidence < 0.65:
            candidates.append(self._exploratory_scenario(plan, world_state))

        return candidates[: max(1, max_scenarios)]

    def to_execution_plan(self, goal: str, scenario: Scenario) -> ExecutionPlan:
        steps = [
            PlanStep(
                id=step.step_id,
                description=step.description,
                agent_role=step.agent_role,
                skill_name=step.skill_name,
            )
            for step in scenario.steps
        ]
        return ExecutionPlan(goal=goal, steps=steps)

    def _baseline_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=0, risk_multiplier=1.0)
        return self._mk(
            strategy_name="baseline",
            rationale="Execute planner sequence with minimal transformation.",
            steps=steps,
            assumptions=["planner_order_is_reasonable"],
            metadata={"health": world_state.system_health},
        )

    def _risk_control_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=3, risk_multiplier=0.8)

        # In high-stakes contexts, prepend validation checkpoint.
        if "high_stakes_domain" in world_state.constraints:
            checkpoint = ScenarioStep(
                step_id=f"rchk-{len(steps)+1}",
                description="Risk checkpoint: verify assumptions before high-impact actions.",
                agent_role="SafetyAgent",
                skill_name="request_approval",
                estimated_minutes=5,
                risk_weight=0.2,
            )
            steps.insert(0, checkpoint)

        return self._mk(
            strategy_name="risk_control",
            rationale="Favor safer execution with additional validation overhead.",
            steps=steps,
            assumptions=["risk_reduction_improves_outcome", "accept_longer_timeline"],
            metadata={"constraint_count": len(world_state.constraints)},
        )

    def _speed_optimized_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=-2, risk_multiplier=1.2)
        if steps:
            steps[0].description += " [fast-start]"
        return self._mk(
            strategy_name="speed_optimized",
            rationale="Minimize completion time, accepting moderate risk increase.",
            steps=steps,
            assumptions=["time_to_value_is_priority", "rework_cost_is_acceptable"],
            metadata={"opportunities": world_state.opportunities},
        )

    def _parallel_execution_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=-1, risk_multiplier=1.05)

        # Reorder to execute research/design adjacent to enable parallelism by role.
        grouped = sorted(steps, key=lambda row: row.agent_role)
        for step in grouped:
            step.description += " [parallel-track]"

        return self._mk(
            strategy_name="parallel_execution",
            rationale="Increase throughput by grouping role-compatible work for parallel runs.",
            steps=grouped,
            assumptions=["agent_capacity_available", "coordination_overhead_is_low"],
            metadata={"parallel_candidate": True},
        )

    def _memory_guided_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=-1, risk_multiplier=0.95)

        if world_state.memory_knowledge:
            top = world_state.memory_knowledge[0]
            steps.insert(
                0,
                ScenarioStep(
                    step_id=f"mem-{len(steps)+1}",
                    description=f"Memory priming: leverage prior insight {top.doc_id} before execution.",
                    agent_role="ResearchAgent",
                    skill_name="collect_context",
                    estimated_minutes=4,
                    risk_weight=0.35,
                ),
            )

        return self._mk(
            strategy_name="memory_guided",
            rationale="Use similar historical knowledge to reduce uncertainty and improve efficiency.",
            steps=steps,
            assumptions=["memory_hits_are_relevant"],
            metadata={"knowledge_hits": len(world_state.memory_knowledge)},
        )

    def _exploratory_scenario(self, plan: ExecutionPlan, world_state: WorldStateSnapshot) -> Scenario:
        steps = self._convert_steps(plan.steps, minute_bias=1, risk_multiplier=1.1)
        steps.insert(
            0,
            ScenarioStep(
                step_id=f"exp-{len(steps)+1}",
                description="Exploratory probe: run lightweight discovery pass before committing full plan.",
                agent_role="ResearchAgent",
                skill_name="research_topic",
                estimated_minutes=7,
                risk_weight=0.55,
            ),
        )

        return self._mk(
            strategy_name="exploratory",
            rationale="Low-confidence world state suggests testing assumptions first.",
            steps=steps,
            assumptions=["unknowns_are_significant", "probe_will_reduce_uncertainty"],
            metadata={"world_confidence": world_state.confidence},
        )

    @staticmethod
    def _convert_steps(steps: List[PlanStep], minute_bias: int, risk_multiplier: float) -> List[ScenarioStep]:
        out: List[ScenarioStep] = []
        for idx, step in enumerate(steps, start=1):
            estimate = max(3, 12 + minute_bias + idx)
            risk = min(1.0, max(0.05, (0.3 + idx * 0.04) * risk_multiplier))
            out.append(
                ScenarioStep(
                    step_id=step.id,
                    description=step.description,
                    agent_role=step.agent_role,
                    skill_name=step.skill_name,
                    estimated_minutes=estimate,
                    risk_weight=round(risk, 3),
                )
            )
        return out

    def _mk(
        self,
        *,
        strategy_name: str,
        rationale: str,
        steps: List[ScenarioStep],
        assumptions: List[str],
        metadata: Dict[str, Any],
    ) -> Scenario:
        self._counter += 1
        return Scenario(
            scenario_id=f"scn-{self._counter}",
            strategy_name=strategy_name,
            rationale=rationale,
            steps=steps,
            assumptions=assumptions,
            metadata={"generated_at": datetime.now(timezone.utc).isoformat(), **metadata},
        )


def _example_scenario_generator() -> None:
    from jarvis.core.contracts import PlanStep

    generator = ScenarioGenerator()
    plan = ExecutionPlan(
        goal="Automate trading summary",
        steps=[
            PlanStep("s1", "Collect market data", "ResearchAgent", "collect_context"),
            PlanStep("s2", "Analyze movement", "AnalysisAgent", "analyze_data"),
            PlanStep("s3", "Publish report", "CommunicationAgent", "generate_brief"),
        ],
    )
    world = WorldStateSnapshot(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        system_health="healthy",
        confidence=0.72,
    )

    rows = generator.generate(plan, world)
    for row in rows:
        print(row.scenario_id, row.strategy_name, len(row.steps))


if __name__ == "__main__":
    _example_scenario_generator()
