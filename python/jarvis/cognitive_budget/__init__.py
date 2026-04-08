"""Cognitive Budget System package.

Controls computational resource allocation across the Jarvis AI architecture.
Manages:
- Reasoning depth and recursion
- Agent spawning limits
- API and compute budgets
- System load monitoring
- Resource consumption tracking
"""

from jarvis.cognitive_budget.agent_limit_controller import AgentLimitController, AgentLimitPolicy
from jarvis.cognitive_budget.budget_core import BudgetAllocation, BudgetCore, BudgetPolicy
from jarvis.cognitive_budget.compute_allocator import ComputeAllocator, ResourceAllocation
from jarvis.cognitive_budget.monitoring_dashboard import (
    BudgetAlert,
    MonitoringDashboard,
    ResourceMetric,
    SystemHealthSnapshot,
)
from jarvis.cognitive_budget.reasoning_depth_manager import (
    ReasoningCycleRecord,
    ReasoningDepthManager,
    ReasoningDepthPolicy,
)
from jarvis.cognitive_budget.task_complexity_estimator import (
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
