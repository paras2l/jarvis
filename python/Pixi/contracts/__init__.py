"""Contract System for Pixi module communication.

These contracts define validated payload schemas used across:
- internal module communication
- System Bus events
- REST and WebSocket API boundaries
"""

from Pixi.contracts.agent_contract import ensure_agent_result_contract, validate_agent_result_contract
from Pixi.contracts.api_contract import ensure_transport_message_contract, validate_transport_message_contract
from Pixi.contracts.memory_contract import ensure_memory_entry_contract, validate_memory_entry_contract
from Pixi.contracts.system_event_contract import ensure_system_event_contract, validate_system_event_contract
from Pixi.contracts.task_contract import ensure_task_contract, validate_task_contract

__all__ = [
    "ensure_agent_result_contract",
    "ensure_memory_entry_contract",
    "ensure_system_event_contract",
    "ensure_task_contract",
    "ensure_transport_message_contract",
    "validate_agent_result_contract",
    "validate_memory_entry_contract",
    "validate_system_event_contract",
    "validate_task_contract",
    "validate_transport_message_contract",
]

