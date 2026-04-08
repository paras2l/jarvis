"""Outcome simulator for Pixi World Model Engine.

Simulates expected outcomes for each scenario using heuristics and prior
experience from memory.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem
from Pixi.world_model.scenario_generator import Scenario
from Pixi.world_model.world_state import WorldStateSnapshot


@dataclass(slots=True)
class SimulatedOutcome:
    scenario_id: str
    strategy_name: str
    predicted_duration_minutes: float
    predicted_risk: float
    predicted_success_probability: float
    resource_intensity: float
    confidence: float
    insights: List[str] = field(default_factory=list)
    metrics: Dict[str, float] = field(default_factory=dict)


class OutcomeSimulator:
    """Simulate scenario outcomes before real execution."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def simulate_many(self, scenarios: List[Scenario], world_state: WorldStateSnapshot) -> List[SimulatedOutcome]:
        out: List[SimulatedOutcome] = []
        for scenario in scenarios:
            out.append(self.simulate(scenario, world_state))
        self._persist_batch(out, world_state)
        return out

    def simulate(self, scenario: Scenario, world_state: WorldStateSnapshot) -> SimulatedOutcome:
        base_duration = self._estimate_duration(scenario)
        base_risk = self._estimate_risk(scenario, world_state)
        base_success = self._estimate_success(scenario, world_state, base_risk)
        resource_intensity = self._estimate_resource_intensity(scenario, world_state)

        memory_adjust = self._memory_adjustment(scenario, world_state)
        duration = max(1.0, base_duration * memory_adjust["duration_factor"])
        risk = min(1.0, max(0.0, base_risk * memory_adjust["risk_factor"]))
        success = min(1.0, max(0.0, base_success * memory_adjust["success_factor"]))

        confidence = self._estimate_confidence(world_state, memory_adjust)
        insights = self._build_insights(scenario, world_state, duration, risk, success, resource_intensity)

        metrics = {
            "step_count": float(len(scenario.steps)),
            "assumption_count": float(len(scenario.assumptions)),
            "knowledge_weight": float(memory_adjust.get("knowledge_hits", 0.0)),
            "duration_factor": float(memory_adjust["duration_factor"]),
            "risk_factor": float(memory_adjust["risk_factor"]),
            "success_factor": float(memory_adjust["success_factor"]),
        }

        return SimulatedOutcome(
            scenario_id=scenario.scenario_id,
            strategy_name=scenario.strategy_name,
            predicted_duration_minutes=round(duration, 3),
            predicted_risk=round(risk, 4),
            predicted_success_probability=round(success, 4),
            resource_intensity=round(resource_intensity, 4),
            confidence=round(confidence, 4),
            insights=insights,
            metrics=metrics,
        )

    @staticmethod
    def _estimate_duration(scenario: Scenario) -> float:
        if not scenario.steps:
            return 0.0
        return float(sum(step.estimated_minutes for step in scenario.steps))

    @staticmethod
    def _estimate_risk(scenario: Scenario, world_state: WorldStateSnapshot) -> float:
        if not scenario.steps:
            return 0.1

        avg_step_risk = sum(step.risk_weight for step in scenario.steps) / len(scenario.steps)
        system_modifier = 1.15 if world_state.system_health != "healthy" else 0.95
        high_stakes_modifier = 1.2 if "high_stakes_domain" in world_state.constraints else 1.0
        uncertainty_modifier = 1.1 if world_state.confidence < 0.6 else 1.0

        risk = avg_step_risk * system_modifier * high_stakes_modifier * uncertainty_modifier
        return min(1.0, max(0.01, risk))

    @staticmethod
    def _estimate_success(scenario: Scenario, world_state: WorldStateSnapshot, risk: float) -> float:
        base = 0.82

        if scenario.strategy_name == "risk_control":
            base += 0.06
        elif scenario.strategy_name == "speed_optimized":
            base -= 0.05
        elif scenario.strategy_name == "exploratory":
            base -= 0.03
        elif scenario.strategy_name == "memory_guided":
            base += 0.04

        if world_state.system_health == "degraded":
            base -= 0.07
        if world_state.system_health == "critical":
            base -= 0.12

        if "memory_guided_shortcut" in world_state.opportunities:
            base += 0.03

        base -= risk * 0.35
        return min(1.0, max(0.05, base))

    @staticmethod
    def _estimate_resource_intensity(scenario: Scenario, world_state: WorldStateSnapshot) -> float:
        step_count = max(1, len(scenario.steps))
        avg_minutes = sum(step.estimated_minutes for step in scenario.steps) / step_count

        intensity = (avg_minutes / 20.0) + (step_count / 10.0)
        if scenario.strategy_name == "parallel_execution":
            intensity += 0.2
        if world_state.system_health != "healthy":
            intensity += 0.25

        return min(1.0, max(0.05, intensity))

    def _memory_adjustment(self, scenario: Scenario, world_state: WorldStateSnapshot) -> Dict[str, float]:
        query = f"{scenario.strategy_name} {world_state.current_application} {world_state.user_activity}"
        hits = self._memory.semantic_search(query, top_k=6)

        if not hits:
            return {
                "duration_factor": 1.0,
                "risk_factor": 1.0,
                "success_factor": 1.0,
                "knowledge_hits": 0.0,
            }

        avg_score = sum(item.score for item in hits) / len(hits)
        duration_factor = max(0.8, 1.0 - avg_score * 0.15)
        risk_factor = max(0.75, 1.0 - avg_score * 0.2)
        success_factor = min(1.2, 1.0 + avg_score * 0.18)

        # Domain-specific correction from historical memory tags.
        if any("failure" in str(item.metadata).lower() for item in hits):
            risk_factor = min(1.25, risk_factor + 0.12)
            success_factor = max(0.75, success_factor - 0.08)

        return {
            "duration_factor": duration_factor,
            "risk_factor": risk_factor,
            "success_factor": success_factor,
            "knowledge_hits": float(len(hits)),
        }

    @staticmethod
    def _estimate_confidence(world_state: WorldStateSnapshot, adjustment: Dict[str, float]) -> float:
        base = world_state.confidence * 0.6
        knowledge = min(0.35, adjustment.get("knowledge_hits", 0.0) * 0.05)
        consistency = 0.05 if abs(1.0 - adjustment["success_factor"]) < 0.2 else 0.0
        return min(1.0, base + knowledge + consistency)

    @staticmethod
    def _build_insights(
        scenario: Scenario,
        world_state: WorldStateSnapshot,
        duration: float,
        risk: float,
        success: float,
        resource_intensity: float,
    ) -> List[str]:
        notes: List[str] = []
        notes.append(f"strategy={scenario.strategy_name}")
        notes.append(f"duration={duration:.1f}m")
        notes.append(f"risk={risk:.2f}")
        notes.append(f"success={success:.2f}")

        if world_state.system_health != "healthy":
            notes.append("system_health_penalty_applied")
        if resource_intensity > 0.7:
            notes.append("high_resource_intensity")
        if "high_stakes_domain" in world_state.constraints:
            notes.append("high_stakes_context")
        if "memory_guided_shortcut" in world_state.opportunities:
            notes.append("memory_shortcut_available")
        return notes

    def _persist_batch(self, outcomes: List[SimulatedOutcome], world_state: WorldStateSnapshot) -> None:
        if not outcomes:
            return
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "app": world_state.current_application,
            "activity": world_state.user_activity,
            "outcomes": [
                {
                    "scenario_id": row.scenario_id,
                    "strategy": row.strategy_name,
                    "duration": row.predicted_duration_minutes,
                    "risk": row.predicted_risk,
                    "success": row.predicted_success_probability,
                }
                for row in outcomes
            ],
        }
        self._memory.remember_short_term(
            key="world_model:last_outcomes",
            value=payload,
            tags=["world_model", "simulation"],
        )
        self._memory.remember_semantic(
            doc_id=f"world_model:outcomes:{datetime.now(timezone.utc).timestamp()}",
            text="; ".join(
                f"{row.strategy_name}:success={row.predicted_success_probability},risk={row.predicted_risk}"
                for row in outcomes
            ),
            metadata={"type": "outcome_simulation"},
        )


