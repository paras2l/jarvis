"""Cognitive Budget System package.

Controls computational resource allocation across the Pixi AI architecture.
Manages:
- Reasoning depth and recursion
- Agent spawning limits
- API and compute budgets
- System load monitoring
- Resource consumption tracking
"""

from Pixi.cognitive_budget.agent_limit_controller import AgentLimitController, AgentLimitPolicy
from Pixi.cognitive_budget.budget_core import BudgetAllocation, BudgetCore, BudgetPolicy
from Pixi.cognitive_budget.compute_allocator import ComputeAllocator, ResourceAllocation
from Pixi.cognitive_budget.monitoring_dashboard import (
    BudgetAlert,
    MonitoringDashboard,
    ResourceMetric,
    SystemHealthSnapshot,
)
from Pixi.cognitive_budget.reasoning_depth_manager import (
    ReasoningCycleRecord,
    ReasoningDepthManager,
    ReasoningDepthPolicy,
)
from Pixi.cognitive_budget.task_complexity_estimator import (
    TaskComplexityEstimator,
    TaskProfile,
)

__all__ = [
    "BudgetCore",
    "BudgetPolicy",
    "BudgetAllocation",
    "TaskComplexityEstimator",
    "TaskProfile",
    "ComputeAllocator",
    "ResourceAllocation",
    "AgentLimitController",
    "AgentLimitPolicy",
    "ReasoningDepthManager",
    "ReasoningDepthPolicy",
    "ReasoningCycleRecord",
    "MonitoringDashboard",
    "SystemHealthSnapshot",
    "ResourceMetric",
    "BudgetAlert",
]

