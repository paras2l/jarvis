"""Agent Orchestrator implementation.

Receives tasks, routes each task to the best specialized agent, executes the
agent, and returns structured results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from Pixi.core.contracts import (
    ContextProvider,
    ExecutionPlan,
    OrchestrationReport,
    Planner,
    StepResult,
)
from Pixi.core.orchestrator.specialized_agents import (
    AgentExecutionResult,
    AgentFactory,
)
from Pixi.core.orchestrator.task_router import AgentTask, RouteDecision, TaskRouter
from Pixi.memory.memory_system import MemorySystem
from Pixi.skills.skill_registry import SkillRegistry
from Pixi.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class TaskExecutionRecord:
    """Execution audit item used for diagnostics and replay."""

    task_id: str
    selected_agent: str
    confidence: float
    reason: str
    success: bool
    summary: str
    artifacts: Dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class TaskExecutionSummary:
    """Returned by direct task execution methods."""

    goal: str
    records: List[TaskExecutionRecord]

    @property
    def success_count(self) -> int:
        return sum(1 for item in self.records if item.success)

    @property
    def failure_count(self) -> int:
        return len(self.records) - self.success_count


class AgentOrchestrator:
    """Application service that runs planner + routing + specialized agents."""

    def __init__(
        self,
        context_engine: ContextProvider,
        planner: Planner,
        skill_registry: SkillRegistry,
        memory: MemorySystem,
        system_bus: SystemBus | None = None,
        router: TaskRouter | None = None,
        factory: AgentFactory | None = None,
    ) -> None:
        self._context_engine = context_engine
        self._planner = planner
        self._skill_registry = skill_registry
        self._memory = memory
        self._bus = system_bus
        self._router = router or TaskRouter()
        self._factory = factory or AgentFactory()

    def execute_goal(self, goal: str) -> OrchestrationReport:
        context = self._context_engine.collect()
        plan = self._planner.build_plan(goal=goal, context=context)

        summary = self.execute_plan(goal=goal, plan=plan)
        results = [
            StepResult(step_id=item.task_id, success=item.success, output=item.summary)
            for item in summary.records
        ]

        report = OrchestrationReport(goal=goal, step_results=results)
        self._save_report_memory(report, summary)
        self._publish("agent.goal.completed", {"goal": goal, "success_count": summary.success_count, "failure_count": summary.failure_count})
        return report

    def execute_plan(self, goal: str, plan: ExecutionPlan) -> TaskExecutionSummary:
        """Execute all steps from a planner-created execution plan."""
        tasks = self._plan_to_tasks(plan)
        self._publish("agent.plan.received", {"goal": goal, "step_count": len(plan.steps)})
        return self.execute_tasks(goal=goal, tasks=tasks)

    def execute_tasks(self, goal: str, tasks: List[AgentTask]) -> TaskExecutionSummary:
        """Execute direct tasks by routing each task to a specialized agent."""
        records: List[TaskExecutionRecord] = []
        for task in tasks:
            decision = self._router.route(task)
            result = self._execute_one(task, decision)
            records.append(self._to_record(decision, result))
            self._publish("agent.task.completed", {"task_id": task.task_id, "agent": decision.selected_agent, "success": result.success, "summary": result.summary})

        summary = TaskExecutionSummary(goal=goal, records=records)
        self._save_task_summary(goal=goal, summary=summary)
        return summary

    def execute_task(self, task: AgentTask) -> TaskExecutionRecord:
        """Convenience method for one-off task orchestration."""
        decision = self._router.route(task)
        result = self._execute_one(task, decision)
        record = self._to_record(decision, result)
        self._memory.save(
            "last_task_execution",
            {
                "task_id": record.task_id,
                "agent": record.selected_agent,
                "success": record.success,
                "summary": record.summary,
            },
        )
        self._publish("agent.task.executed", {"task_id": record.task_id, "agent": record.selected_agent, "success": record.success})
        return record

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"agent.execute_goal", "agent.goal.execute"}:
            report = self.execute_goal(str(payload.get("goal", "")))
            return {"goal": report.goal, "step_results": len(report.step_results)}

        if topic in {"agent.execute_plan", "agent.plan.execute"}:
            plan = payload.get("plan")
            if plan is None:
                return {"status": "error", "reason": "missing_plan"}
            summary = self.execute_plan(str(payload.get("goal", "")), plan)
            return {"status": "ok", "goal": str(payload.get("goal", "")), "success_count": summary.success_count}

        return {"status": "ignored", "topic": topic}

    def available_agents(self) -> List[str]:
        """Return registered specialized agent names."""
        return self._factory.all_names()

    def simulate_execution_flow(self, goal: str) -> List[str]:
        """Human-readable execution flow trace for debugging and demos."""
        context = self._context_engine.collect()
        plan = self._planner.build_plan(goal=goal, context=context)
        tasks = self._plan_to_tasks(plan)

        lines: List[str] = [f"Goal: {goal}", f"Plan steps: {len(plan.steps)}"]
        for task in tasks:
            decision = self._router.route(task)
            lines.append(
                f"{task.task_id}: {task.title} -> {decision.selected_agent} "
                f"(confidence={decision.confidence:.2f})"
            )
        return lines

    def _plan_to_tasks(self, plan: ExecutionPlan) -> List[AgentTask]:
        tasks: List[AgentTask] = []
        for step in plan.steps:
            tasks.append(
                AgentTask(
                    task_id=step.id,
                    title=step.description.split(" - ", 1)[0],
                    description=step.description,
                    metadata={
                        "agent_role": step.agent_role,
                        "skill_name": step.skill_name,
                    },
                )
            )
        return tasks

    def _execute_one(self, task: AgentTask, decision: RouteDecision) -> AgentExecutionResult:
        try:
            agent = self._factory.get(decision.selected_agent)
            return agent.execute(task)
        except Exception as exc:  # noqa: BLE001
            return AgentExecutionResult(
                task_id=task.task_id,
                agent_name=decision.selected_agent,
                success=False,
                summary=f"Execution failed: {exc}",
                artifacts={"error": str(exc)},
            )

    @staticmethod
    def _to_record(decision: RouteDecision, result: AgentExecutionResult) -> TaskExecutionRecord:
        return TaskExecutionRecord(
            task_id=result.task_id,
            selected_agent=result.agent_name,
            confidence=decision.confidence,
            reason=decision.reason,
            success=result.success,
            summary=result.summary,
            artifacts=result.artifacts,
        )

    def _save_report_memory(self, report: OrchestrationReport, summary: TaskExecutionSummary) -> None:
        self._memory.save(
            "last_report",
            {
                "goal": report.goal,
                "steps": [r.__dict__ for r in report.step_results],
                "agent_execution": [
                    {
                        "task_id": item.task_id,
                        "agent": item.selected_agent,
                        "confidence": item.confidence,
                        "success": item.success,
                    }
                    for item in summary.records
                ],
            },
        )

    def _save_task_summary(self, goal: str, summary: TaskExecutionSummary) -> None:
        self._memory.save(
            "last_task_summary",
            {
                "goal": goal,
                "success_count": summary.success_count,
                "failure_count": summary.failure_count,

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="agent_system",
            payload=payload,
            topic=topic,
            tags=["agent_system", "system_bus"],
        )
                "records": [
                    {
                        "task_id": item.task_id,
                        "agent": item.selected_agent,
                        "summary": item.summary,
                    }
                    for item in summary.records
                ],
            },
        )


def _example_flow() -> None:
    """Local demo showing task routing and specialized execution flow."""

    from Pixi.core.context.context_engine import ContextEngine
    from Pixi.core.planner.planner_engine import PlannerEngine

    memory = MemorySystem()
    skills = SkillRegistry()
    context = ContextEngine()
    planner = PlannerEngine()

    orchestrator = AgentOrchestrator(
        context_engine=context,
        planner=planner,
        skill_registry=skills,
        memory=memory,
    )

    demo_goal = "Create a YouTube video and automate post-publish analytics tracking"

    print("=== Agent Orchestrator Demo ===")
    print("Available Agents:")
    for name in orchestrator.available_agents():
        print(f"- {name}")

    print("\nExecution Flow Preview:")
    for line in orchestrator.simulate_execution_flow(demo_goal):
        print(f"  {line}")

    print("\nFinal Report:")
    report = orchestrator.execute_goal(demo_goal)
    for row in report.step_results:
        status = "OK" if row.success else "FAIL"
        print(f"  [{status}] {row.step_id} -> {row.output}")

    print("\nDirect Task Example:")
    record = orchestrator.execute_task(
        AgentTask(
            task_id="manual-1",
            title="Prepare portfolio trade plan",
            description="Create a low-risk swing trade setup with explicit risk controls",
        )
    )
    print(
        f"  {record.task_id} routed to {record.selected_agent} "
        f"(confidence={record.confidence:.2f})"
    )
    print(f"  Summary: {record.summary}")


if __name__ == "__main__":
    _example_flow()

