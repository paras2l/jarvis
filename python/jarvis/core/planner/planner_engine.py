"""Planner Engine implementation.

Converts high-level goals into executable task plans via:
goal parsing -> strategy selection -> task decomposition.
"""

from __future__ import annotations

from typing import Any, Dict, List

from jarvis.core.contracts import ContextSnapshot, ExecutionPlan, Planner
from jarvis.core.planner.plan_executor import PlanExecutor
from jarvis.system_bus.bus_core import SystemBus


class PlannerEngine(Planner):
    """Contract-compatible planner facade built on the new pipeline."""

    def __init__(self, executor: PlanExecutor | None = None, system_bus: SystemBus | None = None) -> None:
        self._executor = executor or PlanExecutor()
        self._bus = system_bus

    def build_plan(self, goal: str, context: ContextSnapshot) -> ExecutionPlan:
        plan = self._executor.build_execution_plan(goal=goal, context=context)
        self._publish("planning.generated", {"goal": goal, "step_count": len(plan.steps)})
        return plan

    def preview_outputs(self, goal: str, context: ContextSnapshot) -> List[str]:
        """Return deterministic task-output previews for UI and debugging."""
        return self._executor.preview_task_outputs(goal=goal, context=context)

    def diagnostics(self, goal: str, context: ContextSnapshot) -> Dict[str, Any]:
        """Return detailed planner diagnostics snapshot."""
        return self._executor.build_diagnostics(goal=goal, context=context)

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"planning.build", "planning.request", "planner.request"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            plan = self.build_plan(str(payload.get("goal", "")), context)
            return {"goal": plan.goal, "step_count": len(plan.steps), "steps": [step.__dict__ for step in plan.steps]}

        if topic in {"planning.preview", "planner.preview"}:
            context = payload.get("context")
            if context is None:
                return {"status": "error", "reason": "missing_context"}
            return {"goal": str(payload.get("goal", "")), "previews": self.preview_outputs(str(payload.get("goal", "")), context)}

        return {"status": "ignored", "topic": topic}

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="planning_system",
            payload=payload,
            topic=topic,
            tags=["planning", "system_bus"],
        )
