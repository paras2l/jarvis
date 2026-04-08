"""Jarvis Multi-Agent System package.

Execution flow:
- Planner generates tasks
- Task dispatcher assigns tasks to best-fit agents
- Agents execute tasks with tools
- Agents share results over communication bus
- Results return to planner and reasoning layers
"""

from jarvis.agent_system.agent_communication import AgentCommunicationBus, AgentMessage
from jarvis.agent_system.agent_core import (
    AgentCapability,
    AgentCore,
    AgentStatus,
    AgentTask,
    AgentTaskResult,
    AgentTool,
    TaskStatus,
)
from jarvis.agent_system.agent_manager import AgentManager
from jarvis.agent_system.agent_registry import AgentRegistry
from jarvis.agent_system.capability_router import CapabilityRoute, CapabilityRouter
from jarvis.agent_system.task_dispatcher import DispatchRecord, TaskDispatcher

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
