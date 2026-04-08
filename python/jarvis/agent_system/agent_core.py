"""Core agent primitives and runtime behavior for Jarvis multi-agent system."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Mapping, Optional
from uuid import uuid4


class AgentStatus(str, Enum):
    IDLE = "idle"
    BUSY = "busy"
    OFFLINE = "offline"
    DEGRADED = "degraded"


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass(slots=True)
class AgentCapability:
    """Represents one skill area supported by an agent."""

    name: str
    proficiency: float = 0.7
    tags: List[str] = field(default_factory=list)


@dataclass(slots=True)
class AgentTool:
    """Tool metadata and callable interface used by agents."""

    name: str
    description: str
    handler: Callable[[Dict[str, Any]], Dict[str, Any]]


@dataclass(slots=True)
class AgentTask:
    """Task unit sent from planner/dispatcher to an agent."""

    task_id: str
    title: str
    required_capabilities: List[str] = field(default_factory=list)
    payload: Dict[str, Any] = field(default_factory=dict)
    priority: int = 5
    source: str = "planner"
    status: TaskStatus = TaskStatus.QUEUED
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class AgentTaskResult:
    """Result payload produced after one task execution."""

    task_id: str
    agent_id: str
    success: bool
    output: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    completed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class AgentCore:
    """Base runtime model for specialized Jarvis agents.

    Includes identity, capabilities, tools, status, queue, and execution metrics.
    """

    agent_id: str
    name: str
    role: str
    capabilities: List[AgentCapability] = field(default_factory=list)
    tools: Dict[str, AgentTool] = field(default_factory=dict)
    status: AgentStatus = AgentStatus.IDLE
    task_queue: List[AgentTask] = field(default_factory=list)
    active_task_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    tasks_completed: int = 0
    tasks_failed: int = 0
    last_heartbeat_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @classmethod
    def create(
        cls,
        name: str,
        role: str,
        capabilities: Optional[List[AgentCapability]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "AgentCore":
        return cls(
            agent_id=str(uuid4()),
            name=name,
            role=role,
            capabilities=capabilities or [],
            metadata=metadata or {},
        )

    def register_tool(self, tool: AgentTool) -> None:
        self.tools[tool.name] = tool

    def supports_capability(self, capability_name: str) -> bool:
        target = capability_name.strip().lower()
        for capability in self.capabilities:
            if capability.name.strip().lower() == target:
                return True
            if target in {tag.strip().lower() for tag in capability.tags}:
                return True
        return False

    def capability_score(self, required: List[str]) -> float:
        """Return normalized capability coverage score for routing."""

        if not required:
            return 0.5

        score = 0.0
        for cap in required:
            matched = [
                c for c in self.capabilities
                if c.name.lower() == cap.lower() or cap.lower() in {t.lower() for t in c.tags}
            ]
            if matched:
                score += max(c.proficiency for c in matched)

        return round(score / float(len(required)), 4)

    def enqueue_task(self, task: AgentTask) -> None:
        self.task_queue.append(task)
        self.task_queue.sort(key=lambda item: item.priority)

    def dequeue_task(self) -> Optional[AgentTask]:
        if not self.task_queue:
            return None
        return self.task_queue.pop(0)

    def execute_next_task(self) -> Optional[AgentTaskResult]:
        task = self.dequeue_task()
        if task is None:
            self.status = AgentStatus.IDLE
            self.active_task_id = None
            return None

        self.status = AgentStatus.BUSY
        self.active_task_id = task.task_id
        task.status = TaskStatus.RUNNING

        try:
            result = self._execute_task(task)
            task.status = TaskStatus.COMPLETED
            self.tasks_completed += 1
            return result
        except Exception as exc:
            task.status = TaskStatus.FAILED
            self.tasks_failed += 1
            return AgentTaskResult(
                task_id=task.task_id,
                agent_id=self.agent_id,
                success=False,
                error=str(exc),
                output={"message": "task execution failed"},
            )
        finally:
            self.status = AgentStatus.IDLE
            self.active_task_id = None
            self.touch_heartbeat()

    def execute_task(self, task: AgentTask) -> AgentTaskResult:
        """Execute an externally provided task immediately."""

        self.status = AgentStatus.BUSY
        self.active_task_id = task.task_id
        task.status = TaskStatus.RUNNING
        try:
            result = self._execute_task(task)
            task.status = TaskStatus.COMPLETED
            self.tasks_completed += 1
            return result
        except Exception as exc:
            task.status = TaskStatus.FAILED
            self.tasks_failed += 1
            return AgentTaskResult(
                task_id=task.task_id,
                agent_id=self.agent_id,
                success=False,
                error=str(exc),
                output={"message": "task execution failed"},
            )
        finally:
            self.status = AgentStatus.IDLE
            self.active_task_id = None
            self.touch_heartbeat()

    def _execute_task(self, task: AgentTask) -> AgentTaskResult:
        """Default execution path: resolve tool in payload then call it."""

        tool_name = str(task.payload.get("tool", "")).strip()
        if not tool_name:
            return AgentTaskResult(
                task_id=task.task_id,
                agent_id=self.agent_id,
                success=True,
                output={"message": f"{self.name} acknowledged task", "task": task.title},
            )

        tool = self.tools.get(tool_name)
        if tool is None:
            raise ValueError(f"Tool '{tool_name}' is not registered for agent '{self.name}'")

        tool_output = tool.handler(task.payload)
        return AgentTaskResult(
            task_id=task.task_id,
            agent_id=self.agent_id,
            success=True,
            output={
                "tool": tool_name,
                "agent": self.name,
                "result": tool_output,
            },
        )

    def health_snapshot(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "role": self.role,
            "status": self.status.value,
            "queue_depth": len(self.task_queue),
            "active_task_id": self.active_task_id,
            "tasks_completed": self.tasks_completed,
            "tasks_failed": self.tasks_failed,
            "success_rate": self.success_rate(),
            "last_heartbeat_at": self.last_heartbeat_at,
            "capabilities": [c.name for c in self.capabilities],
        }

    def success_rate(self) -> float:
        total = self.tasks_completed + self.tasks_failed
        if total == 0:
            return 1.0
        return round(self.tasks_completed / float(total), 4)

    def touch_heartbeat(self) -> None:
        self.last_heartbeat_at = datetime.now(timezone.utc).isoformat()

    def as_registry_record(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "name": self.name,
            "role": self.role,
            "status": self.status.value,
            "capabilities": [
                {"name": c.name, "proficiency": c.proficiency, "tags": list(c.tags)}
                for c in self.capabilities
            ],
            "tools": list(self.tools.keys()),
            "metadata": dict(self.metadata),
            "metrics": {
                "tasks_completed": self.tasks_completed,
                "tasks_failed": self.tasks_failed,
                "success_rate": self.success_rate(),
            },
        }
