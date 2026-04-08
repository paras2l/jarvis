"""Priority task queue for Pixi runtime.

The queue stores planner-created tasks before execution and supports:
- enqueue
- dequeue
- peek
- priority handling
- attempt tracking for retry workflows
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import heapq
from threading import RLock
from typing import Any, Dict, List, Literal, Tuple

TaskStatus = Literal["queued", "in_progress", "completed", "failed"]


@dataclass(slots=True)
class QueuedTask:
    """Task model used by runtime scheduler and orchestrator dispatch."""

    task_id: str
    goal_id: str
    title: str
    description: str
    agent_role: str
    skill_name: str
    priority: int = 50
    max_retries: int = 2
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    attempts: int = 0
    status: TaskStatus = "queued"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def mark_started(self) -> None:
        self.status = "in_progress"
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_completed(self) -> None:
        self.status = "completed"
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def mark_failed(self) -> None:
        self.status = "failed"
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def can_retry(self) -> bool:
        return self.attempts <= self.max_retries


@dataclass(slots=True)
class QueueSnapshot:
    """Debug/telemetry snapshot of queue state."""

    total: int
    queued: int
    in_progress: int
    completed: int
    failed: int


class TaskQueue:
    """Thread-safe priority queue for runtime tasks.

    Priority convention:
    - Lower number means higher priority.
    - Tasks with same priority are FIFO by insertion sequence.
    """

    def __init__(self) -> None:
        self._lock = RLock()
        self._heap: List[Tuple[int, int, str]] = []
        self._tasks: Dict[str, QueuedTask] = {}
        self._sequence = 0
        self._completed: List[QueuedTask] = []
        self._failed: List[QueuedTask] = []

    def enqueue(self, task: QueuedTask) -> None:
        """Insert task into priority queue."""
        with self._lock:
            if task.task_id in self._tasks:
                # Replace existing task while preserving latest metadata.
                self._tasks[task.task_id] = task
                self._rebuild_heap_unlocked()
                return

            self._tasks[task.task_id] = task
            heapq.heappush(self._heap, (task.priority, self._sequence, task.task_id))
            self._sequence += 1

    def dequeue(self) -> QueuedTask | None:
        """Pop highest-priority queued task or None when empty."""
        with self._lock:
            while self._heap:
                _, _, task_id = heapq.heappop(self._heap)
                task = self._tasks.get(task_id)
                if task is None:
                    continue
                if task.status != "queued":
                    continue
                task.mark_started()
                task.attempts += 1
                return task
            return None

    def peek(self) -> QueuedTask | None:
        """View next task without removing it from queue."""
        with self._lock:
            # Create a temporary pop loop with restoration for accurate peek.
            popped: List[Tuple[int, int, str]] = []
            candidate: QueuedTask | None = None

            while self._heap:
                row = heapq.heappop(self._heap)
                popped.append(row)
                task_id = row[2]
                task = self._tasks.get(task_id)
                if task is None or task.status != "queued":
                    continue
                candidate = task
                break

            for row in popped:
                heapq.heappush(self._heap, row)
            return candidate

    def mark_completed(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.mark_completed()
            self._completed.append(task)
            return True

    def mark_failed(self, task_id: str, error: str = "") -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.mark_failed()
            if error:
                task.metadata["last_error"] = error
            self._failed.append(task)
            return True

    def requeue(self, task_id: str, new_priority: int | None = None) -> bool:
        """Return failed/in-progress task to queued state for retry."""
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.status = "queued"
            task.updated_at = datetime.now(timezone.utc).isoformat()
            if new_priority is not None:
                task.priority = self._normalize_priority(new_priority)
            heapq.heappush(self._heap, (task.priority, self._sequence, task.task_id))
            self._sequence += 1
            return True

    def reprioritize(self, task_id: str, new_priority: int) -> bool:
        """Change task priority and rebuild heap."""
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.priority = self._normalize_priority(new_priority)
            task.updated_at = datetime.now(timezone.utc).isoformat()
            self._rebuild_heap_unlocked()
            return True

    def remove(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            del self._tasks[task_id]
            self._rebuild_heap_unlocked()
            return True

    def get(self, task_id: str) -> QueuedTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def has_pending(self) -> bool:
        with self._lock:
            return any(task.status == "queued" for task in self._tasks.values())

    def size(self) -> int:
        with self._lock:
            return len([task for task in self._tasks.values() if task.status == "queued"])

    def all_tasks(self) -> List[QueuedTask]:
        with self._lock:
            rows = list(self._tasks.values())
        rows.sort(key=lambda row: (row.priority, row.created_at))
        return rows

    def pending_tasks(self, limit: int = 100) -> List[QueuedTask]:
        rows = [task for task in self.all_tasks() if task.status == "queued"]
        return rows[: max(1, limit)]

    def completed_tasks(self, limit: int = 100) -> List[QueuedTask]:
        return list(reversed(self._completed[-max(1, limit) :]))

    def failed_tasks(self, limit: int = 100) -> List[QueuedTask]:
        return list(reversed(self._failed[-max(1, limit) :]))

    def snapshot(self) -> QueueSnapshot:
        rows = self.all_tasks()
        return QueueSnapshot(
            total=len(rows),
            queued=sum(1 for row in rows if row.status == "queued"),
            in_progress=sum(1 for row in rows if row.status == "in_progress"),
            completed=sum(1 for row in rows if row.status == "completed"),
            failed=sum(1 for row in rows if row.status == "failed"),
        )

    def clear(self) -> None:
        with self._lock:
            self._heap.clear()
            self._tasks.clear()
            self._completed.clear()
            self._failed.clear()

    def _rebuild_heap_unlocked(self) -> None:
        self._heap.clear()
        self._sequence = 0
        for task in sorted(self._tasks.values(), key=lambda row: (row.priority, row.created_at)):
            if task.status == "queued":
                heapq.heappush(self._heap, (task.priority, self._sequence, task.task_id))
                self._sequence += 1

    @staticmethod
    def _normalize_priority(value: int) -> int:
        return max(0, min(100, int(value)))


def planner_step_to_queued_task(goal_id: str, step_id: str, description: str, agent_role: str, skill_name: str) -> QueuedTask:
    """Convenience helper for converting plan steps to queue tasks."""
    priority = 50
    text = description.lower()

    if "critical" in text or "deadline" in text:
        priority = 10
    elif "high" in text:
        priority = 20
    elif "low" in text:
        priority = 70

    return QueuedTask(
        task_id=step_id,
        goal_id=goal_id,
        title=description.split(" - ", 1)[0],
        description=description,
        agent_role=agent_role,
        skill_name=skill_name,
        priority=priority,
        max_retries=2,
        metadata={"origin": "planner"},
    )


def _example_task_queue() -> None:
    queue = TaskQueue()

    queue.enqueue(
        QueuedTask(
            task_id="t1",
            goal_id="g1",
            title="Critical security patch",
            description="Apply critical hotfix",
            agent_role="DevelopmentAgent",
            skill_name="implement_code",
            priority=5,
        )
    )
    queue.enqueue(
        QueuedTask(
            task_id="t2",
            goal_id="g1",
            title="Generate visuals",
            description="Create visuals for campaign",
            agent_role="CreativeAgent",
            skill_name="create_visual_assets",
            priority=40,
        )
    )

    print("Task Queue Example")
    print("Peek:", queue.peek())

    first = queue.dequeue()
    print("Dequeued first:", first.task_id if first else None)
    if first:
        queue.mark_completed(first.task_id)

    second = queue.dequeue()
    print("Dequeued second:", second.task_id if second else None)
    if second:
        queue.mark_failed(second.task_id, "temporary provider outage")
        if second.can_retry():
            queue.requeue(second.task_id, new_priority=15)

    print("Snapshot:", queue.snapshot())


if __name__ == "__main__":
    _example_task_queue()

