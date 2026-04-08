"""Strategy evaluator for Pixi World Model Engine.

Scores simulated scenario outcomes across efficiency, risk, time cost, and
probability of success.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem
from Pixi.world_model.outcome_simulator import SimulatedOutcome
from Pixi.world_model.scenario_generator import Scenario
from Pixi.world_model.world_state import WorldStateSnapshot


@dataclass(slots=True)
class EvaluationWeights:
    success_weight: float = 0.42
    risk_weight: float = 0.24
    duration_weight: float = 0.18
    efficiency_weight: float = 0.10
    confidence_weight: float = 0.06


@dataclass(slots=True)
class EvaluatedStrategy:
    scenario_id: str
    strategy_name: str
    score: float
    score_breakdown: Dict[str, float]
    recommendation: str
    reasoning: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class StrategyEvaluator:
    """Computes comparable strategy scores from simulated outcomes."""

    def __init__(self, memory: MemorySystem, weights: EvaluationWeights | None = None) -> None:
        self._memory = memory
        self._weights = weights or EvaluationWeights()

    def evaluate_many(
        self,
        scenarios: List[Scenario],
        outcomes: List[SimulatedOutcome],
        world_state: WorldStateSnapshot,
    ) -> List[EvaluatedStrategy]:
        by_scenario = {row.scenario_id: row for row in scenarios}
        rows: List[EvaluatedStrategy] = []
        for outcome in outcomes:
            scenario = by_scenario.get(outcome.scenario_id)
            if scenario is None:
                continue
            rows.append(self.evaluate(scenario, outcome, world_state))

        ranked = sorted(rows, key=lambda row: row.score, reverse=True)
        self._persist_evaluations(ranked, world_state)
        return ranked

    def evaluate(
        self,
        scenario: Scenario,
        outcome: SimulatedOutcome,
        world_state: WorldStateSnapshot,
    ) -> EvaluatedStrategy:
        duration_score = self._duration_component(outcome.predicted_duration_minutes)
        risk_score = 1.0 - outcome.predicted_risk
        success_score = outcome.predicted_success_probability
        efficiency_score = self._efficiency_component(outcome)
        confidence_score = outcome.confidence

        weighted = (
            success_score * self._weights.success_weight
            + risk_score * self._weights.risk_weight
            + duration_score * self._weights.duration_weight
            + efficiency_score * self._weights.efficiency_weight
            + confidence_score * self._weights.confidence_weight
        )

        adjusted = self._apply_context_adjustments(weighted, scenario, outcome, world_state)
        recommendation = self._recommend(adjusted)

        breakdown = {
            "success_component": round(success_score * self._weights.success_weight, 5),
            "risk_component": round(risk_score * self._weights.risk_weight, 5),
            "duration_component": round(duration_score * self._weights.duration_weight, 5),
            "efficiency_component": round(efficiency_score * self._weights.efficiency_weight, 5),
            "confidence_component": round(confidence_score * self._weights.confidence_weight, 5),
            "adjusted_score": round(adjusted, 5),
        }

        reasoning = self._reasoning(scenario, outcome, world_state, adjusted)
        return EvaluatedStrategy(
            scenario_id=scenario.scenario_id,
            strategy_name=scenario.strategy_name,
            score=round(adjusted, 5),
            score_breakdown=breakdown,
            recommendation=recommendation,
            reasoning=reasoning,
            metadata={"evaluated_at": datetime.now(timezone.utc).isoformat()},
        )

    @staticmethod
    def _duration_component(duration_minutes: float) -> float:
        # Faster is better, but diminishing gain below 15 minutes.
        if duration_minutes <= 15:
            return 1.0
        if duration_minutes >= 120:
            return 0.15
        return max(0.15, 1.0 - (duration_minutes - 15) / 125.0)

    @staticmethod
    def _efficiency_component(outcome: SimulatedOutcome) -> float:
        resource_penalty = min(0.8, outcome.resource_intensity)
        step_penalty = min(0.3, outcome.metrics.get("step_count", 1.0) * 0.02)
        return max(0.1, 1.0 - resource_penalty * 0.6 - step_penalty)

    @staticmethod
    def _recommend(score: float) -> str:
        if score >= 0.78:
            return "strong_recommend"
        if score >= 0.63:
            return "recommend"
        if score >= 0.48:
            return "conditional"
        return "avoid"

    def _apply_context_adjustments(
        self,
        base_score: float,
        scenario: Scenario,
        outcome: SimulatedOutcome,
        world_state: WorldStateSnapshot,
    ) -> float:
        score = base_score

        if "high_stakes_domain" in world_state.constraints:
            if scenario.strategy_name == "risk_control":
                score += 0.07
            if scenario.strategy_name == "speed_optimized":
                score -= 0.08

        if world_state.system_health != "healthy" and scenario.strategy_name == "parallel_execution":
            score -= 0.05

        if "memory_guided_shortcut" in world_state.opportunities and scenario.strategy_name == "memory_guided":
            score += 0.06

        if outcome.predicted_success_probability < 0.45:
            score -= 0.1

        memory_penalty = self._historical_penalty(scenario.strategy_name)
        score -= memory_penalty

        return min(1.0, max(0.0, score))

    def _historical_penalty(self, strategy_name: str) -> float:
        hits = self._memory.semantic_search(f"{strategy_name} failure", top_k=3)
        if not hits:
            return 0.0
        avg = sum(hit.score for hit in hits) / len(hits)
        return min(0.08, avg * 0.06)

    @staticmethod
    def _reasoning(
        scenario: Scenario,
        outcome: SimulatedOutcome,
        world_state: WorldStateSnapshot,
        score: float,
    ) -> List[str]:
        reasons: List[str] = []
        reasons.append(f"strategy={scenario.strategy_name}")
        reasons.append(f"score={score:.3f}")
        reasons.append(f"success={outcome.predicted_success_probability:.3f}")
        reasons.append(f"risk={outcome.predicted_risk:.3f}")
        reasons.append(f"duration={outcome.predicted_duration_minutes:.1f}m")

        if world_state.system_health != "healthy":
            reasons.append("system_health_adjustment_applied")
        if "high_stakes_domain" in world_state.constraints:
            reasons.append("high_stakes_safety_bias")
        if scenario.strategy_name == "memory_guided":
            reasons.append("memory_signal_used")
        return reasons

    def _persist_evaluations(self, evaluations: List[EvaluatedStrategy], world_state: WorldStateSnapshot) -> None:
        if not evaluations:
            return
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "app": world_state.current_application,
            "evaluations": [
                {
                    "scenario_id": row.scenario_id,
                    "strategy": row.strategy_name,
                    "score": row.score,
                    "recommendation": row.recommendation,
                }
                for row in evaluations
            ],
        }
        self._memory.remember_short_term(
            key="world_model:last_evaluations",
            value=payload,
            tags=["world_model", "evaluation"],
        )
        self._memory.remember_semantic(
            doc_id=f"world_model:evaluations:{datetime.now(timezone.utc).timestamp()}",
            text="; ".join(f"{row.strategy_name}:{row.score}" for row in evaluations),
            metadata={"type": "strategy_evaluation"},
        )


def _example_evaluator() -> None:
    from Pixi.memory.memory_system import MemorySystem
    from Pixi.world_model.outcome_simulator import SimulatedOutcome
    from Pixi.world_model.scenario_generator import Scenario, ScenarioStep
    from Pixi.world_model.world_state import WorldStateSnapshot

    memory = MemorySystem()
    evaluator = StrategyEvaluator(memory)

    scenario = Scenario(
        scenario_id="scn-1",
        strategy_name="risk_control",
        rationale="safe execution",
        steps=[ScenarioStep("s1", "validate", "SafetyAgent", "request_approval", 5, 0.2)],
    )
    outcome = SimulatedOutcome("scn-1", "risk_control", 20, 0.22, 0.86, 0.35, 0.8)
    world = WorldStateSnapshot(
        timestamp=datetime.now(timezone.utc).isoformat(),
        current_application="tradingview",
        user_activity="analysis",
        time_of_day="morning",
        system_health="healthy",
        constraints=["high_stakes_domain"],
        opportunities=["memory_guided_shortcut"],
        confidence=0.8,
    )

    print(evaluator.evaluate(scenario, outcome, world))


if __name__ == "__main__":
    _example_evaluator()

