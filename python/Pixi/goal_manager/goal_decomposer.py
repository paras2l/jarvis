"""Goal decomposer for Pixi goal management.

Converts broad objectives into milestones that can be planned and executed over
multiple cycles or days.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List
import uuid

from Pixi.goal_manager.goal_registry import GoalRecord
from Pixi.reasoning_engine.reasoning_core import ReasoningReport

MilestoneStatus = str


@dataclass(slots=True)
class MilestoneRecord:
    """Milestone generated from a long-running goal."""

    milestone_id: str
    goal_id: str
    title: str
    objective: str
    order: int
    priority: int
    status: MilestoneStatus
    depends_on: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GoalDecompositionResult:
    """Milestone bundle returned to goal manager."""

    goal_id: str
    milestones: List[MilestoneRecord] = field(default_factory=list)
    decomposition_style: str = "balanced"
    estimated_cycles: int = 1
    metadata: Dict[str, Any] = field(default_factory=dict)


class GoalDecomposer:
    """Produces milestone maps for long-horizon goals."""

    def decompose(self, goal: GoalRecord, reasoning: ReasoningReport | None = None) -> GoalDecompositionResult:
        objective = (goal.objective or "").lower()
        style = reasoning.decision.selected_style if reasoning is not None else "balanced"

        if self._looks_like_trading_strategy(objective):
            milestones = self._trading_strategy_milestones(goal, style)
        elif self._looks_like_research(objective):
            milestones = self._research_milestones(goal, style)
        elif self._looks_like_software_delivery(objective):
            milestones = self._software_milestones(goal, style)
        elif self._looks_like_creative_goal(objective):
            milestones = self._creative_milestones(goal, style)
        else:
            milestones = self._generic_milestones(goal, style)

        self._apply_reasoning_adjustments(milestones, reasoning)

        return GoalDecompositionResult(
            goal_id=goal.goal_id,
            milestones=milestones,
            decomposition_style=style,
            estimated_cycles=max(1, len(milestones) * 2),
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "objective_type": goal.objective_type,
                "style": style,
            },
        )

    def summarize(self, result: GoalDecompositionResult) -> Dict[str, Any]:
        """Compact decomposition summary."""
        return {
            "goal_id": result.goal_id,
            "style": result.decomposition_style,
            "estimated_cycles": result.estimated_cycles,
            "milestones": [
                {
                    "id": row.milestone_id,
                    "title": row.title,
                    "order": row.order,
                    "priority": row.priority,
                }
                for row in result.milestones
            ],
        }

    def _trading_strategy_milestones(self, goal: GoalRecord, style: str) -> List[MilestoneRecord]:
        rows = [
            self._mk(goal, "Research Strategy Space", "Research proven trading strategy families and constraints.", 1, 88),
            self._mk(goal, "Simulate Candidate Strategies", "Build simulations and compare candidate strategy behavior.", 2, 84),
            self._mk(goal, "Backtest Selected Strategy", "Backtest selected candidate strategy across multiple periods.", 3, 82),
            self._mk(goal, "Optimize Parameters", "Tune parameters with risk-aware optimization constraints.", 4, 78),
            self._mk(goal, "Finalize Execution Playbook", "Produce final strategy playbook with risk controls.", 5, 76),
        ]
        rows[1].depends_on = [rows[0].milestone_id]
        rows[2].depends_on = [rows[1].milestone_id]
        rows[3].depends_on = [rows[2].milestone_id]
        rows[4].depends_on = [rows[3].milestone_id]
        for row in rows:
            row.tags.extend(["trading", "long_running", style])
        return rows

    def _research_milestones(self, goal: GoalRecord, style: str) -> List[MilestoneRecord]:
        rows = [
            self._mk(goal, "Define Research Scope", "Define scope, assumptions, and success criteria.", 1, 80),
            self._mk(goal, "Gather Sources", "Collect high-quality sources and evidence.", 2, 77),
            self._mk(goal, "Analyze Findings", "Analyze findings and identify key patterns.", 3, 76),
            self._mk(goal, "Publish Research Brief", "Create practical summary and next actions.", 4, 74),
        ]
        rows[1].depends_on = [rows[0].milestone_id]
        rows[2].depends_on = [rows[1].milestone_id]
        rows[3].depends_on = [rows[2].milestone_id]
        for row in rows:
            row.tags.extend(["research", style])
        return rows

    def _software_milestones(self, goal: GoalRecord, style: str) -> List[MilestoneRecord]:
        rows = [
            self._mk(goal, "Clarify Requirements", "Extract implementation requirements and constraints.", 1, 84),
            self._mk(goal, "Implement Core Changes", "Build core system changes for target objective.", 2, 82),
            self._mk(goal, "Validate and Test", "Run validations and address failures.", 3, 80),
            self._mk(goal, "Ship and Document", "Finalize and document delivery status.", 4, 76),
        ]
        rows[1].depends_on = [rows[0].milestone_id]
        rows[2].depends_on = [rows[1].milestone_id]
        rows[3].depends_on = [rows[2].milestone_id]
        for row in rows:
            row.tags.extend(["software", "delivery", style])
        return rows

    def _creative_milestones(self, goal: GoalRecord, style: str) -> List[MilestoneRecord]:
        rows = [
            self._mk(goal, "Research References", "Collect references, tone, and visual direction.", 1, 78),
            self._mk(goal, "Create Draft Output", "Produce initial creative draft.", 2, 76),
            self._mk(goal, "Refine Output", "Refine weak sections and consistency.", 3, 74),
            self._mk(goal, "Finalize Deliverable", "Prepare final polished deliverable.", 4, 72),
        ]
        rows[1].depends_on = [rows[0].milestone_id]
        rows[2].depends_on = [rows[1].milestone_id]
        rows[3].depends_on = [rows[2].milestone_id]
        for row in rows:
            row.tags.extend(["creative", style])
        return rows

    def _generic_milestones(self, goal: GoalRecord, style: str) -> List[MilestoneRecord]:
        rows = [
            self._mk(goal, "Objective Framing", "Frame objective and acceptance criteria.", 1, 74),
            self._mk(goal, "Execution Phase", "Execute primary objective workflow.", 2, 72),
            self._mk(goal, "Quality and Completion", "Validate outcomes and complete objective.", 3, 70),
        ]
        rows[1].depends_on = [rows[0].milestone_id]
        rows[2].depends_on = [rows[1].milestone_id]
        for row in rows:
            row.tags.extend(["generic", style])
        return rows

    def _apply_reasoning_adjustments(self, milestones: List[MilestoneRecord], reasoning: ReasoningReport | None) -> None:
        if reasoning is None:
            return

        style = reasoning.decision.selected_style
        risk = reasoning.constraints.risk_score
        time_pressure = reasoning.constraints.time_pressure

        if style == "cautious" or risk > 0.72:
            guard = MilestoneRecord(
                milestone_id=f"mil-{uuid.uuid4().hex[:10]}",
                goal_id=milestones[0].goal_id if milestones else "",
                title="Risk Review Checkpoint",
                objective="Perform explicit risk review and adjust execution constraints.",
                order=2,
                priority=85,
                status="pending",
                tags=["safety", "risk", "cautious"],
            )
            if milestones:
                first = milestones[0]
                guard.depends_on = [first.milestone_id]
                for row in milestones[1:]:
                    row.depends_on = list(dict.fromkeys([guard.milestone_id] + row.depends_on))
            milestones.insert(1 if len(milestones) > 1 else len(milestones), guard)
            self._reorder(milestones)

        if style == "aggressive" and time_pressure > 0.75 and len(milestones) >= 3:
            milestones[1].priority = min(100, milestones[1].priority + 8)
            milestones[2].priority = min(100, milestones[2].priority + 4)

        for row in milestones:
            row.metadata["reasoning_style"] = style
            row.metadata["reasoning_confidence"] = reasoning.confidence
            row.metadata["reasoning_strategy"] = reasoning.decision.selected_strategy_id

    @staticmethod
    def _reorder(milestones: List[MilestoneRecord]) -> None:
        for idx, row in enumerate(milestones, start=1):
            row.order = idx

    @staticmethod
    def _mk(goal: GoalRecord, title: str, objective: str, order: int, priority: int) -> MilestoneRecord:
        return MilestoneRecord(
            milestone_id=f"mil-{uuid.uuid4().hex[:10]}",
            goal_id=goal.goal_id,
            title=title,
            objective=objective,
            order=order,
            priority=max(1, min(100, int(priority))),
            status="pending",
            tags=[goal.objective_type, goal.horizon],
        )

    @staticmethod
    def _looks_like_trading_strategy(text: str) -> bool:
        return all(token in text for token in ["trading", "strategy"]) or "profitable trading" in text

    @staticmethod
    def _looks_like_research(text: str) -> bool:
        return any(token in text for token in ["research", "study", "investigate", "analyze"])

    @staticmethod
    def _looks_like_software_delivery(text: str) -> bool:
        return any(token in text for token in ["build", "code", "refactor", "debug", "deploy"])

    @staticmethod
    def _looks_like_creative_goal(text: str) -> bool:
        return any(token in text for token in ["video", "creative", "script", "content", "visual"])

