"""Progress evaluator for Pixi goal management.

Assesses whether a goal is on-track, stalled, or requires strategy adjustment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.goal_manager.goal_registry import GoalRecord
from Pixi.goal_manager.milestone_tracker import MilestoneProgress


@dataclass(slots=True)
class ProgressEvaluation:
    """Evaluation output for one goal's current progress."""

    goal_id: str
    completion_ratio: float
    velocity: float
    failure_ratio: float
    health: str
    recommendation: str
    confidence: float
    needs_adjustment: bool
    reasons: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ProgressEvaluator:
    """Computes progress quality and adaptation signals."""

    def evaluate(
        self,
        goal: GoalRecord,
        milestones: List[MilestoneProgress],
        *,
        world_state: Any | None = None,
    ) -> ProgressEvaluation:
        """Evaluate goal progression and return recommendation."""
        completion = self._completion_ratio(milestones)
        velocity = self._velocity_score(milestones)
        failure_ratio = self._failure_ratio(milestones)
        health = self._derive_health(completion, velocity, failure_ratio, world_state)
        recommendation, needs_adjustment = self._recommend(health, goal, failure_ratio, world_state)
        confidence = self._confidence(goal, completion, velocity, failure_ratio)
        reasons = self._reasons(goal, completion, velocity, failure_ratio, world_state)

        return ProgressEvaluation(
            goal_id=goal.goal_id,
            completion_ratio=completion,
            velocity=velocity,
            failure_ratio=failure_ratio,
            health=health,
            recommendation=recommendation,
            confidence=confidence,
            needs_adjustment=needs_adjustment,
            reasons=reasons,
            metadata={
                "evaluated_at": datetime.now(timezone.utc).isoformat(),
                "goal_status": goal.status,
                "objective_type": goal.objective_type,
            },
        )

    def summarize(self, evaluation: ProgressEvaluation) -> Dict[str, Any]:
        """Compact summary for memory storage and debugging."""
        return {
            "goal_id": evaluation.goal_id,
            "completion": evaluation.completion_ratio,
            "velocity": evaluation.velocity,
            "failure_ratio": evaluation.failure_ratio,
            "health": evaluation.health,
            "recommendation": evaluation.recommendation,
            "needs_adjustment": evaluation.needs_adjustment,
        }

    @staticmethod
    def _completion_ratio(milestones: List[MilestoneProgress]) -> float:
        if not milestones:
            return 0.0
        completed = sum(1 for row in milestones if row.status == "completed")
        return round(completed / len(milestones), 4)

    @staticmethod
    def _velocity_score(milestones: List[MilestoneProgress]) -> float:
        if not milestones:
            return 0.0
        active_or_done = sum(1 for row in milestones if row.status in {"in_progress", "completed"})
        done = sum(1 for row in milestones if row.status == "completed")
        raw = (done * 0.7 + active_or_done * 0.3) / len(milestones)
        return round(min(1.0, max(0.0, raw)), 4)

    @staticmethod
    def _failure_ratio(milestones: List[MilestoneProgress]) -> float:
        if not milestones:
            return 0.0
        failed = sum(1 for row in milestones if row.status == "failed")
        return round(failed / len(milestones), 4)

    def _derive_health(
        self,
        completion: float,
        velocity: float,
        failure_ratio: float,
        world_state: Any | None,
    ) -> str:
        score = completion * 0.45 + velocity * 0.3 + (1.0 - failure_ratio) * 0.25
        health = str(getattr(world_state, "system_health", "healthy")).lower() if world_state is not None else "healthy"
        if health == "critical":
            score -= 0.2
        if health == "degraded":
            score -= 0.08

        if score >= 0.75:
            return "on_track"
        if score >= 0.5:
            return "watch"
        if score >= 0.32:
            return "at_risk"
        return "off_track"

    def _recommend(
        self,
        health: str,
        goal: GoalRecord,
        failure_ratio: float,
        world_state: Any | None,
    ) -> tuple[str, bool]:
        system_health = str(getattr(world_state, "system_health", "healthy")).lower() if world_state is not None else "healthy"

        if goal.status in {"paused", "cancelled", "completed"}:
            return ("no_action", False)

        if health == "on_track":
            return ("continue_current_strategy", False)

        if health == "watch":
            if failure_ratio > 0.25:
                return ("tighten_validation_and_retry_policy", True)
            return ("continue_with_checkpoints", False)

        if health == "at_risk":
            if system_health in {"critical", "degraded"}:
                return ("switch_to_resource_saving_strategy", True)
            return ("switch_to_cautious_strategy", True)

        if health == "off_track":
            if failure_ratio > 0.5:
                return ("pause_goal_and_request_reframing", True)
            return ("replan_from_latest_state", True)

        return ("continue_current_strategy", False)

    @staticmethod
    def _confidence(goal: GoalRecord, completion: float, velocity: float, failure_ratio: float) -> float:
        conf = 0.35
        conf += goal.confidence * 0.3
        conf += completion * 0.2
        conf += velocity * 0.12
        conf += (1.0 - failure_ratio) * 0.12
        return round(min(0.99, max(0.05, conf)), 4)

    def _reasons(
        self,
        goal: GoalRecord,
        completion: float,
        velocity: float,
        failure_ratio: float,
        world_state: Any | None,
    ) -> List[str]:
        out: List[str] = []
        out.append(f"completion={completion}")
        out.append(f"velocity={velocity}")
        out.append(f"failure_ratio={failure_ratio}")
        out.append(f"goal_status={goal.status}")
        if world_state is not None:
            out.append(f"system_health={getattr(world_state, 'system_health', 'unknown')}")
        if failure_ratio > 0.3:
            out.append("Frequent milestone failures indicate strategy mismatch.")
        if completion < 0.25 and velocity < 0.3:
            out.append("Progress is too slow for long-running objective.")
        if completion > 0.7:
            out.append("Objective is close to completion; prioritize finalization.")
        return out[:7]

