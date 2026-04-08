"""Strategy selector for Pixi Planner Engine.

Chooses planning/execution strategy based on goal semantics and context.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from Pixi.core.contracts import ContextSnapshot
from Pixi.core.planner.goal_parser import ParsedGoal


@dataclass(slots=True)
class PlanStrategy:
    """Defines how the decomposer and executor should shape the plan."""

    mode: str
    rationale: str
    max_parallelism: int
    requires_approval: bool
    priority_profile: str
    notes: List[str] = field(default_factory=list)


class StrategySelector:
    """Select a strategy for turning goals into executable tasks."""

    def choose(self, parsed_goal: ParsedGoal, context: ContextSnapshot) -> PlanStrategy:
        mode = self._select_mode(parsed_goal)
        max_parallelism = self._select_parallelism(parsed_goal, context)
        requires_approval = parsed_goal.risk_level == "high"
        priority_profile = self._select_priority_profile(parsed_goal, context)
        rationale = self._build_rationale(parsed_goal, context, mode)

        notes = []
        if context.time_of_day == "night":
            notes.append("night_mode:prefer concise and high-impact tasks")
        if parsed_goal.constraints:
            notes.append("constraints_present:enforce during decomposition")
        if parsed_goal.risk_level == "high":
            notes.append("high_risk_goal:insert manual checkpoint")

        return PlanStrategy(
            mode=mode,
            rationale=rationale,
            max_parallelism=max_parallelism,
            requires_approval=requires_approval,
            priority_profile=priority_profile,
            notes=notes,
        )

    @staticmethod
    def _select_mode(parsed_goal: ParsedGoal) -> str:
        if parsed_goal.domain == "video_production":
            return "content_pipeline"
        if parsed_goal.domain == "software_development":
            return "iterative_delivery"
        if parsed_goal.domain == "research_analysis":
            return "investigation_first"
        if parsed_goal.domain == "operations_automation":
            return "workflow_automation"
        if parsed_goal.complexity_score >= 2.5:
            return "multi_stage"
        return "sequential"

    @staticmethod
    def _select_parallelism(parsed_goal: ParsedGoal, context: ContextSnapshot) -> int:
        # Conservative defaults while system is evolving.
        if parsed_goal.risk_level == "high":
            return 1
        if context.user_activity in {"development", "automation"} and parsed_goal.complexity_score >= 2.5:
            return 3
        if parsed_goal.complexity_score >= 2.0:
            return 2
        return 1

    @staticmethod
    def _select_priority_profile(parsed_goal: ParsedGoal, context: ContextSnapshot) -> str:
        if any("deadline" in item for item in parsed_goal.constraints):
            return "deadline_driven"
        if context.time_of_day == "night":
            return "energy_conserving"
        if parsed_goal.intent == "optimize":
            return "quality_first"
        return "balanced"

    @staticmethod
    def _build_rationale(parsed_goal: ParsedGoal, context: ContextSnapshot, mode: str) -> str:
        return (
            f"Selected mode={mode} based on domain={parsed_goal.domain}, "
            f"intent={parsed_goal.intent}, complexity={parsed_goal.complexity_score}, "
            f"context_activity={context.user_activity}."
        )

