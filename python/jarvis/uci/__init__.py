"""Unified Command Interface for Jarvis."""

from jarvis.uci.command_parser import CommandAction, ParsedCommand, UnifiedCommandParser
from jarvis.uci.command_router import CommandRoute, RoutingPlan, UnifiedCommandRouter
from jarvis.uci.device_manager import DeviceManager, DeviceProfile
from jarvis.uci.execution_engine import ExecutionResult, UnifiedCommandExecutionEngine, UnifiedCommandInterface
from jarvis.uci.intent_classifier import IntentClassification, UnifiedIntentClassifier

__all__ = [
    "CommandAction",
    "CommandRoute",
    "DeviceManager",
    "DeviceProfile",
    "ExecutionResult",
    "IntentClassification",
    "ParsedCommand",
    "RoutingPlan",
    "UnifiedCommandExecutionEngine",
    "UnifiedCommandInterface",
    "UnifiedCommandParser",
    "UnifiedIntentClassifier",
    "UnifiedCommandRouter",
]