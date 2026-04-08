"""Central communication hub for the Jarvis AI architecture."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, List, Mapping, Optional

from jarvis.contracts.agent_contract import validate_agent_result_contract
from jarvis.contracts.api_contract import validate_transport_message_contract
from jarvis.contracts.memory_contract import validate_memory_entry_contract
from jarvis.contracts.system_event_contract import validate_system_event_contract
from jarvis.contracts.task_contract import validate_task_contract
from jarvis.memory.memory_system import MemorySystem
from jarvis.system_bus.event_stream import BusEvent, EventStream
from jarvis.system_bus.message_router import MessageRouter, RoutingReport
from jarvis.system_bus.module_registry import ModuleEndpoint, ModuleRegistry
from jarvis.system_bus.protocol_manager import BusMessage, ProtocolManager


@dataclass(slots=True)
class BusDeliveryReceipt:
    message_id: str
    topic: str
    source: str
    delivered: int
    failed: int
    routed: bool
    event_id: str | None = None
    routing: RoutingReport | None = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SystemBus:
    """Communication backbone connecting Jarvis subsystems."""

    def __init__(self, memory: MemorySystem | None = None) -> None:
        self.memory = memory or MemorySystem()
        self.protocols = ProtocolManager()
        self.registry = ModuleRegistry(memory=self.memory)
        self.events = EventStream(memory=self.memory)
        self.router = MessageRouter(self.protocols, self.registry)
        self._delivery_log: List[BusDeliveryReceipt] = []

    def register_module(
        self,
        module_id: str,
        name: str,
        subsystem: str,
        *,
        status: str = "online",
        endpoint_kind: str = "handler",
        capabilities: Iterable[str] | None = None,
        topics: Iterable[str] | None = None,
        aliases: Iterable[str] | None = None,
        metadata: Optional[Dict[str, Any]] = None,
        handler: Callable[[Dict[str, Any]], Any] | None = None,
    ) -> ModuleEndpoint:
        module = self.registry.register_module(
            module_id=module_id,
            name=name,
            subsystem=subsystem,
            status=status,
            endpoint_kind=endpoint_kind,
            capabilities=capabilities,
            topics=topics,
            aliases=aliases,
            metadata=metadata,
            handler=handler,
        )
        self.events.publish(
            event_type="module.registered",
            source=module_id,
            payload={"module_id": module.module_id, "subsystem": module.subsystem, "name": module.name},
            topic=f"{module.subsystem}.registered",
            severity="info",
            tags=["system_bus", "module"],
        )
        return module

    def attach_handler(self, module_id: str, handler: Callable[[Dict[str, Any]], Any]) -> None:
        self.registry.attach_handler(module_id, handler)

    def send(
        self,
        source: str,
        topic: str,
        payload: Mapping[str, Any],
        *,
        target: str | None = None,
        message_type: str = "event",
        priority: int = 50,
        correlation_id: str | None = None,
        reply_to: str | None = None,
        headers: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[Iterable[str]] = None,
    ) -> BusDeliveryReceipt:
        payload_valid, payload_reasons = self._validate_domain_payload(topic=topic, payload=payload)
        if not payload_valid:
            return BusDeliveryReceipt(
                message_id=f"rejected-{datetime.now(timezone.utc).timestamp()}",
                topic=topic,
                source=source,
                delivered=0,
                failed=1,
                routed=False,
                metadata={"reason": "domain_contract_validation_failed", "details": payload_reasons},
            )

        message = self.protocols.create_message(
            source=source,
            topic=topic,
            payload=dict(payload),
            message_type=message_type,
            target=target,
            priority=priority,
            correlation_id=correlation_id,
            reply_to=reply_to,
            headers=headers,
            metadata=metadata,
            tags=tags,
        )
        return self.dispatch(message)

    def dispatch(self, message: Mapping[str, Any] | BusMessage) -> BusDeliveryReceipt:
        normalized = self.protocols.normalize_message(message)

        envelope_valid, envelope_reasons = self._validate_internal_envelope(normalized)
        if not envelope_valid:
            return BusDeliveryReceipt(
                message_id=normalized.message_id,
                topic=normalized.topic,
                source=normalized.source,
                delivered=0,
                failed=1,
                routed=False,
                metadata={"reason": "transport_contract_validation_failed", "details": envelope_reasons},
            )

        payload_valid, payload_reasons = self._validate_domain_payload(
            topic=normalized.topic,
            payload=normalized.payload,
        )
        if not payload_valid:
            return BusDeliveryReceipt(
                message_id=normalized.message_id,
                topic=normalized.topic,
                source=normalized.source,
                delivered=0,
                failed=1,
                routed=False,
                metadata={"reason": "domain_contract_validation_failed", "details": payload_reasons},
            )

        routing = self.router.route(normalized)
        event = self.events.publish(
            event_type=f"bus.{normalized.message_type}",
            source=normalized.source,
            payload={
                "message_id": normalized.message_id,
                "topic": normalized.topic,
                "target": normalized.target,
                "payload": dict(normalized.payload),
                "routing": routing.metadata,
            },
            severity=self._severity_for_routing(routing),
            topic=normalized.topic,
            correlation_id=normalized.correlation_id,
            tags=list(normalized.tags) or ["system_bus"],
            metadata=dict(normalized.metadata),
        )

        receipt = BusDeliveryReceipt(
            message_id=normalized.message_id,
            topic=normalized.topic,
            source=normalized.source,
            delivered=routing.delivered,
            failed=routing.failed,
            routed=True,
            event_id=event.event_id,
            routing=routing,
            metadata={"message_type": normalized.message_type, "target": normalized.target},
        )
        self._delivery_log.append(receipt)
        self._persist_receipt(receipt, normalized)
        return receipt

    def publish_event(
        self,
        event_type: str,
        source: str,
        payload: Mapping[str, Any],
        *,
        severity: str = "info",
        topic: str = "",
        correlation_id: str | None = None,
        tags: Optional[Iterable[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> BusEvent:
        event_payload = {
            "event_id": "pending",
            "event_type": event_type,
            "source": source,
            "topic": topic or event_type,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": dict(payload),
        }
        valid, reasons = validate_system_event_contract(event_payload)
        if not valid:
            raise ValueError("System event rejected by contract: " + "; ".join(reasons))

        event = self.events.publish(
            event_type=event_type,
            source=source,
            payload=payload,
            severity=severity,
            topic=topic or event_type,
            correlation_id=correlation_id,
            tags=tags,
            metadata=metadata,
        )
        self._persist_event(event)
        return event

    def subscribe(self, pattern: str, callback: Callable[[BusEvent], Any], *, source: str = "", metadata: Optional[Dict[str, Any]] = None):
        return self.events.subscribe(pattern, callback, source=source, metadata=metadata)

    def register_default_modules(self) -> None:
        self._seed_default_modules()

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "messages": len(self._delivery_log),
            "protocols": self.protocols.summarize(),
            "modules": self.registry.describe(),
            "events": self.events.diagnostics(),
            "recent_deliveries": [
                {
                    "message_id": item.message_id,
                    "topic": item.topic,
                    "source": item.source,
                    "delivered": item.delivered,
                    "failed": item.failed,
                    "event_id": item.event_id,
                    "created_at": item.created_at,
                }
                for item in self._delivery_log[-25:]
            ],
        }

    def _seed_default_modules(self) -> None:
        defaults = [
            ("brain_loop", "Brain Loop", "brain", ["cognition", "runtime", "coordination"]),
            ("reasoning_engine", "Reasoning Engine", "reasoning", ["inference", "decision", "analysis"]),
            ("planning_system", "Planning System", "planning", ["task_breakdown", "scheduling", "execution_plan"]),
            ("agent_system", "Agent System", "agent", ["multi_agent", "task_execution", "collaboration"]),
            ("action_system", "Action System", "action", ["execution", "orchestration", "side_effects"]),
            ("simulation_engine", "Simulation Engine", "simulation", ["forecasting", "scenario", "risk"]),
            ("goal_manager", "Goal Manager", "goal", ["goal_lifecycle", "milestones", "progress"]),
            ("memory_system", "Memory System", "memory", ["storage", "semantic_search", "persistence"]),
            ("self_improvement", "Self-Improvement System", "self_improvement", ["learning", "optimization", "tool_learning"]),
            ("voice_interface", "Voice Interface", "interfaces", ["voice", "speech"]),
            ("chat_interface", "Chat Interface", "interfaces", ["chat", "text"]),
            ("command_interface", "Command Interface", "interfaces", ["commands", "uci"]),
        ]
        for module_id, name, subsystem, capabilities in defaults:
            if self.registry.get_module(module_id) is None:
                self.registry.register_module(
                    module_id=module_id,
                    name=name,
                    subsystem=subsystem,
                    capabilities=capabilities,
                    topics=[subsystem, module_id],
                    aliases=[name, subsystem.replace("_", " ")],
                    status="offline",
                    metadata={"seeded": True},
                )

    @staticmethod
    def _severity_for_routing(routing: RoutingReport) -> str:
        if routing.failed and routing.delivered:
            return "warning"
        if routing.failed and not routing.delivered:
            return "error"
        return "info"

    def _persist_receipt(self, receipt: BusDeliveryReceipt, message: BusMessage) -> None:
        self.memory.remember_short_term(
            key="system_bus:last_delivery",
            value={
                "message_id": receipt.message_id,
                "topic": receipt.topic,
                "source": receipt.source,
                "delivered": receipt.delivered,
                "failed": receipt.failed,
                "routed": receipt.routed,
                "event_id": receipt.event_id,
                "message_type": message.message_type,
            },
            tags=["system_bus", "delivery"],
        )

    def _persist_event(self, event: BusEvent) -> None:
        self.memory.remember_short_term(
            key="system_bus:last_bus_event",
            value={
                "event_id": event.event_id,
                "event_type": event.event_type,
                "source": event.source,
                "topic": event.topic,
                "severity": event.severity,
            },
            tags=["system_bus", "event"],
        )

    def _validate_internal_envelope(self, message: BusMessage) -> tuple[bool, List[str]]:
        envelope = {
            "transport": "internal",
            "direction": "event" if message.message_type == "event" else "request",
            "message_type": message.message_type,
            "timestamp": message.created_at,
            "payload": dict(message.payload),
            "topic": message.topic,
            "source": message.source,
        }
        return validate_transport_message_contract(envelope)

    def _validate_domain_payload(self, *, topic: str, payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
        lowered = topic.strip().lower()
        if not lowered:
            return False, ["topic cannot be empty"]

        if "task" in lowered:
            return validate_task_contract(payload)
        if "agent" in lowered:
            return validate_agent_result_contract(payload)
        if "memory" in lowered or "knowledge" in lowered:
            return validate_memory_entry_contract(payload)
        if "event" in lowered:
            event_shape = {
                "event_id": str(payload.get("event_id", "pending")),
                "event_type": str(payload.get("event_type", lowered)),
                "source": str(payload.get("source", "unknown")),
                "topic": lowered,
                "severity": str(payload.get("severity", "info")),
                "timestamp": str(payload.get("timestamp", datetime.now(timezone.utc).isoformat())),
                "payload": dict(payload.get("payload", payload)),
            }
            return validate_system_event_contract(event_shape)

        return True, []
