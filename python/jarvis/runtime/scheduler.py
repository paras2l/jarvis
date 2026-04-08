"""Runtime scheduler for dispatching queued tasks to the orchestrator.

Scheduler responsibilities:
- pull tasks from TaskQueue
- dispatch through AgentOrchestrator
- handle retries and failures
- emit events for observability
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List

from jarvis.core.orchestrator.agent_orchestrator import AgentOrchestrator
from jarvis.core.orchestrator.task_router import AgentTask
from jarvis.runtime.error_handler import RuntimeErrorHandler
from jarvis.runtime.event_bus import EventBus
from jarvis.runtime.task_queue import QueuedTask, TaskQueue


@dataclass(slots=True)
class SchedulerResult:
    """One scheduler dispatch outcome."""

    task_id: str
    goal_id: str
    success: bool
    message: str
    attempts: int
    completed_at: str


@dataclass(slots=True)
class SchedulerStats:
    """Aggregate scheduler telemetry counters."""

    dispatched: int = 0
    succeeded: int = 0
    failed: int = 0
    retried: int = 0
    skipped: int = 0


class Scheduler:
    """Priority-aware scheduler with retry support."""

    def __init__(
        self,
        queue: TaskQueue,
        orchestrator: AgentOrchestrator,
        event_bus: EventBus,
        error_handler: RuntimeErrorHandler,
    ) -> None:
        self._queue = queue
        self._orchestrator = orchestrator
        self._event_bus = event_bus
        self._errors = error_handler
        self._stats = SchedulerStats()
        self._history: List[SchedulerResult] = []
        self._history_limit = 2000

    def dispatch_next(self) -> SchedulerResult | None:
        """Dispatch next task from queue and return execution result."""
        task = self._queue.dequeue()
        if task is None:
            return None

        self._stats.dispatched += 1
        self._event_bus.publish(
            "task_dispatched",
            {
                "task_id": task.task_id,
                "goal_id": task.goal_id,
                "priority": task.priority,
                "attempts": task.attempts,
            },
            source="scheduler",
        )

        try:
            result = self._execute_queued_task(task)
            if result.success:
                self._queue.mark_completed(task.task_id)
                self._stats.succeeded += 1
                self._event_bus.publish(
                    "task_completed",
                    {
                        "task_id": task.task_id,
                        "goal_id": task.goal_id,
                        "message": result.message,
                        "attempts": result.attempts,
                    },
                    source="scheduler",
                )
            else:
                self._handle_failure(task, result.message)

            self._append_history(result)
            return result

        except Exception as exc:  # noqa: BLE001
            self._errors.capture(
                component="scheduler",
                operation="dispatch_next",
                error=exc,
                context={"task_id": task.task_id, "goal_id": task.goal_id},
            )
            self._handle_failure(task, f"scheduler exception: {exc}")
            result = SchedulerResult(
                task_id=task.task_id,
                goal_id=task.goal_id,
                success=False,
                message=str(exc),
                attempts=task.attempts,
                completed_at=datetime.now(timezone.utc).isoformat(),
            )
            self._append_history(result)
            return result

    def dispatch_until_empty(self, max_cycles: int = 100) -> List[SchedulerResult]:
        """Drain queue with bounded cycles to avoid runaway loops."""
        out: List[SchedulerResult] = []
        for _ in range(max(1, max_cycles)):
            if not self._queue.has_pending():
                break
            result = self.dispatch_next()
            if result is None:
                break
            out.append(result)
        return out

    def dispatch_for_goal(self, goal_id: str, max_cycles: int = 100) -> List[SchedulerResult]:
        """Dispatch queued tasks for specific goal in priority order."""
        out: List[SchedulerResult] = []
        for _ in range(max(1, max_cycles)):
            candidate = self._peek_goal_task(goal_id)
            if candidate is None:
                break

            # Reprioritize candidate to head then dispatch next.
            self._queue.reprioritize(candidate.task_id, new_priority=0)
            result = self.dispatch_next()
            if result is None:
                break
            out.append(result)
        return out

    def submit_tasks(self, tasks: List[QueuedTask]) -> None:
        """Bulk enqueue helper for planner output."""
        for task in tasks:
            self._queue.enqueue(task)
            self._event_bus.publish(
                "task_enqueued",
                {
                    "task_id": task.task_id,
                    "goal_id": task.goal_id,
                    "priority": task.priority,
                    "agent_role": task.agent_role,
                },
                source="scheduler",
            )

    def stats(self) -> Dict[str, Any]:
        snapshot = self._queue.snapshot()
        return {
            "scheduler": {
                "dispatched": self._stats.dispatched,
                "succeeded": self._stats.succeeded,
                "failed": self._stats.failed,
                "retried": self._stats.retried,
                "skipped": self._stats.skipped,
            },
            "queue": {
                "total": snapshot.total,
                "queued": snapshot.queued,
                "in_progress": snapshot.in_progress,
                "completed": snapshot.completed,
                "failed": snapshot.failed,
            },
        }

    def history(self, limit: int = 100) -> List[SchedulerResult]:
        if limit <= 0:
            return []
        return list(reversed(self._history[-limit:]))

    def _execute_queued_task(self, task: QueuedTask) -> SchedulerResult:
        agent_task = AgentTask(
            task_id=task.task_id,
            title=task.title,
            description=task.description,
            metadata={
                "agent_role": task.agent_role,
                "skill_name": task.skill_name,
                **task.metadata,
            },
        )

        record = self._orchestrator.execute_task(agent_task)
        return SchedulerResult(
            task_id=task.task_id,
            goal_id=task.goal_id,
            success=record.success,
            message=record.summary,
            attempts=task.attempts,
            completed_at=datetime.now(timezone.utc).isoformat(),
        )

    def _handle_failure(self, task: QueuedTask, message: str) -> None:
        self._queue.mark_failed(task.task_id, error=message)

        if task.can_retry():
            self._queue.requeue(task.task_id, new_priority=min(100, task.priority + 5))
            self._stats.retried += 1
            self._event_bus.publish(
                "task_retry_scheduled",
                {
                    "task_id": task.task_id,
                    "goal_id": task.goal_id,
                    "attempts": task.attempts,
                    "max_retries": task.max_retries,
                    "message": message,
                },
                source="scheduler",
            )
            return

        self._stats.failed += 1
        self._event_bus.publish(
            "task_failed",
            {
                "task_id": task.task_id,
                "goal_id": task.goal_id,
                "attempts": task.attempts,
                "message": message,
            },
            source="scheduler",
        )

    def _peek_goal_task(self, goal_id: str) -> QueuedTask | None:
        pending = self._queue.pending_tasks(limit=1000)
        for task in pending:
            if task.goal_id == goal_id:
                return task
        return None

    def _append_history(self, result: SchedulerResult) -> None:
        self._history.append(result)
        while len(self._history) > self._history_limit:
            self._history.pop(0)


def _example_scheduler() -> None:
    from jarvis.core.context.context_engine import ContextEngine
    from jarvis.core.planner.planner_engine import PlannerEngine
    from jarvis.memory.memory_system import MemorySystem
    from jarvis.skills.skill_registry import SkillRegistry

    from jarvis.core.orchestrator.agent_orchestrator import AgentOrchestrator

    context = ContextEngine()
    planner = PlannerEngine()
    memory = MemorySystem()
    skills = SkillRegistry()
    orchestrator = AgentOrchestrator(
        context_engine=context,
        planner=planner,
        skill_registry=skills,
        memory=memory,
    )

    queue = TaskQueue()
    bus = EventBus()
    errors = RuntimeErrorHandler()
    scheduler = Scheduler(queue=queue, orchestrator=orchestrator, event_bus=bus, error_handler=errors)

    bus.subscribe("task_completed", lambda event: print("event task_completed:", event.payload))
    bus.subscribe("task_failed", lambda event: print("event task_failed:", event.payload))

    scheduler.submit_tasks(
        [
            QueuedTask(
                task_id="s1",
                goal_id="g1",
                title="Research launch targets",
                description="Research audience and summarize launch targets",
                agent_role="ResearchAgent",
                skill_name="research_topic",
                priority=20,
            ),
            QueuedTask(
                task_id="s2",
                goal_id="g1",
                title="Create creative brief",
                description="Create campaign story and visual direction",
                agent_role="CreativeAgent",
                skill_name="generate_script",
                priority=40,
            ),
        ]
    )

    results = scheduler.dispatch_until_empty(max_cycles=10)
    print("Scheduler results:")
    for row in results:
        print(f"- {row.task_id} success={row.success} message={row.message}")


if __name__ == "__main__":
    _example_scheduler()
