"""Route System Bus messages to registered modules and handlers."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping

from Pixi.contracts.agent_contract import validate_agent_result_contract
from Pixi.contracts.memory_contract import validate_memory_entry_contract
from Pixi.contracts.system_event_contract import validate_system_event_contract
from Pixi.contracts.task_contract import validate_task_contract
from Pixi.system_bus.module_registry import ModuleEndpoint, ModuleRegistry
from Pixi.system_bus.protocol_manager import BusMessage, ProtocolManager


@dataclass(slots=True)
class BusRoute:
    route_id: str
    message_id: str
    topic: str
    target_module_id: str
    target_name: str
    subsystem: str
    reason: str
    priority: int
    handled: bool = False
    response: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class RoutingReport:
    message_id: str
    topic: str
    delivered: int
    failed: int
    routes: List[BusRoute] = field(default_factory=list)
    fallback_used: bool = False
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)


class MessageRouter:
    """Resolves destinations for bus messages and invokes module handlers."""

    def __init__(self, protocol_manager: ProtocolManager, module_registry: ModuleRegistry) -> None:
        self._protocols = protocol_manager
        self._modules = module_registry
        self._route_counter = 0

    def route(self, message: Mapping[str, Any] | BusMessage) -> RoutingReport:
        normalized = self._protocols.normalize_message(message)
        validation = self._protocols.validate_message(normalized)
        targets = self._resolve_targets(normalized)
        routes: List[BusRoute] = []
        failures = 0

        if not validation.valid:
            fallback = self._fallback_route(normalized, ", ".join(validation.reasons))
            return RoutingReport(
                message_id=normalized.message_id,
                topic=normalized.topic,
                delivered=0,
                failed=1,
                routes=[fallback],
                fallback_used=True,
                metadata={"validation": validation.reasons, "protocol": validation.protocol_name},
            )

        if not targets:
            targets = self._modules.find_by_topic(normalized.topic)

        if not targets and normalized.target:
            resolved = self._modules.resolve(normalized.target)
            targets = [resolved] if resolved is not None else []

        if not targets:
            fallback = self._fallback_route(normalized, "no module matched topic or target")
            return RoutingReport(
                message_id=normalized.message_id,
                topic=normalized.topic,
                delivered=0,
                failed=1,
                routes=[fallback],
                fallback_used=True,
                metadata={"protocol": validation.protocol_name},
            )

        for module in self._sort_targets(targets, normalized.priority):
            route = self._deliver(normalized, module)
            routes.append(route)
            if not route.handled:
                failures += 1

        return RoutingReport(
            message_id=normalized.message_id,
            topic=normalized.topic,
            delivered=sum(1 for route in routes if route.handled),
            failed=failures,
            routes=routes,
            fallback_used=False,
            metadata={"protocol": validation.protocol_name, "target_count": len(targets)},
        )

    def broadcast(self, message: Mapping[str, Any] | BusMessage, extra_topics: Iterable[str] | None = None) -> List[RoutingReport]:
        normalized = self._protocols.normalize_message(message)
        reports = [self.route(normalized)]
        for topic in extra_topics or []:
            copy = self._protocols.create_message(
                source=normalized.source,
                topic=topic,
                payload=dict(normalized.payload),
                message_type=normalized.message_type,
                target=normalized.target,
                correlation_id=normalized.correlation_id,
                reply_to=normalized.reply_to,
                priority=normalized.priority,
                headers=dict(normalized.headers),
                metadata=dict(normalized.metadata),
                tags=list(normalized.tags),
            )
            reports.append(self.route(copy))
        return reports

    def describe_routes(self) -> Dict[str, Any]:
        return {
            "route_count": self._route_counter,
            "registered_modules": self._modules.describe(),
            "protocols": self._protocols.summarize(),
        }

    def _resolve_targets(self, message: BusMessage) -> List[ModuleEndpoint]:
        if message.target:
            resolved = self._modules.resolve(message.target)
            return [resolved] if resolved is not None else []

        topic_targets = self._modules.find_by_topic(message.topic)
        if topic_targets:
            return topic_targets

        head = message.topic.split(".", 1)[0]
        return self._modules.modules_by_subsystem(head)

    def _deliver(self, message: BusMessage, module: ModuleEndpoint) -> BusRoute:
        self._route_counter += 1
        route_id = f"route-{self._route_counter}"

        valid, reasons = self._validate_for_topic(message.topic, message.payload)
        if not valid:
            return BusRoute(
                route_id=route_id,
                message_id=message.message_id,
                topic=message.topic,
                target_module_id=module.module_id,
                target_name=module.name,
                subsystem=module.subsystem,
                reason="contract_validation_failed",
                priority=message.priority,
                handled=False,
                response={"error": "contract_validation_failed", "details": reasons},
            )

        if module.handler is None:
            return BusRoute(
                route_id=route_id,
                message_id=message.message_id,
                topic=message.topic,
                target_module_id=module.module_id,
                target_name=module.name,
                subsystem=module.subsystem,
                reason="module has no handler",
                priority=message.priority,
                handled=False,
            )

        try:
            response = module.handler(dict(message.payload))
            module.status = "online"
            module.last_seen_at = datetime.now(timezone.utc).isoformat()
            return BusRoute(
                route_id=route_id,
                message_id=message.message_id,
                topic=message.topic,
                target_module_id=module.module_id,
                target_name=module.name,
                subsystem=module.subsystem,
                reason="handler executed",
                priority=message.priority,
                handled=True,
                response={"output": response},
            )
        except Exception as exc:  # noqa: BLE001
            module.status = "degraded"
            module.metadata["last_error"] = str(exc)
            return BusRoute(
                route_id=route_id,
                message_id=message.message_id,
                topic=message.topic,
                target_module_id=module.module_id,
                target_name=module.name,
                subsystem=module.subsystem,
                reason=str(exc),
                priority=message.priority,
                handled=False,
                response={"error": str(exc)},
            )

    def _fallback_route(self, message: BusMessage, reason: str) -> BusRoute:
        self._route_counter += 1
        return BusRoute(
            route_id=f"route-{self._route_counter}",
            message_id=message.message_id,
            topic=message.topic,
            target_module_id=message.target or "unrouted",
            target_name=message.target or "unrouted",
            subsystem="general",
            reason=reason,
            priority=message.priority,
            handled=False,
            response={"payload": dict(message.payload)},
        )

    @staticmethod
    def _sort_targets(targets: List[ModuleEndpoint], priority: int) -> List[ModuleEndpoint]:
        return sorted(targets, key=lambda row: (row.status != "online", row.subsystem, row.name, -priority))

    @staticmethod
    def _validate_for_topic(topic: str, payload: Mapping[str, Any]) -> tuple[bool, List[str]]:
        lowered = topic.strip().lower()
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

