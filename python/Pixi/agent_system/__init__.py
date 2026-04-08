"""Pixi Multi-Agent System package.

Execution flow:
- Planner generates tasks
- Task dispatcher assigns tasks to best-fit agents
- Agents execute tasks with tools
- Agents share results over communication bus
- Results return to planner and reasoning layers
"""

from Pixi.agent_system.agent_communication import AgentCommunicationBus, AgentMessage
from Pixi.agent_system.agent_core import (
    AgentCapability,
    AgentCore,
    AgentStatus,
    AgentTask,
    AgentTaskResult,
    AgentTool,
    TaskStatus,
)
from Pixi.agent_system.agent_manager import AgentManager
from Pixi.agent_system.agent_registry import AgentRegistry
from Pixi.agent_system.capability_router import CapabilityRoute, CapabilityRouter
from Pixi.agent_system.task_dispatcher import DispatchRecord, TaskDispatcher

__all__ = [
    "AgentCapability",
    "AgentCommunicationBus",
    "AgentCore",
    "AgentManager",
    "AgentMessage",
    "AgentRegistry",
    "AgentStatus",
    "AgentTask",
    "AgentTaskResult",
    "AgentTool",
    "CapabilityRoute",
    "CapabilityRouter",
    "DispatchRecord",
    "TaskDispatcher",
    "TaskStatus",
]

