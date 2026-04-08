"""Action cycle for the Jarvis cognitive loop.

Dispatches tasks to the multi-agent system, applies stability guards and rate
limits, and collects execution outcomes for downstream reflection.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional
from uuid import uuid4

from jarvis.agent_system.agent_communication import AgentCommunicationBus
from jarvis.agent_system.agent_manager import AgentManager
from jarvis.agent_system.task_dispatcher import TaskDispatcher
from jarvis.stability_core.stability_core import SystemStabilityCore


@dataclass(slots=True)
class ActionCycleResult:
    action_cycle_id: str
    timestamp: str
    dispatched_tasks: List[Dict[str, Any]] = field(default_factory=list)
    execution_results: List[Dict[str, Any]] = field(default_factory=list)
    planner_feedback: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ActionCycle:
    """Turns plans into agent-executed actions with stability protection."""

    agent_manager: AgentManager
    task_dispatcher: TaskDispatcher
    communication: AgentCommunicationBus
    stability_core: SystemStabilityCore
    last_result: Optional[ActionCycleResult] = None
    history: List[ActionCycleResult] = field(default_factory=list)
    history_limit: int = 200

    def run(self, planning_payload: Dict[str, Any], *, tasks: Optional[List[Mapping[str, Any]]] = None) -> ActionCycleResult:
        """Dispatch planner tasks to agents and collect outcomes."""

        tasks = tasks or self._build_tasks(planning_payload)
        dispatched: List[Dict[str, Any]] = []
        notes: List[str] = []

        self.agent_manager.monitor_agents()
        self.agent_manager.scale_if_needed()

        for task in tasks:
            guard_decision = self.stability_core.guard_task_submission(task)
            if not guard_decision.allowed:
                dispatched.append(
                    {
                        "task_id": guard_decision.task_id,
                        "status": "blocked",
                        "reason": guard_decision.reason,
                        "conflict_with": guard_decision.conflict_with,
                    }
                )
                notes.append(f"Blocked task {guard_decision.task_id}: {guard_decision.reason}")
                continue

            rate_decision = self.stability_core.enforce_rate_limit("task_executions")
            if not rate_decision.allowed:
                dispatched.append(
                    {
                        "task_id": guard_decision.task_id,
                        "status": "rate_limited",
                        "wait_seconds": rate_decision.wait_seconds,
                        "reason": rate_decision.reason,
                    }
                )
                notes.append(f"Rate-limited task {guard_decision.task_id} for {rate_decision.wait_seconds}s")
                continue

            dispatch_result = self.task_dispatcher.dispatch_task(task)
            dispatched.append(dispatch_result)
            if dispatch_result.get("status") != "assigned":
                notes.append(f"Task {dispatch_result.get('task_id')} was not assigned")

        execution_results = self.task_dispatcher.execute_all_pending()
        planner_feedback = self.task_dispatcher.planner_feedback_payload(execution_results)
        self._share_results(planning_payload, planner_feedback)

        result = ActionCycleResult(
            action_cycle_id=f"action-{uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            dispatched_tasks=dispatched,
            execution_results=[
                {
                    "task_id": item.task_id,
                    "agent_id": item.agent_id,
                    "success": item.success,
                    "output": item.output,
                    "error": item.error,
                }
                for item in execution_results
            ],
            planner_feedback=planner_feedback,
            notes=notes,
        )
        self.last_result = result
        self._append(result)
        return result

    def summarize(self, result: Optional[ActionCycleResult] = None) -> Dict[str, Any]:
        result = result or self.last_result
        if result is None:
            return {"available": False, "reason": "no_action_result"}

        return {
            "available": True,
            "action_cycle_id": result.action_cycle_id,
            "dispatched": len(result.dispatched_tasks),
            "executed": len(result.execution_results),
            "successful": sum(1 for item in result.execution_results if item.get("success")),
            "failed": sum(1 for item in result.execution_results if not item.get("success")),
            "notes": list(result.notes),
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.history),
            "latest": self.summarize(),
        }

    def _build_tasks(self, planning_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        reasoning_context = planning_payload.get("reasoning_context", {})
        simulation_context = planning_payload.get("simulation_context", {})
        selected_strategy = reasoning_context.get("selected_strategy") or simulation_context.get("best_strategy", {})

        base_task_id = planning_payload.get("goal_id", str(uuid4()))
        task_name = planning_payload.get("task_name", planning_payload.get("goal_id", "brain_loop_task"))
        return [
            {
                "task_id": f"{base_task_id}:inspect",
                "title": f"Inspect {task_name}",
                "required_capabilities": ["monitoring", "analysis"],
                "payload": {
                    "tool": "inspect",
                    "planning_payload": planning_payload,
                    "strategy": selected_strategy,
                },
                "priority": 3,
                "source": "brain_loop",
                "context": {"prefer_role": "reasoning"},
            },
            {
                "task_id": f"{base_task_id}:execute",
                "title": f"Execute {task_name}",
                "required_capabilities": ["execution"],
                "payload": {
                    "tool": "execute",
                    "planning_payload": planning_payload,
                    "strategy": selected_strategy,
                },
                "priority": 5,
                "source": "brain_loop",
                "context": {"prefer_role": "action"},
            },
        ]

    def _share_results(self, planning_payload: Dict[str, Any], planner_feedback: Dict[str, Any]) -> None:
        goal_id = planning_payload.get("goal_id", "unknown_goal")
        self.communication.publish(
            sender_agent_id="brain_loop",
            channel="brain_loop_feedback",
            topic="planner_feedback",
            payload={
                "goal_id": goal_id,
                "planning_payload": planning_payload,
                "planner_feedback": planner_feedback,
            },
        )

    def _append(self, result: ActionCycleResult) -> None:
        self.history.append(result)
        if len(self.history) > self.history_limit:
            self.history = self.history[-self.history_limit :]
