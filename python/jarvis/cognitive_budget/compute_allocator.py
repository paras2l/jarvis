"""Compute resource allocator for cognitive budget system.

Assigns GPU, API token, and compute step budgets based on task complexity
and system capacity. Enforces efficiency and prevents resource starvation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from jarvis.cognitive_budget.task_complexity_estimator import TaskProfile
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ResourceAllocation:
    """Compute resources assigned to a task."""

    allocation_id: str
    api_calls_allocated: int
    api_calls_per_minute: int
    compute_steps_allocated: int
    compute_steps_per_minute: int
    gpu_memory_mb: int
    research_budget_minutes: int
    agent_spawn_budget: int
    priority_level: str  # low, normal, high, critical
    time_limit_minutes: int
    soft_limit: bool  # can exceed slightly if needed
    hard_limit: bool  # cannot exceed
    metadata: Dict[str, Any] = field(default_factory=dict)


class ComputeAllocator:
    """Allocate computational resources to tasks."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

        # Resource pool definitions
        self._resource_limits = {
            "total_api_calls_per_hour": 500,
            "total_compute_steps_per_hour": 5000,
            "total_gpu_memory_mb": 8192,
            "min_per_task_api": 5,
            "max_per_task_api": 200,
            "min_per_task_compute": 50,
            "max_per_task_compute": 2000,
        }

    def allocate(
        self,
        complexity_score: float,
        profile: TaskProfile | None = None,
        policy: Any = None,
    ) -> ResourceAllocation:
        """Compute resource allocation based on complexity."""
        allocation_id = f"resource-{hash(str(profile)) % 1000000:06d}"

        # Compute API allocation
        api_alloc = self._allocate_api_calls(complexity_score, profile)

        # Compute steps allocation
        compute_alloc = self._allocate_compute_steps(complexity_score, profile)

        # GPU allocation
        gpu_alloc = self._allocate_gpu_memory(complexity_score, profile)

        # Research budget (minutes)
        research_budget = self._allocate_research_budget(complexity_score, profile)

        # Agent spawn budget
        agent_budget = self._allocate_agent_budget(complexity_score)

        # Priority level
        priority = self._compute_priority(complexity_score, profile)

        # Time limit
        time_limit = self._compute_time_limit(complexity_score, profile)

        allocation = ResourceAllocation(
            allocation_id=allocation_id,
            api_calls_allocated=api_alloc["total"],
            api_calls_per_minute=api_alloc["per_minute"],
            compute_steps_allocated=compute_alloc["total"],
            compute_steps_per_minute=compute_alloc["per_minute"],
            gpu_memory_mb=gpu_alloc,
            research_budget_minutes=research_budget,
            agent_spawn_budget=agent_budget,
            priority_level=priority,
            time_limit_minutes=time_limit,
            soft_limit=complexity_score < 0.7,
            hard_limit=complexity_score >= 0.7,
            metadata={
                "complexity_score": complexity_score,
                "has_external_deps": profile.has_external_dependencies if profile else False,
            },
        )

        self._store_allocation(allocation)
        return allocation

    def _allocate_api_calls(self, complexity_score: float, profile: TaskProfile | None) -> Dict[str, int]:
        """Allocate API call budget."""
        min_api = self._resource_limits["min_per_task_api"]
        max_api = self._resource_limits["max_per_task_api"]

        # Scale with complexity
        base_api = int(min_api + (max_api - min_api) * complexity_score)

        # Increase if external dependencies
        multiplier = 1.5 if profile and profile.has_external_dependencies else 1.0

        total = int(base_api * multiplier)
        total = max(min_api, min(max_api, total))

        per_minute = max(1, total // 10)

        return {"total": total, "per_minute": per_minute}

    def _allocate_compute_steps(self, complexity_score: float, profile: TaskProfile | None) -> Dict[str, int]:
        """Allocate compute steps budget."""
        min_compute = self._resource_limits["min_per_task_compute"]
        max_compute = self._resource_limits["max_per_task_compute"]

        # Scale with complexity
        base_compute = int(min_compute + (max_compute - min_compute) * complexity_score)

        # Increase if high reasoning intensity
        if profile and profile.reasoning_intensity > 0.7:
            base_compute = int(base_compute * 1.4)

        total = max(min_compute, min(max_compute, base_compute))
        per_minute = max(10, total // 20)

        return {"total": total, "per_minute": per_minute}

    def _allocate_gpu_memory(self, complexity_score: float, profile: TaskProfile | None) -> int:
        """Allocate GPU memory (MB)."""
        total_gpu = self._resource_limits["total_gpu_memory_mb"]

        # Reserve base for system
        reserved = 512
        available = total_gpu - reserved

        # Allocate based on complexity and code generation
        if profile and profile.has_code_generation:
            gpu_needed = int(available * complexity_score * 0.8)
        else:
            gpu_needed = int(available * complexity_score * 0.3)

        return max(128, min(available, gpu_needed))

    def _allocate_research_budget(self, complexity_score: float, profile: TaskProfile | None) -> int:
        """Allocate research time budget (minutes)."""
        if not profile or not profile.has_research_requirements:
            return 0

        # Research time scales steeply with complexity
        base_minutes = 5 + int(complexity_score * 55)
        return base_minutes

    def _allocate_agent_budget(self, complexity_score: float) -> int:
        """How many agents can be spawned for this task."""
        if complexity_score < 0.3:
            return 1
        elif complexity_score < 0.5:
            return 2
        elif complexity_score < 0.7:
            return 4
        else:
            return 8

    def _compute_priority(self, complexity_score: float, profile: TaskProfile | None) -> str:
        """Determine task priority level."""
        if complexity_score < 0.2:
            return "low"
        elif complexity_score < 0.6:
            return "normal"
        elif complexity_score < 0.85:
            return "high"
        else:
            return "critical"

    def _compute_time_limit(self, complexity_score: float, profile: TaskProfile | None) -> int:
        """Maximum execution time in minutes."""
        # Simple tasks: 5 min
        # Moderate: 15 min
        # Complex: 30 min
        # Expert: 60 min
        base = 5 + complexity_score * 55
        return int(base)

    def _store_allocation(self, allocation: ResourceAllocation) -> None:
        """Store allocation in memory."""
        self._memory.remember_long_term(
            key=f"resource_allocation:{allocation.allocation_id}",
            value={
                "allocation_id": allocation.allocation_id,
                "api_calls_allocated": allocation.api_calls_allocated,
                "compute_steps_allocated": allocation.compute_steps_allocated,
                "gpu_memory_mb": allocation.gpu_memory_mb,
                "priority_level": allocation.priority_level,
                "time_limit_minutes": allocation.time_limit_minutes,
            },
            source="cognitive_budget.compute_allocator",
            importance=0.75,
            tags=["compute", "resource", "allocation"],
        )
