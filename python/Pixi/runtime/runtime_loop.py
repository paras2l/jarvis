"""Minimal Pixi Core Runtime loop coordinating Pixi subsystems."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Event
import time
from typing import Any, Dict, List
import uuid

from Pixi.core.context.context_engine import ContextEngine
from Pixi.core.orchestrator.agent_orchestrator import AgentOrchestrator
from Pixi.core.planner.planner_engine import PlannerEngine
from Pixi.memory.memory_system import MemorySystem
from Pixi.runtime.error_handler import RuntimeErrorHandler
from Pixi.runtime.event_bus import EventBus
from Pixi.runtime.scheduler import Scheduler
from Pixi.runtime.task_queue import QueuedTask, TaskQueue, planner_step_to_queued_task
from Pixi.skills.skill_registry import SkillRegistry


@dataclass(slots=True)
class RuntimeGoal:
    """One goal submitted to runtime loop."""

    goal_id: str
    text: str
    priority: int = 50
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)


class RuntimeLoop:
    """Continuous runtime coordinator for Pixi subsystems."""

    def __init__(self, tick_interval_seconds: float = 0.5, max_dispatch_per_tick: int = 5) -> None:
        self.tick_interval_seconds = max(0.05, tick_interval_seconds)
        self.max_dispatch_per_tick = max(1, max_dispatch_per_tick)

        self.memory = MemorySystem()
        self.skills = SkillRegistry()
        self.context = ContextEngine()
        self.planner = PlannerEngine()
        self.orchestrator = AgentOrchestrator(
            context_engine=self.context,
            planner=self.planner,
            skill_registry=self.skills,
            memory=self.memory,
        )

        self.event_bus = EventBus()
        self.error_handler = RuntimeErrorHandler()
        self.task_queue = TaskQueue()
        self.scheduler = Scheduler(
            queue=self.task_queue,
            orchestrator=self.orchestrator,
            event_bus=self.event_bus,
            error_handler=self.error_handler,
        )

        self._stop = Event()
        self._goals: List[RuntimeGoal] = []
        self._tick = 0

    def submit_goal(self, text: str, priority: int = 50, metadata: Dict[str, Any] | None = None) -> str:
        """Add a high-level goal to the runtime inbox."""
        goal = RuntimeGoal(
            goal_id=f"goal-{uuid.uuid4().hex[:10]}",
            text=text.strip(),
            priority=max(0, min(100, int(priority))),
            metadata=dict(metadata or {}),
        )
        self._goals.append(goal)
        self.event_bus.publish(
            "goal_submitted",
            {"goal_id": goal.goal_id, "text": goal.text, "priority": goal.priority},
            source="runtime_loop",
        )
        return goal.goal_id

    def run_forever(self) -> None:
        """Run continuous runtime loop until stop() is called."""
        while not self._stop.is_set():
            self.run_tick()
            time.sleep(self.tick_interval_seconds)

    def run_ticks(self, count: int) -> None:
        """Run bounded number of ticks for tests and local demos."""
        for _ in range(max(0, count)):
            if self._stop.is_set():
                break
            self.run_tick()
            time.sleep(self.tick_interval_seconds)

    def stop(self) -> None:
        self._stop.set()
        self.context.shutdown()

    def run_tick(self) -> None:
        """Execute one operating-cycle tick."""
        self._tick += 1
        try:
            snapshot = self.context.collect()
            self.event_bus.publish(
                "context_updated",
                {
                    "tick": self._tick,
                    "application": snapshot.current_application,
                    "activity": snapshot.user_activity,
                    "time_of_day": snapshot.time_of_day,
                },
                source="runtime_loop",
            )

            self.memory.remember_short_term(
                key="runtime:last_context",
                value={
                    "tick": self._tick,
                    "application": snapshot.current_application,
                    "activity": snapshot.user_activity,
                    "time_of_day": snapshot.time_of_day,
                },
                tags=["runtime", "context"],
            )

            self._process_goal_inbox(snapshot)
            self._dispatch_ready_tasks()

            self.event_bus.publish(
                "runtime_tick_completed",
                {"tick": self._tick, "queue_size": self.task_queue.size()},
                source="runtime_loop",
            )
        except Exception as exc:  # noqa: BLE001
            self.error_handler.capture(
                component="runtime_loop",
                operation="run_tick",
                error=exc,
                context={"tick": self._tick},
            )
            self.event_bus.publish_error(exc, context={"tick": self._tick}, source="runtime_loop")

    def _process_goal_inbox(self, snapshot: Any) -> None:
        """Convert queued goals into planned tasks and enqueue them."""
        if not self._goals:
            return

        goals = list(self._goals)
        self._goals.clear()
        for goal in goals:
            plan = self.planner.build_plan(goal=goal.text, context=snapshot)

            queued: List[QueuedTask] = []
            for step in plan.steps:
                task = planner_step_to_queued_task(
                    goal_id=goal.goal_id,
                    step_id=f"{goal.goal_id}:{step.id}",
                    description=step.description,
                    agent_role=step.agent_role,
                    skill_name=step.skill_name,
                )
                task.priority = min(task.priority, goal.priority)
                task.metadata.update(goal.metadata)
                queued.append(task)

            self.scheduler.submit_tasks(queued)
            self.memory.remember_long_term(
                key=f"goal_plan:{goal.goal_id}",
                value={
                    "goal": goal.text,
                    "step_count": len(plan.steps),
                    "created_at": goal.created_at,
                },
                source="runtime_loop",
                importance=0.8,
                tags=["goal", "plan"],
            )
            self.event_bus.publish(
                "plan_created",
                {"goal_id": goal.goal_id, "steps": len(plan.steps)},
                source="runtime_loop",
            )

    def _dispatch_ready_tasks(self) -> None:
        """Dispatch a bounded number of tasks each tick."""
        for _ in range(self.max_dispatch_per_tick):
            if not self.task_queue.has_pending():
                break
            result = self.scheduler.dispatch_next()
            if result is None:
                break

            self.memory.remember_short_term(
                key=f"task_result:{result.task_id}",
                value={
                    "goal_id": result.goal_id,
                    "success": result.success,
                    "message": result.message,
                    "attempts": result.attempts,
                },
                tags=["task_result"],
            )
            self.memory.remember_semantic(
                doc_id=f"task:{result.task_id}",
                text=f"Task {result.task_id} for goal {result.goal_id}: {result.message}",
                metadata={"success": result.success, "goal_id": result.goal_id},
            )

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "tick": self._tick,
            "pending_goals": len(self._goals),
            "queue": self.task_queue.snapshot().__dict__,
            "scheduler": self.scheduler.stats(),
            "errors": self.error_handler.stats(),
            "memory": self.memory.stats(),
        }


def _example_runtime_loop() -> None:
    runtime = RuntimeLoop(tick_interval_seconds=0.1, max_dispatch_per_tick=3)
    runtime.submit_goal("Create a YouTube video about planner architecture", priority=30)
    runtime.submit_goal("Automate weekly report workflow and notifications", priority=20)

    runtime.run_ticks(12)
    print(runtime.diagnostics())
    runtime.stop()


if __name__ == "__main__":
    _example_runtime_loop()

