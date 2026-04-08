"""Task dispatcher for assigning planner tasks to specialized agents."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional
from uuid import uuid4

from jarvis.agent_system.agent_communication import AgentCommunicationBus
from jarvis.agent_system.agent_core import AgentTask, AgentTaskResult
from jarvis.agent_system.agent_registry import AgentRegistry
from jarvis.agent_system.capability_router import CapabilityRouter


@dataclass(slots=True)
class DispatchRecord:
    """Assignment history record for one task."""

    dispatch_id: str
    task_id: str
    agent_id: str
    route_score: float
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class TaskDispatcher:
    """Receives planner tasks and dispatches to matching agents."""

    registry: AgentRegistry
    router: CapabilityRouter
    communication: AgentCommunicationBus
    dispatch_history: List[DispatchRecord] = field(default_factory=list)

    def dispatch_task(self, planner_task: Mapping[str, Any]) -> Dict[str, Any]:
        """Assign one planner task to the best available agent."""

        task = self._to_agent_task(planner_task)
        routes = self.router.route_task(
            required_capabilities=task.required_capabilities,
            context=self._routing_context(planner_task),
            top_k=3,
        )

        if not routes:
            return {
                "task_id": task.task_id,
                "status": "unassigned",
                "reason": "No capable agents found",
                "required_capabilities": task.required_capabilities,
            }

        best_route = routes[0]
        agent = self.registry.get_agent(best_route.agent_id)
        if agent is None:
            return {
                "task_id": task.task_id,
                "status": "unassigned",
                "reason": "Selected agent not found in registry",
            }

        agent.enqueue_task(task)
        record = DispatchRecord(
            dispatch_id=str(uuid4()),
            task_id=task.task_id,
            agent_id=agent.agent_id,
            route_score=best_route.score,
        )
        self.dispatch_history.append(record)

        self.communication.publish(
            sender_agent_id="task_dispatcher",
            channel="dispatch_events",
            topic="task_assigned",
            payload={
                "task_id": task.task_id,
                "agent_id": agent.agent_id,
                "route_score": best_route.score,
                "required_capabilities": task.required_capabilities,
            },
        )

        return {
            "task_id": task.task_id,
            "status": "assigned",
            "assigned_agent_id": agent.agent_id,
            "assigned_agent_name": agent.name,
            "route_score": best_route.score,
            "route_reason": best_route.reason,
        }

    def dispatch_batch(self, planner_tasks: List[Mapping[str, Any]]) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        for planner_task in planner_tasks:
            results.append(self.dispatch_task(planner_task))
        return results

    def execute_assigned_task(self, task_id: str) -> Optional[AgentTaskResult]:
        """Locate assigned task in queues and execute via owning agent."""

        for agent in self.registry.all_agents():
            for queued_task in list(agent.task_queue):
                if queued_task.task_id == task_id:
                    # preserve priority ordering and remove specific task
                    agent.task_queue.remove(queued_task)
                    result = agent.execute_task(queued_task)
                    self.communication.share_task_result(
                        sender_agent_id=agent.agent_id,
                        task_id=task_id,
                        result_payload={
                            "success": result.success,
                            "output": result.output,
                            "error": result.error,
                        },
                    )
                    return result
        return None

    def execute_all_pending(self) -> List[AgentTaskResult]:
        """Run one cycle across agents to process queued tasks."""

        results: List[AgentTaskResult] = []
        for agent in self.registry.all_agents():
            while agent.task_queue:
                result = agent.execute_next_task()
                if result is not None:
                    results.append(result)
                    self.communication.share_task_result(
                        sender_agent_id=agent.agent_id,
                        task_id=result.task_id,
                        result_payload={
                            "success": result.success,
                            "output": result.output,
                            "error": result.error,
                        },
                    )
        return results

    def planner_feedback_payload(self, execution_results: List[AgentTaskResult]) -> Dict[str, Any]:
        """Build payload for planner and reasoning engine handoff."""

        successful = [r for r in execution_results if r.success]
        failed = [r for r in execution_results if not r.success]

        return {
            "total": len(execution_results),
            "successful": len(successful),
            "failed": len(failed),
            "results": [
                {
                    "task_id": result.task_id,
                    "agent_id": result.agent_id,
                    "success": result.success,
                    "output": result.output,
                    "error": result.error,
                }
                for result in execution_results
            ],
            "recommended_reasoning_input": {
                "failure_patterns": [r.error for r in failed if r.error],
                "success_examples": [r.task_id for r in successful],
            },
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "dispatch_count": len(self.dispatch_history),
            "latest_dispatches": [
                {
                    "task_id": rec.task_id,
                    "agent_id": rec.agent_id,
                    "route_score": rec.route_score,
                    "created_at": rec.created_at,
                }
                for rec in self.dispatch_history[-20:]
            ],
        }

    def _to_agent_task(self, planner_task: Mapping[str, Any]) -> AgentTask:
        task_id = str(planner_task.get("task_id", planner_task.get("id", str(uuid4()))))
        required_capabilities = [str(item) for item in planner_task.get("required_capabilities", [])]
        payload = dict(planner_task.get("payload", {}))
        if "tool" in planner_task and "tool" not in payload:
            payload["tool"] = planner_task["tool"]

        return AgentTask(
            task_id=task_id,
            title=str(planner_task.get("title", planner_task.get("description", "untitled task"))),
            required_capabilities=required_capabilities,
            payload=payload,
            priority=int(planner_task.get("priority", 5)),
            source=str(planner_task.get("source", "planner")),
        )

    def _routing_context(self, planner_task: Mapping[str, Any]) -> Dict[str, Any]:
        context = planner_task.get("context", {})
        if isinstance(context, dict):
            return dict(context)
        return {}
