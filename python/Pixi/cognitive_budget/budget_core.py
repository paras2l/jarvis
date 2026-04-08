"""Cognitive Budget System core coordinator.

Manages computational resource allocation across reasoning, research, agent swarms,
and problem-solving activities. Enforces safety limits and prevents runaway
resource consumption.

Pipeline:
1) Estimate task complexity
2) Compute resource allocation based on difficulty
3) Enforce agent spawn limits
4) Manage reasoning depth constraints
5) Monitor consumption during execution
6) Adjust budgets dynamically based on performance
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, Iterable, List
import uuid

from Pixi.cognitive_budget.agent_limit_controller import AgentLimitController
from Pixi.cognitive_budget.compute_allocator import ComputeAllocator, ResourceAllocation
from Pixi.cognitive_budget.reasoning_depth_manager import ReasoningDepthManager
from Pixi.cognitive_budget.task_complexity_estimator import TaskComplexityEstimator, TaskProfile
from Pixi.core.contracts import ContextSnapshot
from Pixi.memory.memory_system import MemorySystem
from Pixi.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class BudgetPolicy:
    """Resource limits and allocation rules."""

    max_reasoning_depth: int = 8
    min_reasoning_depth: int = 1
    max_agents_simultaneous: int = 8
    max_total_api_calls: int = 100
    max_total_compute_steps: int = 1000
    allow_recursive_reasoning: bool = False
    max_recursion_depth: int = 1
    min_minutes_between_allocations: int = 2
    max_allocations_per_hour: int = 30
    adaptive_budgeting: bool = True


@dataclass(slots=True)
class BudgetAllocation:
    """Resource budget assigned to a task."""

    allocation_id: str
    task_id: str
    created_at: str
    expires_at: str
    complexity_score: float
    task_profile: TaskProfile | None = None
    resource_allocation: ResourceAllocation | None = None
    reasoning_depth: int = 0
    max_agents: int = 0
    api_budget: int = 0
    compute_budget: int = 0
    recursive_allowed: bool = False
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BudgetConsumptionRecord:
    """Tracks resource usage against allocation."""

    record_id: str
    allocation_id: str
    task_id: str
    recorded_at: str
    api_calls_used: int = 0
    compute_steps_used: int = 0
    reasoning_steps_used: int = 0
    agents_spawned: int = 0
    recursion_depth_reached: int = 0
    status: str = "active"  # active | completed | exceeded
    warnings: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class BudgetCore:
    """Central cognitive budget controller."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        policy: BudgetPolicy | None = None,
        estimator: TaskComplexityEstimator | None = None,
        allocator: ComputeAllocator | None = None,
        depth_manager: ReasoningDepthManager | None = None,
        agent_controller: AgentLimitController | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus
        self.policy = policy or BudgetPolicy()

        self.estimator = estimator or TaskComplexityEstimator(memory=memory)
        self.allocator = allocator or ComputeAllocator(memory=memory)
        self.depth_manager = depth_manager or ReasoningDepthManager(memory=memory)
        self.agent_controller = agent_controller or AgentLimitController(memory=memory)

        self._lock = RLock()
        self._active_allocations: Dict[str, BudgetAllocation] = {}
        self._consumption_records: List[BudgetConsumptionRecord] = []
        self._allocation_history: List[BudgetAllocation] = []
        self._last_allocation_time: datetime | None = None

    def allocate_budget(
        self,
        task_id: str,
        task_description: str,
        context: ContextSnapshot | None = None,
    ) -> BudgetAllocation:
        """Estimate task complexity and assign resource budget."""
        with self._lock:
            if not self._can_allocate():
                raise RuntimeError("Budget allocation rate limit exceeded")

            allocation_id = f"budget-{uuid.uuid4().hex[:10]}"
            now = datetime.now(timezone.utc)

            # Estimate complexity
            profile = self.estimator.estimate(task_description=task_description, context=context)

            # Compute resource allocation
            resources = self.allocator.allocate(
                complexity_score=profile.complexity_score,
                profile=profile,
                policy=self.policy,
            )

            # Determine reasoning depth
            depth = self.depth_manager.compute_depth(
                complexity_score=profile.complexity_score,
                allow_recursion=self.policy.allow_recursive_reasoning,
                max_depth=self.policy.max_reasoning_depth,
            )

            # Determine agent spawn limits
            max_agents = self.agent_controller.compute_limit(
                complexity_score=profile.complexity_score,
                policy_limit=self.policy.max_agents_simultaneous,
            )

            allocation = BudgetAllocation(
                allocation_id=allocation_id,
                task_id=task_id,
                created_at=now.isoformat(),
                expires_at=(now + timedelta(minutes=60)).isoformat(),
                complexity_score=profile.complexity_score,
                task_profile=profile,
                resource_allocation=resources,
                reasoning_depth=depth,
                max_agents=max_agents,
                api_budget=resources.api_calls_allocated,
                compute_budget=resources.compute_steps_allocated,
                recursive_allowed=self.policy.allow_recursive_reasoning and profile.complexity_score > 0.6,
                metadata={
                    "difficulty_category": profile.difficulty_category,
                    "has_external_deps": profile.has_external_dependencies,
                },
            )

            self._active_allocations[allocation_id] = allocation
            self._allocation_history.append(allocation)
            self._last_allocation_time = now

            self._persist_allocation(allocation)

            if self._bus:
                self._bus.publish_event(
                    topic="cognitive_budget.allocated",
                    payload={
                        "allocation_id": allocation_id,
                        "task_id": task_id,
                        "complexity": profile.complexity_score,
                        "reasoning_depth": depth,
                        "max_agents": max_agents,
                    },
                )

            return allocation

    def record_consumption(
        self,
        allocation_id: str,
        task_id: str,
        *,
        api_calls: int = 0,
        compute_steps: int = 0,
        reasoning_steps: int = 0,
        agents_spawned: int = 0,
        recursion_depth: int = 0,
    ) -> BudgetConsumptionRecord:
        """Track resource usage during task execution."""
        with self._lock:
            allocation = self._active_allocations.get(allocation_id)
            if not allocation:
                allocation = self._find_recent_allocation(task_id)

            record_id = f"consumption-{uuid.uuid4().hex[:10]}"
            now = datetime.now(timezone.utc)

            warnings: List[str] = []
            status = "active"

            if allocation:
                # Check API budget
                if api_calls > allocation.api_budget:
                    warnings.append(f"API calls {api_calls} exceed budget {allocation.api_budget}")
                    status = "exceeded"

                # Check compute budget
                if compute_steps > allocation.compute_budget:
                    warnings.append(f"Compute steps {compute_steps} exceed budget {allocation.compute_budget}")
                    status = "exceeded"

                # Check recursion limit
                if not allocation.recursive_allowed and recursion_depth > 0:
                    warnings.append(f"Recursion detected but not allowed")
                    status = "exceeded"
                elif recursion_depth > self.policy.max_recursion_depth:
                    warnings.append(f"Recursion depth {recursion_depth} exceeds max {self.policy.max_recursion_depth}")
                    status = "exceeded"

                # Check agent limits
                if agents_spawned > allocation.max_agents:
                    warnings.append(f"Agents {agents_spawned} exceed limit {allocation.max_agents}")
                    status = "exceeded"

            record = BudgetConsumptionRecord(
                record_id=record_id,
                allocation_id=allocation_id or "unknown",
                task_id=task_id,
                recorded_at=now.isoformat(),
                api_calls_used=api_calls,
                compute_steps_used=compute_steps,
                reasoning_steps_used=reasoning_steps,
                agents_spawned=agents_spawned,
                recursion_depth_reached=recursion_depth,
                status=status,
                warnings=warnings,
            )

            self._consumption_records.append(record)
            self._persist_consumption(record)

            if self._bus and warnings:
                self._bus.publish_event(
                    topic="cognitive_budget.exceeded",
                    payload={
                        "allocation_id": allocation_id,
                        "task_id": task_id,
                        "warnings": warnings,
                    },
                )

            return record

    def release_allocation(self, allocation_id: str) -> None:
        """Mark allocation as complete and release resources."""
        with self._lock:
            if allocation_id in self._active_allocations:
                del self._active_allocations[allocation_id]

            if self._bus:
                self._bus.publish_event(
                    topic="cognitive_budget.released",
                    payload={"allocation_id": allocation_id},
                )

    def _can_allocate(self) -> bool:
        """Check if allocation rate limits allow new allocation."""
        if self._last_allocation_time is None:
            return True

        now = datetime.now(timezone.utc)
        elapsed_minutes = (now - self._last_allocation_time).total_seconds() / 60

        if elapsed_minutes < self.policy.min_minutes_between_allocations:
            return False

        recent = [a for a in self._allocation_history if (now - datetime.fromisoformat(a.created_at)).total_seconds() < 3600]
        return len(recent) < self.policy.max_allocations_per_hour

    def _find_recent_allocation(self, task_id: str) -> BudgetAllocation | None:
        """Find most recent allocation for a task."""
        for alloc in reversed(self._allocation_history):
            if alloc.task_id == task_id:
                return alloc
        return None

    def _persist_allocation(self, allocation: BudgetAllocation) -> None:
        """Store allocation in long-term memory."""
        self._memory.remember_long_term(
            key=f"budget_allocation:{allocation.allocation_id}",
            value={
                "allocation_id": allocation.allocation_id,
                "task_id": allocation.task_id,
                "complexity_score": allocation.complexity_score,
                "reasoning_depth": allocation.reasoning_depth,
                "max_agents": allocation.max_agents,
                "api_budget": allocation.api_budget,
                "compute_budget": allocation.compute_budget,
                "created_at": allocation.created_at,
            },
            source="cognitive_budget.budget_core",
            importance=0.8,
            tags=["budget", "allocation"],
        )

    def _persist_consumption(self, record: BudgetConsumptionRecord) -> None:
        """Store consumption record in long-term memory."""
        self._memory.remember_long_term(
            key=f"budget_consumption:{record.record_id}",
            value={
                "record_id": record.record_id,
                "allocation_id": record.allocation_id,
                "task_id": record.task_id,
                "api_calls_used": record.api_calls_used,
                "compute_steps_used": record.compute_steps_used,
                "status": record.status,
                "warnings": record.warnings,
            },
            source="cognitive_budget.budget_core",
            importance=0.7 if record.status == "active" else 0.9,
            tags=["budget", "consumption"],
        )

    def diagnostics(self) -> Dict[str, Any]:
        """Return system health status and active budgets."""
        with self._lock:
            total_api_allocated = sum(a.api_budget for a in self._active_allocations.values())
            total_compute_allocated = sum(a.compute_budget for a in self._active_allocations.values())
            total_consumed = sum(
                c.api_calls_used + c.compute_steps_used for c in self._consumption_records if c.status != "completed"
            )

            exceeded_count = len([c for c in self._consumption_records if c.status == "exceeded"])

            return {
                "active_allocations": len(self._active_allocations),
                "total_api_allocated": total_api_allocated,
                "total_compute_allocated": total_compute_allocated,
                "total_consumed": total_consumed,
                "exceeded_allocations": exceeded_count,
                "last_allocation_at": self._last_allocation_time.isoformat() if self._last_allocation_time else None,
                "allocation_history_count": len(self._allocation_history),
            }

