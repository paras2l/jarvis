"""Decision engine for Pixi reasoning.

Scores generated strategies and selects the best reasoning outcome before
planner decomposition.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.reasoning_engine.constraint_analyzer import ConstraintAnalysisResult
from Pixi.reasoning_engine.goal_inference import GoalInferenceResult
from Pixi.reasoning_engine.strategy_generator import StrategyGenerationResult, StrategyOption


@dataclass(slots=True)
class StrategyScore:
    """Detailed scoring row for one strategy candidate."""

    strategy_id: str
    name: str
    total: float
    quality_component: float
    speed_component: float
    risk_component: float
    resource_component: float
    robustness_component: float
    alignment_component: float
    penalties: List[str] = field(default_factory=list)
    bonuses: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ReasoningDecision:
    """Selected decision output consumed by planning system."""

    selected_strategy_id: str
    selected_strategy_name: str
    selected_style: str
    objective: str
    planning_goal: str
    confidence: float
    scores: List[StrategyScore] = field(default_factory=list)
    alternatives: List[Dict[str, Any]] = field(default_factory=list)
    rationale: List[str] = field(default_factory=list)
    decision_trace: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ReasoningDecisionEngine:
    """Evaluates strategy candidates and selects the best option."""

    def decide(
        self,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
        strategies: StrategyGenerationResult,
        *,
        context: Any,
        world_state: Any | None = None,
    ) -> ReasoningDecision:
        """Score candidates and produce final reasoning decision."""
        scored = [self._score_strategy(item, inference, constraints) for item in strategies.strategies]
        ranked = sorted(scored, key=lambda row: row.total, reverse=True)

        selected = ranked[0] if ranked else self._fallback_score(inference)
        selected_strategy = self._resolve_strategy(selected.strategy_id, strategies.strategies)

        planning_goal = self._compose_planning_goal(inference, constraints, selected_strategy)
        alternatives = self._build_alternatives(ranked)
        rationale = self._build_rationale(selected, selected_strategy, inference, constraints)
        trace = self._build_trace(ranked, selected, constraints)

        confidence = self._decision_confidence(selected, inference, constraints)

        return ReasoningDecision(
            selected_strategy_id=selected.strategy_id,
            selected_strategy_name=selected.name,
            selected_style=selected_strategy.style if selected_strategy else "balanced",
            objective=inference.inferred_goal,
            planning_goal=planning_goal,
            confidence=confidence,
            scores=ranked,
            alternatives=alternatives,
            rationale=rationale,
            decision_trace=trace,
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "objective_type": inference.objective_type,
                "mode_hint": constraints.recommended_mode,
            },
        )

    def summarize(self, decision: ReasoningDecision) -> Dict[str, Any]:
        """Compact summary for memory persistence and telemetry."""
        return {
            "selected_strategy": decision.selected_strategy_name,
            "style": decision.selected_style,
            "planning_goal": decision.planning_goal,
            "confidence": decision.confidence,
            "alternatives": decision.alternatives,
            "top_score": decision.scores[0].total if decision.scores else 0.0,
        }

    def _score_strategy(
        self,
        strategy: StrategyOption,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
    ) -> StrategyScore:
        quality = strategy.quality_score * 0.23
        speed = strategy.speed_score * self._speed_weight(inference, constraints)
        risk = (1.0 - strategy.risk_score) * 0.22
        resource = strategy.resource_score * self._resource_weight(constraints)
        robustness = strategy.robustness_score * 0.18
        alignment = self._alignment_score(strategy, inference, constraints) * 0.17

        total = quality + speed + risk + resource + robustness + alignment
        penalties: List[str] = []
        bonuses: List[str] = []

        if strategy.risk_score > constraints.risk_score + 0.2:
            total -= 0.08
            penalties.append("risk_above_profile")
        if constraints.recommended_mode == "cautious" and strategy.style in {"aggressive", "exploratory"}:
            total -= 0.07
            penalties.append("mode_mismatch_cautious")
        if constraints.recommended_mode == "resource_saving" and strategy.resource_score < 0.65:
            total -= 0.05
            penalties.append("resource_underfit")
        if constraints.time_pressure > 0.8 and strategy.speed_score < 0.55:
            total -= 0.05
            penalties.append("insufficient_speed_for_deadline")

        if strategy.style == constraints.recommended_mode:
            total += 0.06
            bonuses.append("mode_alignment_bonus")
        if strategy.robustness_score > 0.75 and constraints.risk_score > 0.65:
            total += 0.04
            bonuses.append("robustness_under_risk_bonus")
        if strategy.speed_score > 0.75 and constraints.time_pressure > 0.7:
            total += 0.03
            bonuses.append("deadline_speed_bonus")
        if strategy.resource_score > 0.78 and constraints.resource_pressure > 0.72:
            total += 0.03
            bonuses.append("resource_efficiency_bonus")

        total = min(0.99, max(0.01, total))
        return StrategyScore(
            strategy_id=strategy.strategy_id,
            name=strategy.name,
            total=round(total, 5),
            quality_component=round(quality, 5),
            speed_component=round(speed, 5),
            risk_component=round(risk, 5),
            resource_component=round(resource, 5),
            robustness_component=round(robustness, 5),
            alignment_component=round(alignment, 5),
            penalties=penalties,
            bonuses=bonuses,
        )

    @staticmethod
    def _speed_weight(inference: GoalInferenceResult, constraints: ConstraintAnalysisResult) -> float:
        weight = 0.1
        weight += inference.urgency * 0.08
        weight += constraints.time_pressure * 0.05
        return min(0.25, max(0.08, weight))

    @staticmethod
    def _resource_weight(constraints: ConstraintAnalysisResult) -> float:
        weight = 0.1
        if constraints.resource_pressure > 0.7:
            weight += 0.05
        if constraints.recommended_mode == "resource_saving":
            weight += 0.04
        return min(0.2, max(0.08, weight))

    @staticmethod
    def _alignment_score(
        strategy: StrategyOption,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
    ) -> float:
        score = 0.58
        if inference.objective_type in {"analysis", "planning"} and strategy.style in {"analysis_first", "cautious", "balanced"}:
            score += 0.13
        if inference.objective_type in {"delivery", "execution"} and strategy.style in {"incremental", "balanced", "aggressive"}:
            score += 0.12
        if inference.objective_type == "creative" and strategy.style in {"draft_refine", "balanced"}:
            score += 0.14
        if constraints.recommended_mode == strategy.style:
            score += 0.12
        return min(0.99, max(0.1, score))

    @staticmethod
    def _resolve_strategy(strategy_id: str, rows: List[StrategyOption]) -> StrategyOption | None:
        for row in rows:
            if row.strategy_id == strategy_id:
                return row
        return None

    @staticmethod
    def _compose_planning_goal(
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
        strategy: StrategyOption | None,
    ) -> str:
        style = strategy.style if strategy else constraints.recommended_mode
        hint = f"[reasoning_style={style}; urgency={inference.urgency}; feasibility={constraints.overall_feasibility}]"
        return f"{inference.inferred_goal} {hint}".strip()

    @staticmethod
    def _build_alternatives(ranked: List[StrategyScore]) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for row in ranked[1:4]:
            out.append(
                {
                    "strategy_id": row.strategy_id,
                    "name": row.name,
                    "score": row.total,
                    "penalties": row.penalties,
                    "bonuses": row.bonuses,
                }
            )
        return out

    @staticmethod
    def _build_rationale(
        selected: StrategyScore,
        selected_strategy: StrategyOption | None,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
    ) -> List[str]:
        reasons: List[str] = []
        reasons.append(f"Selected {selected.name} with score={selected.total:.4f}.")
        reasons.append(
            "Component profile: "
            f"quality={selected.quality_component:.3f}, speed={selected.speed_component:.3f}, "
            f"risk={selected.risk_component:.3f}, resource={selected.resource_component:.3f}."
        )
        reasons.append(
            f"Objective type={inference.objective_type}, urgency={inference.urgency}, mode={constraints.recommended_mode}."
        )
        if selected.bonuses:
            reasons.append("Bonuses: " + ", ".join(selected.bonuses))
        if selected.penalties:
            reasons.append("Penalties accepted: " + ", ".join(selected.penalties))
        if selected_strategy and selected_strategy.tradeoffs:
            reasons.append("Tradeoffs: " + "; ".join(selected_strategy.tradeoffs[:2]))
        return reasons[:6]

    @staticmethod
    def _build_trace(ranked: List[StrategyScore], selected: StrategyScore, constraints: ConstraintAnalysisResult) -> List[str]:
        trace = [
            f"mode_hint={constraints.recommended_mode}",
            f"risk={constraints.risk_score}",
            f"time_pressure={constraints.time_pressure}",
            f"resource_pressure={constraints.resource_pressure}",
            f"selected={selected.strategy_id}",
        ]
        if ranked:
            trace.append("ranking=" + ",".join(f"{row.strategy_id}:{row.total:.3f}" for row in ranked[:5]))
        return trace

    @staticmethod
    def _decision_confidence(
        selected: StrategyScore,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
    ) -> float:
        confidence = 0.45
        confidence += selected.total * 0.35
        confidence += inference.confidence * 0.2
        confidence += max(0.0, 0.25 - constraints.risk_score) * 0.2
        return round(min(0.99, max(0.05, confidence)), 4)

    @staticmethod
    def _fallback_score(inference: GoalInferenceResult) -> StrategyScore:
        return StrategyScore(
            strategy_id="fallback",
            name="Fallback Balanced",
            total=max(0.2, inference.confidence * 0.5),
            quality_component=0.1,
            speed_component=0.08,
            risk_component=0.1,
            resource_component=0.07,
            robustness_component=0.09,
            alignment_component=0.1,
            penalties=["no_strategy_candidates"],
            bonuses=[],
        )

