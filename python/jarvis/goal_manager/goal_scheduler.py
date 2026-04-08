"""Goal scheduler for Jarvis long-running objectives.

Selects which goals should run each cycle based on priority, progress state,
reasoning confidence, and resource conditions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from jarvis.goal_manager.goal_registry import GoalRecord
from jarvis.goal_manager.progress_evaluator import ProgressEvaluation


@dataclass(slots=True)
class ScheduledGoal:
    """One scheduled goal candidate with score explanation."""

    goal_id: str
    score: float
    reason: str
    priority: int
    metadata: Dict[str, Any] = field(default_factory=dict)


class GoalScheduler:
    """Priority and resource-aware goal scheduler."""

    def schedule(
        self,
        goals: List[GoalRecord],
        evaluations: Dict[str, ProgressEvaluation],
        *,
        context: Any,
        world_state: Any | None = None,
        max_goals: int = 2,
    ) -> List[ScheduledGoal]:
        """Return top goals to execute in current cycle."""
        candidates: List[ScheduledGoal] = []

        for goal in goals:
            if goal.status not in {"pending", "active"}:
                continue
            evaluation = evaluations.get(goal.goal_id)
            score, reason = self._score(goal, evaluation, context, world_state)
            candidates.append(
                ScheduledGoal(
                    goal_id=goal.goal_id,
                    score=score,
                    reason=reason,
                    priority=goal.priority,
                    metadata={
                        "goal_status": goal.status,
                        "objective_type": goal.objective_type,
                        "reasoning_id": goal.reasoning_id,
                    },
                )
            )

        ranked = sorted(candidates, key=lambda row: (row.score, row.priority), reverse=True)
        return ranked[: max(1, int(max_goals))]

    def summarize(self, rows: List[ScheduledGoal]) -> Dict[str, Any]:
        """Scheduler summary for observability."""
        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "scheduled_count": len(rows),
            "scheduled": [
                {
                    "goal_id": row.goal_id,
                    "score": row.score,
                    "priority": row.priority,
                    "reason": row.reason,
                }
                for row in rows
            ],
        }

    def _score(
        self,
        goal: GoalRecord,
        evaluation: ProgressEvaluation | None,
        context: Any,
        world_state: Any | None,
    ) -> tuple[float, str]:
        score = 0.25
        reason_bits: List[str] = []

        # Priority normalization: 1..100
        score += goal.priority / 180.0
        reason_bits.append(f"priority={goal.priority}")

        # Reasoning confidence from upstream objective quality.
        score += goal.confidence * 0.2
        reason_bits.append(f"goal_confidence={goal.confidence}")

        if evaluation is not None:
            score += (1.0 - evaluation.failure_ratio) * 0.12
            score += evaluation.velocity * 0.1
            if evaluation.health == "on_track":
                score += 0.08
            if evaluation.health == "off_track":
                score -= 0.09
                reason_bits.append("off_track_penalty")
            if evaluation.needs_adjustment:
                score -= 0.02
                reason_bits.append("adjustment_needed")

        # Context-aware preferences.
        activity = str(getattr(context, "user_activity", "unknown")).lower()
        app = str(getattr(context, "current_application", "unknown")).lower()
        if goal.objective_type in {"analysis", "planning"} and activity in {"research", "analysis"}:
            score += 0.05
            reason_bits.append("activity_alignment")
        if goal.objective_type == "delivery" and activity in {"development", "coding"}:
            score += 0.06
            reason_bits.append("development_alignment")
        if "trading" in app and "market" in goal.objective.lower():
            score += 0.06
            reason_bits.append("foreground_market_alignment")

        # Resource gates.
        system_health = str(getattr(world_state, "system_health", "healthy")).lower() if world_state is not None else "healthy"
        if system_health == "critical":
            score -= 0.2
            reason_bits.append("critical_system_penalty")
        if system_health == "degraded":
            score -= 0.08
            reason_bits.append("degraded_system_penalty")

        if goal.status == "active":
            score += 0.03
            reason_bits.append("continuity_bonus")

        return (round(min(0.99, max(0.01, score)), 5), "; ".join(reason_bits[:6]))
