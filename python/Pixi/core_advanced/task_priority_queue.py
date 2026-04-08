"""Advanced task priority queue for large-scale agent orchestration.

This queue supports:
- high/medium/low priority levels
- delayed scheduling
- retries with backoff
- starvation prevention through aging
- queue snapshots for observability
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import IntEnum
import heapq
from threading import RLock
from typing import Any, Dict, Iterable, List, Tuple
import uuid


class PriorityLevel(IntEnum):
    """Priority levels where lower numeric value means higher urgency."""

    HIGH = 0
    MEDIUM = 1
    LOW = 2


@dataclass(slots=True)
class ScheduledTask:
    """Task entity managed by the advanced queue."""

    task_id: str
    title: str
    payload: Dict[str, Any]
    capability: str
    priority: PriorityLevel = PriorityLevel.MEDIUM
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    ready_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    deadline_at: str = ""
    attempts: int = 0
    max_retries: int = 2
    status: str = "queued"
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_ready(self, now: datetime) -> bool:
        try:
            ready_time = datetime.fromisoformat(self.ready_at)
        except ValueError:
            return True
        return now >= ready_time

    def is_overdue(self, now: datetime) -> bool:
        if not self.deadline_at:
            return False
        try:
            deadline = datetime.fromisoformat(self.deadline_at)
        except ValueError:
            return False
        return now > deadline


@dataclass(slots=True)
class QueueStats:
    total: int
    queued: int
    running: int
    completed: int
    failed: int
    delayed: int
    high: int
    medium: int
    low: int


class TaskPriorityQueue:
    """Scalable priority queue built for dozens of concurrent agents."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._tasks: Dict[str, ScheduledTask] = {}
        self._heap: List[Tuple[int, float, int, str]] = []
        self._sequence = 0
        self._completed: List[str] = []
        self._failed: List[str] = []
        self._history_limit = 3000

    def enqueue(
        self,
        title: str,
        payload: Dict[str, Any],
        capability: str,
        priority: PriorityLevel = PriorityLevel.MEDIUM,
        *,
        delay_seconds: float = 0.0,
        max_retries: int = 2,
        tags: List[str] | None = None,
        metadata: Dict[str, Any] | None = None,
        deadline_seconds: float | None = None,
    ) -> ScheduledTask:
        """Create and queue a new task."""
        now = datetime.now(timezone.utc)
        task = ScheduledTask(
            task_id=f"task-{uuid.uuid4().hex[:12]}",
            title=title,
            payload=dict(payload),
            capability=capability,
            priority=priority,
            ready_at=(now + timedelta(seconds=max(0.0, delay_seconds))).isoformat(),
            max_retries=max(0, max_retries),
            tags=list(tags or []),
            metadata=dict(metadata or {}),
            deadline_at=(now + timedelta(seconds=deadline_seconds)).isoformat() if deadline_seconds else "",
        )

        with self._lock:
            self._tasks[task.task_id] = task
            self._push_unlocked(task)
        return task

    def enqueue_existing(self, task: ScheduledTask) -> None:
        """Queue an externally created task."""
        with self._lock:
            self._tasks[task.task_id] = task
            self._push_unlocked(task)

    def enqueue_many(self, tasks: Iterable[ScheduledTask]) -> int:
        rows = list(tasks)
        with self._lock:
            for task in rows:
                self._tasks[task.task_id] = task
                self._push_unlocked(task)
        return len(rows)

    def dequeue(self) -> ScheduledTask | None:
        """Pop next ready task considering priority and schedule."""
        with self._lock:
            now = datetime.now(timezone.utc)
            while self._heap:
                _, _, _, task_id = heapq.heappop(self._heap)
                task = self._tasks.get(task_id)
                if task is None:
                    continue
                if task.status != "queued":
                    continue
                if not task.is_ready(now):
                    # Not ready yet; push back with same priority.
                    self._push_unlocked(task)
                    return None

                task.status = "running"
                task.attempts += 1
                task.metadata["started_at"] = now.isoformat()
                return task
            return None

    def peek(self) -> ScheduledTask | None:
        """Look at the next ready task without removing it."""
        with self._lock:
            now = datetime.now(timezone.utc)
            candidates = sorted(self._heap)
            for _, _, _, task_id in candidates:
                task = self._tasks.get(task_id)
                if task is None or task.status != "queued":
                    continue
                if task.is_ready(now):
                    return task
            return None

    def mark_completed(self, task_id: str, output: str = "") -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.status = "completed"
            task.metadata["completed_at"] = datetime.now(timezone.utc).isoformat()
            if output:
                task.metadata["output"] = output
            self._completed.append(task_id)
            self._trim_history_unlocked()
            return True

    def mark_failed(self, task_id: str, error: str = "") -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.status = "failed"
            task.metadata["failed_at"] = datetime.now(timezone.utc).isoformat()
            if error:
                task.metadata["error"] = error
            self._failed.append(task_id)
            self._trim_history_unlocked()
            return True

    def retry_or_fail(self, task_id: str, error: str = "", backoff_seconds: float = 0.4) -> bool:
        """Retry a failed/running task if retries remain, else mark failed."""
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False

            if task.attempts <= task.max_retries:
                delay = backoff_seconds * max(1, task.attempts)
                task.status = "queued"
                task.ready_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
                if error:
                    task.metadata["last_error"] = error
                self._push_unlocked(task)
                return True

            task.status = "failed"
            if error:
                task.metadata["error"] = error
            self._failed.append(task_id)
            self._trim_history_unlocked()
            return False

    def reprioritize(self, task_id: str, new_priority: PriorityLevel) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.priority = new_priority
            if task.status == "queued":
                self._push_unlocked(task)
            return True

    def reschedule(self, task_id: str, delay_seconds: float) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.ready_at = (datetime.now(timezone.utc) + timedelta(seconds=max(0.0, delay_seconds))).isoformat()
            if task.status == "queued":
                self._push_unlocked(task)
            return True

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return False
            task.status = "cancelled"
            return True

    def get(self, task_id: str) -> ScheduledTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def has_ready(self) -> bool:
        return self.peek() is not None

    def has_pending(self) -> bool:
        with self._lock:
            return any(task.status == "queued" for task in self._tasks.values())

    def size(self) -> int:
        with self._lock:
            return sum(1 for task in self._tasks.values() if task.status == "queued")

    def drain_ready(self, limit: int = 10) -> List[ScheduledTask]:
        out: List[ScheduledTask] = []
        for _ in range(max(1, limit)):
            task = self.dequeue()
            if task is None:
                break
            out.append(task)
        return out

    def apply_aging(self, threshold_seconds: float = 15.0) -> int:
        """Boost waiting tasks to reduce starvation.

        If a low-priority task has waited for threshold, promote it one level.
        """
        promoted = 0
        with self._lock:
            now = datetime.now(timezone.utc)
            for task in self._tasks.values():
                if task.status != "queued":
                    continue
                try:
                    created = datetime.fromisoformat(task.created_at)
                except ValueError:
                    continue
                waited = (now - created).total_seconds()
                if waited < threshold_seconds:
                    continue

                if task.priority == PriorityLevel.LOW:
                    task.priority = PriorityLevel.MEDIUM
                    promoted += 1
                elif task.priority == PriorityLevel.MEDIUM:
                    task.priority = PriorityLevel.HIGH
                    promoted += 1

                if promoted:
                    self._push_unlocked(task)
        return promoted

    def due_in_seconds(self) -> float:
        """Return seconds until next queued task becomes ready."""
        with self._lock:
            now = datetime.now(timezone.utc)
            best: float | None = None
            for task in self._tasks.values():
                if task.status != "queued":
                    continue
                try:
                    ready = datetime.fromisoformat(task.ready_at)
                except ValueError:
                    return 0.0
                delta = (ready - now).total_seconds()
                if delta <= 0:
                    return 0.0
                if best is None or delta < best:
                    best = delta
            return best if best is not None else 0.0

    def list_tasks(self, status: str | None = None, limit: int = 200) -> List[ScheduledTask]:
        with self._lock:
            rows = list(self._tasks.values())
        rows.sort(key=lambda task: (int(task.priority), task.created_at))
        if status:
            rows = [task for task in rows if task.status == status]
        return rows[: max(1, limit)]

    def snapshot(self) -> QueueStats:
        rows = self.list_tasks(limit=max(1, len(self._tasks) + 1))
        delayed = sum(1 for task in rows if task.status == "queued" and not task.is_ready(datetime.now(timezone.utc)))
        return QueueStats(
            total=len(rows),
            queued=sum(1 for task in rows if task.status == "queued"),
            running=sum(1 for task in rows if task.status == "running"),
            completed=sum(1 for task in rows if task.status == "completed"),
            failed=sum(1 for task in rows if task.status == "failed"),
            delayed=delayed,
            high=sum(1 for task in rows if task.priority == PriorityLevel.HIGH and task.status == "queued"),
            medium=sum(1 for task in rows if task.priority == PriorityLevel.MEDIUM and task.status == "queued"),
            low=sum(1 for task in rows if task.priority == PriorityLevel.LOW and task.status == "queued"),
        )

    def _push_unlocked(self, task: ScheduledTask) -> None:
        try:
            ready = datetime.fromisoformat(task.ready_at)
            ready_ts = ready.timestamp()
        except ValueError:
            ready_ts = datetime.now(timezone.utc).timestamp()

        row = (int(task.priority), ready_ts, self._sequence, task.task_id)
        heapq.heappush(self._heap, row)
        self._sequence += 1

    def _trim_history_unlocked(self) -> None:
        while len(self._completed) > self._history_limit:
            self._completed.pop(0)
        while len(self._failed) > self._history_limit:
            self._failed.pop(0)


def _example_queue() -> None:
    queue = TaskPriorityQueue()
    queue.enqueue("Urgent research", {"topic": "agents"}, "research", PriorityLevel.HIGH)
    queue.enqueue("Draft design", {"topic": "brand"}, "creative", PriorityLevel.MEDIUM)
    queue.enqueue("Nightly cleanup", {"scope": "logs"}, "automation", PriorityLevel.LOW, delay_seconds=2)

    first = queue.dequeue()
    if first:
        print("Dequeued:", first.task_id, first.title)
        queue.mark_completed(first.task_id, output="done")

    print("Snapshot:", queue.snapshot())


if __name__ == "__main__":
    _example_queue()
