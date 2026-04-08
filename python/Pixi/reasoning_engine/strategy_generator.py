"""Strategy generation module for Pixi reasoning.

Generates multiple possible plans-of-approach for an inferred objective before
planner decomposition begins.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.reasoning_engine.constraint_analyzer import ConstraintAnalysisResult
from Pixi.reasoning_engine.goal_inference import GoalInferenceResult


@dataclass(slots=True)
class StrategyStep:
    """A pre-planning action primitive used for reasoning-level strategy."""

    id: str
    title: str
    intent: str
    estimated_cost: float
    estimated_risk: float
    expected_value: float
    depends_on: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)


@dataclass(slots=True)
class StrategyOption:
    """One candidate strategy for objective achievement."""

    strategy_id: str
    name: str
    style: str
    objective: str
    summary: str
    confidence: float
    speed_score: float
    quality_score: float
    robustness_score: float
    resource_score: float
    risk_score: float
    feasibility: float
    assumptions: List[str] = field(default_factory=list)
    tradeoffs: List[str] = field(default_factory=list)
    steps: List[StrategyStep] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class StrategyGenerationResult:
    """Collection of generated strategies with generation metadata."""

    objective: str
    recommended_style_hint: str
    strategies: List[StrategyOption] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class StrategyGenerator:
    """Constructs strategy options under inferred constraints."""

    def generate(
        self,
        inference: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
        *,
        context: Any,
        world_state: Any | None = None,
        max_strategies: int = 6,
    ) -> StrategyGenerationResult:
        """Generate strategy variants and return ranked candidates."""
        candidates: List[StrategyOption] = []

        candidates.append(self._build_baseline(inference, constraints, context, world_state))
        candidates.append(self._build_cautious(inference, constraints, context, world_state))
        candidates.append(self._build_fast_track(inference, constraints, context, world_state))
        candidates.append(self._build_resource_saving(inference, constraints, context, world_state))
        candidates.append(self._build_exploratory(inference, constraints, context, world_state))

        if inference.objective_type in {"analysis", "planning"}:
            candidates.append(self._build_hypothesis_driven(inference, constraints, context, world_state))
        if inference.objective_type in {"delivery", "execution"}:
            candidates.append(self._build_incremental_delivery(inference, constraints, context, world_state))
        if inference.objective_type == "creative":
            candidates.append(self._build_two_pass_creative(inference, constraints, context, world_state))

        for row in candidates:
            self._adjust_for_constraints(row, constraints)
            self._derive_tradeoffs(row)
            row.feasibility = self._estimate_strategy_feasibility(row, constraints)

        ranked = sorted(candidates, key=lambda item: (item.feasibility, item.robustness_score, item.quality_score), reverse=True)
        limited = ranked[: max(2, int(max_strategies))]

        return StrategyGenerationResult(
            objective=inference.inferred_goal,
            recommended_style_hint=constraints.recommended_mode,
            strategies=limited,
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "objective_type": inference.objective_type,
                "count": len(limited),
            },
        )

    def summarize(self, result: StrategyGenerationResult) -> Dict[str, Any]:
        """Summary payload for memory persistence."""
        return {
            "objective": result.objective,
            "style_hint": result.recommended_style_hint,
            "strategies": [
                {
                    "id": row.strategy_id,
                    "name": row.name,
                    "style": row.style,
                    "feasibility": row.feasibility,
                    "risk": row.risk_score,
                    "speed": row.speed_score,
                }
                for row in result.strategies
            ],
        }

    def _build_baseline(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="baseline_balanced",
            name="Balanced Baseline",
            style="balanced",
            objective=inference.inferred_goal,
            summary="Standard execution with balanced emphasis on quality, speed, and robustness.",
            confidence=0.67,
            speed_score=0.62,
            quality_score=0.68,
            robustness_score=0.66,
            resource_score=0.64,
            risk_score=max(0.15, constraints.risk_score * 0.95),
            feasibility=0.0,
            assumptions=["No extreme constraints appear beyond normal operational range."],
            steps=[
                self._step("s1", "Align Objective", "Refine objective statement and acceptance criteria.", 0.18, 0.18, 0.63),
                self._step("s2", "Prepare Inputs", "Collect and validate required context and dependencies.", 0.24, 0.2, 0.68, ["s1"]),
                self._step("s3", "Execute Core Path", "Run primary workflow for objective realization.", 0.42, 0.28, 0.74, ["s2"]),
                self._step("s4", "Verify Outcome", "Check output quality and safety constraints.", 0.2, 0.19, 0.69, ["s3"]),
            ],
        )

    def _build_cautious(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="cautious_guardrail",
            name="Guardrail-First",
            style="cautious",
            objective=inference.inferred_goal,
            summary="Conservative strategy with explicit checkpoints and reduced blast radius.",
            confidence=0.72,
            speed_score=0.4,
            quality_score=0.73,
            robustness_score=0.84,
            resource_score=0.56,
            risk_score=max(0.08, constraints.risk_score * 0.68),
            feasibility=0.0,
            assumptions=["Safety and correctness are higher priority than speed."],
            steps=[
                self._step("s1", "Safety Precheck", "Confirm policy, permissions, and risk boundaries.", 0.19, 0.08, 0.68),
                self._step("s2", "Scenario Preview", "Simulate small-scope result before full execution.", 0.24, 0.12, 0.71, ["s1"]),
                self._step("s3", "Controlled Execution", "Execute in bounded phases with checkpoints.", 0.48, 0.17, 0.73, ["s2"]),
                self._step("s4", "Post-Execution Audit", "Verify outcome and persist audit memory.", 0.22, 0.11, 0.7, ["s3"]),
            ],
        )

    def _build_fast_track(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="fast_track",
            name="Fast Track",
            style="aggressive",
            objective=inference.inferred_goal,
            summary="Speed-optimized path prioritizing rapid first-pass delivery.",
            confidence=0.61,
            speed_score=0.87,
            quality_score=0.56,
            robustness_score=0.49,
            resource_score=0.58,
            risk_score=min(0.98, constraints.risk_score * 1.24),
            feasibility=0.0,
            assumptions=["A fast draft is acceptable and refinement can follow later."],
            steps=[
                self._step("s1", "Narrow Scope", "Constrain objective to highest-value slice.", 0.11, 0.22, 0.6),
                self._step("s2", "Direct Execution", "Execute shortest viable path immediately.", 0.38, 0.38, 0.7, ["s1"]),
                self._step("s3", "Quick Validation", "Run minimal checks before delivery.", 0.12, 0.24, 0.59, ["s2"]),
            ],
        )

    def _build_resource_saving(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="resource_saving",
            name="Resource Saver",
            style="resource_saving",
            objective=inference.inferred_goal,
            summary="Minimizes compute, memory, and concurrency footprint under pressure.",
            confidence=0.66,
            speed_score=0.52,
            quality_score=0.61,
            robustness_score=0.62,
            resource_score=0.87,
            risk_score=max(0.12, constraints.risk_score * 0.9),
            feasibility=0.0,
            assumptions=["System pressure is significant and requires lean execution."],
            steps=[
                self._step("s1", "Prioritize Essentials", "Drop optional branches and secondary outputs.", 0.09, 0.2, 0.61),
                self._step("s2", "Sequential Lightweight Run", "Execute minimal sequence without heavy parallelism.", 0.28, 0.22, 0.66, ["s1"]),
                self._step("s3", "Compact Result", "Return compressed but actionable output.", 0.08, 0.19, 0.58, ["s2"]),
            ],
        )

    def _build_exploratory(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="exploratory_probe",
            name="Exploratory Probe",
            style="exploratory",
            objective=inference.inferred_goal,
            summary="Runs an evidence-gathering probe first when objective certainty is low.",
            confidence=0.58,
            speed_score=0.46,
            quality_score=0.66,
            robustness_score=0.64,
            resource_score=0.6,
            risk_score=max(0.16, constraints.risk_score * 0.92),
            feasibility=0.0,
            assumptions=["Additional evidence can improve downstream plan quality."],
            steps=[
                self._step("s1", "Probe Context", "Gather high-signal facts to reduce ambiguity.", 0.2, 0.15, 0.69),
                self._step("s2", "Refine Objective", "Update objective framing from probe findings.", 0.11, 0.12, 0.65, ["s1"]),
                self._step("s3", "Execute Refined Path", "Run selected execution path from refined objective.", 0.35, 0.26, 0.7, ["s2"]),
            ],
        )

    def _build_hypothesis_driven(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="hypothesis_driven",
            name="Hypothesis Driven",
            style="analysis_first",
            objective=inference.inferred_goal,
            summary="Constructs explicit hypotheses, tests them, then commits to a final path.",
            confidence=0.7,
            speed_score=0.45,
            quality_score=0.76,
            robustness_score=0.74,
            resource_score=0.54,
            risk_score=max(0.11, constraints.risk_score * 0.8),
            feasibility=0.0,
            assumptions=["The objective benefits from explicit comparative analysis."],
            steps=[
                self._step("s1", "Define Hypotheses", "Build candidate explanations or options.", 0.2, 0.15, 0.73),
                self._step("s2", "Test Hypotheses", "Gather evidence and score options.", 0.3, 0.2, 0.75, ["s1"]),
                self._step("s3", "Commit Path", "Select best-supported path and execute.", 0.3, 0.21, 0.74, ["s2"]),
            ],
        )

    def _build_incremental_delivery(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="incremental_delivery",
            name="Incremental Delivery",
            style="incremental",
            objective=inference.inferred_goal,
            summary="Delivers value in small validated increments with fast feedback loops.",
            confidence=0.73,
            speed_score=0.67,
            quality_score=0.72,
            robustness_score=0.76,
            resource_score=0.63,
            risk_score=max(0.1, constraints.risk_score * 0.78),
            feasibility=0.0,
            assumptions=["Frequent checkpoints reduce rework and improve reliability."],
            steps=[
                self._step("s1", "Define Increment 1", "Select smallest high-value deliverable.", 0.1, 0.14, 0.69),
                self._step("s2", "Implement Increment 1", "Execute and verify first increment.", 0.26, 0.21, 0.74, ["s1"]),
                self._step("s3", "Expand Increment", "Add next slice based on validated state.", 0.28, 0.23, 0.73, ["s2"]),
                self._step("s4", "Consolidate", "Merge increments into coherent final outcome.", 0.17, 0.18, 0.71, ["s3"]),
            ],
        )

    def _build_two_pass_creative(self, inference: GoalInferenceResult, constraints: ConstraintAnalysisResult, context: Any, world_state: Any | None) -> StrategyOption:
        return StrategyOption(
            strategy_id="creative_two_pass",
            name="Creative Two-Pass",
            style="draft_refine",
            objective=inference.inferred_goal,
            summary="Creates a rapid draft first, then performs targeted refinement pass.",
            confidence=0.71,
            speed_score=0.65,
            quality_score=0.79,
            robustness_score=0.67,
            resource_score=0.58,
            risk_score=max(0.12, constraints.risk_score * 0.84),
            feasibility=0.0,
            assumptions=["Creative quality improves with explicit refinement phase."],
            steps=[
                self._step("s1", "Draft", "Generate broad creative draft quickly.", 0.24, 0.24, 0.7),
                self._step("s2", "Critique", "Identify weak sections and style issues.", 0.14, 0.16, 0.71, ["s1"]),
                self._step("s3", "Refine", "Apply focused improvements and consistency pass.", 0.27, 0.18, 0.78, ["s2"]),
            ],
        )

    def _adjust_for_constraints(self, strategy: StrategyOption, constraints: ConstraintAnalysisResult) -> None:
        if constraints.recommended_mode == "cautious" and strategy.style in {"aggressive", "exploratory"}:
            strategy.confidence = round(max(0.1, strategy.confidence - 0.12), 4)
            strategy.risk_score = round(min(0.99, strategy.risk_score + 0.09), 4)
        if constraints.recommended_mode == "aggressive" and strategy.style in {"aggressive", "incremental"}:
            strategy.confidence = round(min(0.99, strategy.confidence + 0.07), 4)
            strategy.speed_score = round(min(0.99, strategy.speed_score + 0.06), 4)
        if constraints.recommended_mode == "resource_saving" and strategy.style == "resource_saving":
            strategy.confidence = round(min(0.99, strategy.confidence + 0.08), 4)
            strategy.resource_score = round(min(0.99, strategy.resource_score + 0.07), 4)

        if constraints.time_pressure > 0.8:
            strategy.speed_score = round(min(0.99, strategy.speed_score + 0.05), 4)
        if constraints.risk_score > 0.75:
            strategy.robustness_score = round(min(0.99, strategy.robustness_score + 0.04), 4)
        if constraints.resource_pressure > 0.75:
            strategy.resource_score = round(min(0.99, strategy.resource_score + 0.06), 4)

    def _derive_tradeoffs(self, strategy: StrategyOption) -> None:
        tradeoffs: List[str] = []
        if strategy.speed_score > strategy.quality_score + 0.18:
            tradeoffs.append("Prioritizes speed over deep quality checks.")
        if strategy.robustness_score > strategy.speed_score + 0.2:
            tradeoffs.append("Adds checkpoint overhead for reliability.")
        if strategy.resource_score > 0.8 and strategy.quality_score < 0.7:
            tradeoffs.append("Resource efficiency may constrain output richness.")
        if strategy.risk_score > 0.7:
            tradeoffs.append("Risk profile is elevated and may require approvals.")
        strategy.tradeoffs = tradeoffs[:4]

    def _estimate_strategy_feasibility(self, strategy: StrategyOption, constraints: ConstraintAnalysisResult) -> float:
        score = (
            strategy.confidence * 0.18
            + strategy.quality_score * 0.2
            + strategy.robustness_score * 0.2
            + strategy.speed_score * 0.14
            + strategy.resource_score * 0.12
            + (1.0 - strategy.risk_score) * 0.16
        )
        score -= max(0.0, constraints.risk_score - strategy.robustness_score) * 0.08
        score -= max(0.0, constraints.resource_pressure - strategy.resource_score) * 0.07
        if constraints.hard_constraints:
            score -= 0.05 + min(0.15, len(constraints.hard_constraints) * 0.03)
        return round(min(0.99, max(0.01, score)), 4)

    @staticmethod
    def _step(
        sid: str,
        title: str,
        intent: str,
        cost: float,
        risk: float,
        value: float,
        depends_on: List[str] | None = None,
    ) -> StrategyStep:
        return StrategyStep(
            id=sid,
            title=title,
            intent=intent,
            estimated_cost=round(cost, 4),
            estimated_risk=round(risk, 4),
            expected_value=round(value, 4),
            depends_on=list(depends_on or []),
        )