def _example_outcome_simulator() -> None:
    from Pixi.world_model.scenario_generator import ScenarioGenerator
    from Pixi.world_model.world_state import WorldStateModel
    from Pixi.core.contracts import ContextSnapshot, ExecutionPlan, PlanStep

    memory = MemorySystem()
    state_model = WorldStateModel(memory)
    world = state_model.refresh(
        ContextSnapshot(
            current_application="tradingview",
            user_activity="analysis",
            time_of_day="morning",
            signals={"system_metrics": {"cpu_percent": 48, "memory_percent": 52}},
        )
    )

    plan = ExecutionPlan(
        goal="Generate trading brief",
        steps=[
            PlanStep("s1", "Collect data", "ResearchAgent", "collect_context"),
            PlanStep("s2", "Simulate entries", "AnalysisAgent", "analyze_data"),
            PlanStep("s3", "Publish brief", "CommunicationAgent", "generate_brief"),
        ],
    )

    scenarios = ScenarioGenerator().generate(plan, world)
    simulator = OutcomeSimulator(memory)
    outcomes = simulator.simulate_many(scenarios, world)
    for row in outcomes:
        print(row.strategy_name, row.predicted_success_probability, row.predicted_risk)


if __name__ == "__main__":
    _example_outcome_simulator()

