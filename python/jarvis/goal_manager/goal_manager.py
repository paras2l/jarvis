"""Central goal manager for Jarvis long-running objective orchestration.

Coordinates goal lifecycle, decomposition, scheduling, and progress updates.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from jarvis.core.contracts import ExecutionPlan
from jarvis.core.planner.planner_engine import PlannerEngine
from jarvis.goal_manager.goal_decomposer import GoalDecomposer, GoalDecompositionResult, MilestoneRecord
from jarvis.goal_manager.goal_registry import GoalRecord, GoalRegistry
from jarvis.goal_manager.goal_scheduler import GoalScheduler, ScheduledGoal
from jarvis.goal_manager.milestone_tracker import MilestoneProgress, MilestoneTracker
from jarvis.goal_manager.progress_evaluator import ProgressEvaluation, ProgressEvaluator
from jarvis.memory.memory_system import MemorySystem
from jarvis.reasoning_engine.reasoning_core import ReasoningReport
from jarvis.system_bus.bus_core import SystemBus
from jarvis.world_model.decision_selector import DecisionSelector


@dataclass(slots=True)
class ScheduledMilestonePlan:
    """One scheduled milestone plus plan ready for task queueing."""

    goal: GoalRecord
    milestone: MilestoneRecord
    selected_plan: ExecutionPlan
    schedule: ScheduledGoal
    evaluation: ProgressEvaluation | None
    metadata: Dict[str, Any] = field(default_factory=dict)


class GoalManager:
    """Manages long-running goals across runtime cycles."""

    def __init__(self, memory: MemorySystem, planner: PlannerEngine, world_model: DecisionSelector, system_bus: SystemBus | None = None) -> None:
        self._memory = memory
        self._planner = planner
        self._world_model = world_model
        self._bus = system_bus
        self._registry = GoalRegistry(memory)
        self._decomposer = GoalDecomposer()
        self._tracker = MilestoneTracker(memory)
        self._evaluator = ProgressEvaluator()
        self._scheduler = GoalScheduler()

    def create_goal_from_reasoning(
        self,
        reasoning: ReasoningReport,
        *,
        source_text: str,
        priority: int = 60,
        metadata: Dict[str, Any] | None = None,
    ) -> GoalRecord:
        """Create goal from reasoning output and seed milestones."""
        goal = self._registry.create_goal(
            title=self._title_from_reasoning(reasoning, source_text),
            objective=reasoning.objective,
            priority=priority,
            horizon=reasoning.inferred.horizon,
            objective_type=reasoning.inferred.objective_type,
            confidence=reasoning.confidence,
            reasoning_id=reasoning.reasoning_id,
            tags=["long_running", reasoning.decision.selected_style, reasoning.inferred.objective_type],
            metadata={
                "source_text": source_text,
                "planning_goal": reasoning.planning_goal,
                "selected_strategy": reasoning.decision.selected_strategy_id,
                "selected_style": reasoning.decision.selected_style,
                **dict(metadata or {}),
            },
        )

        decomposition = self._decomposer.decompose(goal, reasoning)
        milestone_ids = self._tracker.register_decomposition(decomposition)
        self._registry.attach_milestones(goal.goal_id, milestone_ids)
        self._registry.activate(goal.goal_id)

        self._persist_goal_creation(goal, decomposition)
        self._publish("goal.created", {"goal_id": goal.goal_id, "title": goal.title, "objective": goal.objective, "status": goal.status})
        return goal

    def pause_goal(self, goal_id: str, reason: str = "") -> bool:
        ok = self._registry.pause(goal_id, reason)
        if ok:
            self._tracker.pause_goal(goal_id, reason)
        return ok

    def resume_goal(self, goal_id: str) -> bool:
        ok = self._registry.resume(goal_id)
        if ok:
            self._tracker.resume_goal(goal_id)
        return ok

    def cancel_goal(self, goal_id: str, reason: str = "") -> bool:
        return self._registry.cancel(goal_id, reason)

    def complete_goal(self, goal_id: str) -> bool:
        return self._registry.complete(goal_id)

    def list_active_goals(self) -> List[GoalRecord]:
        return self._registry.by_status(["pending", "active"])

    def schedule_plans(self, context: Any, max_goals: int = 2) -> List[ScheduledMilestonePlan]:
        """Choose runnable goals and build milestone-level plans for execution."""
        candidates = self.list_active_goals()
        if not candidates:
            return []

        evaluations = self._evaluate_candidates(candidates, context)
        scheduled = self._scheduler.schedule(
            candidates,
            evaluations,
            context=context,
            world_state=self._world_model._world_state.current(),  # noqa: SLF001
            max_goals=max_goals,
        )

        out: List[ScheduledMilestonePlan] = []
        for slot in scheduled:
            goal = self._registry.get(slot.goal_id)
            if goal is None:
                continue

            milestone = self._tracker.next_runnable(goal.goal_id)
            if milestone is None:
                continue

            self._tracker.mark_started(milestone.milestone_id)
            self._registry.activate(goal.goal_id)

            plan = self._planner.build_plan(goal=milestone.objective, context=context)
            selection = self._world_model.select_best_plan(context=context, planner_plan=plan, max_scenarios=4)

            out.append(
                ScheduledMilestonePlan(
                    goal=goal,
                    milestone=milestone,
                    selected_plan=selection.selected_plan,
                    schedule=slot,
                    evaluation=evaluations.get(goal.goal_id),
                    metadata={
                        "world_strategy": selection.selected_strategy,
                        "world_score": selection.selected_score,
                        "reason": slot.reason,
                    },
                )
            )

        self._persist_schedule_snapshot(scheduled, out)
        self._publish("goal.scheduled", {"scheduled_count": len(scheduled), "planned_count": len(out)})
        return out

    def update_from_task_result(
        self,
        goal_id: str,
        task_id: str,
        *,
        success: bool,
        summary: str,
        milestone_id: str | None = None,
    ) -> None:
        """Update milestone and goal-level state from executed task result."""
        target_milestone = milestone_id or self._tracker.resolve_milestone_for_task(task_id)
        if target_milestone is None:
            return

        if milestone_id is not None:
            self._tracker.register_task(milestone_id, task_id)

        resolved = self._tracker.record_task_result(task_id, success, summary)
        if resolved is None:
            return

        goal = self._registry.get(goal_id)
        if goal is None:
            return

        rows = self._tracker.list_for_goal(goal_id)
        progress = self._tracker.progress_for_goal(goal_id)
        evaluation = self._evaluator.evaluate(
            goal,
            progress,
            world_state=self._world_model._world_state.current(),  # noqa: SLF001
        )

        if all(row.status == "completed" for row in rows) and rows:
            self._registry.complete(goal_id)
        elif any(row.status == "failed" for row in rows) and evaluation.failure_ratio > 0.4:
            self._registry.fail(goal_id, "Milestone failure ratio exceeded threshold.")
        else:
            self._registry.activate(goal_id)

        self._registry.annotate(
            goal_id,
            {
                "last_task_id": task_id,
                "last_task_success": success,
                "last_task_summary": summary[:500],
                "last_evaluation": self._evaluator.summarize(evaluation),
            },
        )
        self._persist_progress(goal_id, evaluation)
        self._publish("goal.task_result", {"goal_id": goal_id, "task_id": task_id, "success": success, "summary": summary[:240]})

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"goal.create", "goal.created", "goal.request"}:
            reasoning = payload.get("reasoning")
            if reasoning is None:
                return {"status": "error", "reason": "missing_reasoning"}
            goal = self.create_goal_from_reasoning(
                reasoning,
                source_text=str(payload.get("source_text", reasoning.objective)),
                priority=int(payload.get("priority", 60)),
                metadata=dict(payload.get("metadata", {})),
            )
            return {"goal_id": goal.goal_id, "title": goal.title, "status": goal.status}

        if topic in {"goal.schedule", "goal.plans"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            plans = self.schedule_plans(context=context, max_goals=int(payload.get("max_goals", 2)))
            return {"scheduled": len(plans)}

        if topic in {"goal.task_result", "goal.update"}:
            self.update_from_task_result(
                goal_id=str(payload.get("goal_id", "")),
                task_id=str(payload.get("task_id", "")),
                success=bool(payload.get("success", False)),
                summary=str(payload.get("summary", "")),
                milestone_id=payload.get("milestone_id"),
            )
            return {"status": "ok"}

        return {"status": "ignored", "topic": topic}

    def bind_task_to_milestone(self, milestone_id: str, task_id: str) -> None:
        self._tracker.register_task(milestone_id, task_id)

    def _evaluate_candidates(self, goals: List[GoalRecord], context: Any) -> Dict[str, ProgressEvaluation]:
        out: Dict[str, ProgressEvaluation] = {}
        world_state = self._world_model._world_state.current()  # noqa: SLF001
        for row in goals:
            progress = self._tracker.progress_for_goal(row.goal_id)
            out[row.goal_id] = self._evaluator.evaluate(row, progress, world_state=world_state)
        return out

    @staticmethod
    def _title_from_reasoning(reasoning: ReasoningReport, source_text: str) -> str:
        label = reasoning.inferred.objective_type.replace("_", " ").title()
        compact = source_text.strip()[:58]
        return f"{label}: {compact}" if compact else f"{label} Objective"

    def _persist_goal_creation(self, goal: GoalRecord, decomposition: GoalDecompositionResult) -> None:
        payload = {
            "goal_id": goal.goal_id,
            "title": goal.title,
            "objective": goal.objective,
            "status": goal.status,
            "milestone_count": len(decomposition.milestones),
            "decomposition": self._decomposer.summarize(decomposition),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key=f"goal_manager:create:{goal.goal_id}",
            value=payload,
            tags=["goal_manager", "create"],
        )
        self._memory.remember_long_term(
            key=f"goal_manager:create:{goal.goal_id}",
            value=payload,
            source="goal_manager",
            importance=0.8,
            tags=["goal_manager", "create"],
        )

    def _persist_schedule_snapshot(self, scheduled: List[ScheduledGoal], plans: List[ScheduledMilestonePlan]) -> None:
        payload = {
            "scheduled": self._scheduler.summarize(scheduled),
            "planned": [
                {
                    "goal_id": row.goal.goal_id,
                    "milestone_id": row.milestone.milestone_id,
                    "milestone_title": row.milestone.title,
                    "plan_steps": len(row.selected_plan.steps),
                    "reason": row.schedule.reason,
                    "metadata": row.metadata,
                }
                for row in plans
            ],
            "at": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key="goal_manager:last_schedule",
            value=payload,
            tags=["goal_manager", "schedule"],
        )

    def _persist_progress(self, goal_id: str, evaluation: ProgressEvaluation) -> None:
        payload = {
            "goal_id": goal_id,
            "evaluation": self._evaluator.summarize(evaluation),
            "at": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key=f"goal_manager:progress:{goal_id}",
            value=payload,
            tags=["goal_manager", "progress"],
        )
        self._memory.remember_long_term(
            key=f"goal_manager:progress:{goal_id}",
            value=payload,
            source="goal_manager",
            importance=0.72,
            tags=["goal_manager", "progress"],
        )

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="goal_manager",
            payload=payload,
            topic=topic,
            tags=["goal_manager", "system_bus"],
        )
