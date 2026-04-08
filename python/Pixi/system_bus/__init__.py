"""System Bus package for Pixi.

Provides the shared communication layer used by the brain loop, reasoning,
planning, agent, action, simulation, goal, memory, and self-improvement systems.
"""

from Pixi.system_bus.bus_core import BusDeliveryReceipt, BusMessage, SystemBus
from Pixi.system_bus.event_stream import BusEvent, EventStream
from Pixi.system_bus.message_router import BusRoute, MessageRouter, RoutingReport
from Pixi.system_bus.module_registry import ModuleEndpoint, ModuleRegistry
from Pixi.system_bus.protocol_manager import BusProtocol, ProtocolManager

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

