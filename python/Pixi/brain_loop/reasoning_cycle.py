"""Reasoning cycle for the Pixi cognitive loop.

Triggers reasoning, simulation, and goal evaluation to produce structured
planning guidance for the task dispatcher and goal manager.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from Pixi.core.contracts import ContextSnapshot
from Pixi.goal_manager.goal_manager import GoalManager
from Pixi.memory.memory_system import MemorySystem
from Pixi.reasoning_engine.reasoning_core import ReasoningCore, ReasoningReport
from Pixi.simulation_engine.simulation_core import SimulationEngine, SimulationResult
from Pixi.world_model.world_state import WorldStateSnapshot


@dataclass(slots=True)
class ReasoningCycleResult:
    reasoning_id: str
    timestamp: str
    objective_text: str
    reasoning_report: ReasoningReport
    simulation_result: SimulationResult
    planning_payload: Dict[str, Any]
    goal_summary: Dict[str, Any]
    notes: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ReasoningCycle:
    """Runs reasoning, simulation, and goal evaluation as one step."""

    memory: MemorySystem
    reasoning_core: ReasoningCore
    simulation_engine: SimulationEngine
    goal_manager: GoalManager
    last_result: Optional[ReasoningCycleResult] = None
    history: List[ReasoningCycleResult] = field(default_factory=list)
    history_limit: int = 200

    def run(
        self,
        observation_summary: Dict[str, Any],
        context: ContextSnapshot,
        *,
        objective_text: Optional[str] = None,
        candidate_strategies: Optional[List[Dict[str, Any]]] = None,
    ) -> ReasoningCycleResult:
        """Generate reasoning output and a planner-ready payload."""

        objective_text = objective_text or self._derive_objective(observation_summary, context)
        candidate_strategies = candidate_strategies or self._derive_candidate_strategies(observation_summary)
        reasoning_report = self.reasoning_core.reason(
            objective_text,
            context,
            queued_goals=self._queued_goals(),
            objective_metadata={"brain_loop": True, "source": "reasoning_cycle"},
        )

        simulation_result = self.simulation_engine.simulate(
            world_state=self._world_state_payload(observation_summary),
            strategies=candidate_strategies,
            context={
                "goal": reasoning_report.planning_goal,
                "objective": reasoning_report.objective,
                "brain_loop": True,
                "time_of_day": context.time_of_day,
            },
            timeline_days=max(7, int(reasoning_report.inferred.horizon)),
            num_scenarios=8,
        )

        goal_record = self.goal_manager.create_goal_from_reasoning(
            reasoning_report,
            source_text=objective_text,
            priority=70 if reasoning_report.inferred.urgency == "high" else 55,
            metadata={"brain_loop": True},
        )
        scheduled = self.goal_manager.schedule_plans(context, max_goals=3)

        planning_payload = {
            "goal_id": goal_record.goal_id,
            "reasoning_id": reasoning_report.reasoning_id,
            "simulation_id": simulation_result.result_id,
            "goal_count": len(scheduled),
            "reasoning_context": self.reasoning_core.planning_payload(reasoning_report),
            "simulation_context": self.simulation_engine.get_reasoning_context(simulation_result),
        }

        notes = self._derive_notes(reasoning_report, simulation_result, scheduled)
        result = ReasoningCycleResult(
            reasoning_id=reasoning_report.reasoning_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            objective_text=objective_text,
            reasoning_report=reasoning_report,
            simulation_result=simulation_result,
            planning_payload=planning_payload,
            goal_summary=self._goal_summary(goal_record, scheduled),
            notes=notes,
        )
        self.last_result = result
        self._append(result)
        self._persist(result)
        return result

    def summarize(self, result: Optional[ReasoningCycleResult] = None) -> Dict[str, Any]:
        result = result or self.last_result
        if result is None:
            return {"available": False, "reason": "no_reasoning_result"}

        return {
            "available": True,
            "reasoning_id": result.reasoning_id,
            "objective_text": result.objective_text,
            "confidence": result.reasoning_report.confidence,
            "planning_goal": result.reasoning_report.planning_goal,
            "strategy_count": len(result.reasoning_report.strategies.strategies),
            "simulation_status": result.simulation_result.status.value,
            "best_strategy": result.simulation_result.best_strategy,
            "goal_summary": dict(result.goal_summary),
            "notes": list(result.notes),
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.history),
            "latest": self.summarize(),
        }

    def _queued_goals(self) -> List[Dict[str, Any]]:
        return [
            {
                "goal_id": goal.goal_id,
                "title": goal.title,
                "objective": goal.objective,
                "priority": goal.priority,
                "status": goal.status,
            }
            for goal in self.goal_manager.list_active_goals()
        ]

    @staticmethod
    def _world_state_payload(observation_summary: Dict[str, Any]) -> Dict[str, Any]:
        world_state = observation_summary.get("world_state")
        if world_state is None:
            return {}
        return {
            "current_application": world_state.current_application,
            "user_activity": world_state.user_activity,
            "time_of_day": world_state.time_of_day,
            "system_health": world_state.system_health,
            "active_entities": list(world_state.active_entities),
            "constraints": list(world_state.constraints),
            "opportunities": list(world_state.opportunities),
            "confidence": world_state.confidence,
        }

    @staticmethod
    def _derive_objective(observation_summary: Dict[str, Any], context: ContextSnapshot) -> str:
        app = observation_summary.get("app", context.current_application)
        activity = observation_summary.get("activity", context.user_activity)
        health = observation_summary.get("system_health", "unknown")
        return f"Improve {activity} in {app} while preserving {health} system stability"

    @staticmethod
    def _derive_candidate_strategies(observation_summary: Dict[str, Any]) -> List[Dict[str, Any]]:
        base_value = 100 if observation_summary.get("system_health") == "healthy" else 70
        return [
            {
                "id": "strategy_balanced",
                "name": "Balanced Response",
                "base_success_probability": 0.78,
                "estimated_value": base_value,
            },
            {
                "id": "strategy_conservative",
                "name": "Conservative Response",
                "base_success_probability": 0.86,
                "estimated_value": int(base_value * 0.85),
            },
            {
                "id": "strategy_agile",
                "name": "Agile Response",
                "base_success_probability": 0.72,
                "estimated_value": int(base_value * 1.2),
            },
        ]

    @staticmethod
    def _derive_notes(
        reasoning_report: ReasoningReport,
        simulation_result: SimulationResult,
        scheduled: List[Any],
    ) -> List[str]:
        notes: List[str] = []
        if reasoning_report.confidence < 0.65:
            notes.append("Reasoning confidence is moderate; conservative execution advised.")
        if simulation_result.risk_analysis.get("total_risk", 0.0) > 0.6:
            notes.append("Simulation shows elevated risk levels.")
        if scheduled:
            notes.append(f"Scheduled {len(scheduled)} goal plans for execution.")
        return notes

    @staticmethod
    def _goal_summary(goal_record: Any, scheduled: List[Any]) -> Dict[str, Any]:
        return {
            "goal_id": goal_record.goal_id,
            "title": goal_record.title,
            "status": goal_record.status,
            "scheduled_plans": len(scheduled),
            "priority": goal_record.priority,
            "confidence": goal_record.confidence,
        }

    def _append(self, result: ReasoningCycleResult) -> None:
        self.history.append(result)
        if len(self.history) > self.history_limit:
            self.history = self.history[-self.history_limit :]

    def _persist(self, result: ReasoningCycleResult) -> None:
        payload = {
            "reasoning_id": result.reasoning_id,
            "timestamp": result.timestamp,
            "summary": self.summarize(result),
        }
        self.memory.remember_short_term(
            key="brain_loop:last_reasoning",
            value=payload,
            tags=["brain_loop", "reasoning"],
        )
        self.memory.remember_long_term(
            key=f"brain_loop:reasoning:{result.reasoning_id}",
            value=payload,
            source="brain_loop.reasoning_cycle",
            importance=0.8,
            tags=["brain_loop", "reasoning"],
        )

