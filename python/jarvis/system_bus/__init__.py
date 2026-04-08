"""System Bus package for Jarvis.

Provides the shared communication layer used by the brain loop, reasoning,
planning, agent, action, simulation, goal, memory, and self-improvement systems.
"""

from jarvis.system_bus.bus_core import BusDeliveryReceipt, BusMessage, SystemBus
from jarvis.system_bus.event_stream import BusEvent, EventStream
from jarvis.system_bus.message_router import BusRoute, MessageRouter, RoutingReport
from jarvis.system_bus.module_registry import ModuleEndpoint, ModuleRegistry
from jarvis.system_bus.protocol_manager import BusProtocol, ProtocolManager

__all__ = [
    "BusDeliveryReceipt",
    "BusEvent",
    "BusMessage",
    "BusProtocol",
    "BusRoute",
    "EventStream",
    "MessageRouter",
    "ModuleEndpoint",
    "ModuleRegistry",
    "ProtocolManager",
    "RoutingReport",
    "SystemBus",
]
