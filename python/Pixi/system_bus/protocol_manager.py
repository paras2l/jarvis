"""Communication protocol definitions for the Pixi System Bus."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping, Optional
from uuid import uuid4


@dataclass(slots=True)
class BusProtocol:
    """Protocol describing the shape and routing rules for one message family."""

    name: str
    version: str = "1.0"
    description: str = ""
    domains: List[str] = field(default_factory=list)
    allowed_types: List[str] = field(default_factory=lambda: ["command", "event", "query", "response", "notification"])
    required_fields: List[str] = field(default_factory=lambda: ["message_id", "source", "topic", "message_type", "payload"])
    optional_fields: List[str] = field(default_factory=lambda: ["target", "correlation_id", "reply_to", "priority", "metadata", "headers", "tags"])


@dataclass(slots=True)
class BusMessage:
    """Normalized envelope that flows across the system bus."""

    message_id: str
    source: str
    topic: str
    message_type: str
    payload: Dict[str, Any]
    target: str | None = None
    correlation_id: str | None = None
    reply_to: str | None = None
    priority: int = 50
    headers: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class ProtocolValidationResult:
    protocol_name: str
    valid: bool
    reasons: List[str] = field(default_factory=list)
    normalized: BusMessage | None = None


class ProtocolManager:
    """Validates, normalizes, and catalogs bus protocols."""

    def __init__(self) -> None:
        self._protocols: Dict[str, BusProtocol] = {}
        self._topic_map: Dict[str, str] = {}
        self._register_defaults()

    def register_protocol(self, protocol: BusProtocol) -> None:
        self._protocols[protocol.name] = protocol
        for domain in protocol.domains:
            self._topic_map[domain.strip().lower()] = protocol.name

    def has_protocol(self, name: str) -> bool:
        return name in self._protocols

    def get_protocol(self, name: str) -> BusProtocol | None:
        return self._protocols.get(name)

    def resolve_protocol_for_topic(self, topic: str) -> BusProtocol:
        head = topic.split(".", 1)[0].strip().lower()
        protocol_name = self._topic_map.get(head)
        if protocol_name and protocol_name in self._protocols:
            return self._protocols[protocol_name]
        return self._protocols["general"]

    def validate_message(self, message: Mapping[str, Any] | BusMessage) -> ProtocolValidationResult:
        normalized = self.normalize_message(message)
        protocol = self.resolve_protocol_for_topic(normalized.topic)
        reasons: List[str] = []

        if normalized.message_type not in protocol.allowed_types:
            reasons.append(f"unsupported message_type={normalized.message_type}")

        for field_name in protocol.required_fields:
            value = getattr(normalized, field_name, None)
            if field_name == "target":
                continue
            if value is None or value == "":
                reasons.append(f"missing required field={field_name}")

        if not normalized.topic.strip():
            reasons.append("topic cannot be empty")
        if not normalized.source.strip():
            reasons.append("source cannot be empty")

        return ProtocolValidationResult(
            protocol_name=protocol.name,
            valid=not reasons,
            reasons=reasons,
            normalized=normalized,
        )

    def normalize_message(self, message: Mapping[str, Any] | BusMessage) -> BusMessage:
        if isinstance(message, BusMessage):
            return message

        payload = dict(message.get("payload", {}))
        headers = dict(message.get("headers", {}))
        metadata = dict(message.get("metadata", {}))
        tags = [str(item) for item in message.get("tags", [])]

        return BusMessage(
            message_id=str(message.get("message_id") or f"msg-{uuid4().hex[:12]}"),
            source=str(message.get("source") or "unknown"),
            topic=str(message.get("topic") or message.get("channel") or message.get("target") or "general"),
            message_type=str(message.get("message_type") or message.get("kind") or "event"),
            payload=payload,
            target=(None if message.get("target") in {None, ""} else str(message.get("target"))),
            correlation_id=(None if message.get("correlation_id") in {None, ""} else str(message.get("correlation_id"))),
            reply_to=(None if message.get("reply_to") in {None, ""} else str(message.get("reply_to"))),
            priority=int(message.get("priority", 50) or 50),
            headers=headers,
            metadata=metadata,
            tags=tags,
        )

    def create_message(
        self,
        *,
        source: str,
        topic: str,
        payload: Dict[str, Any],
        message_type: str = "event",
        target: str | None = None,
        correlation_id: str | None = None,
        reply_to: str | None = None,
        priority: int = 50,
        headers: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        tags: Optional[Iterable[str]] = None,
    ) -> BusMessage:
        message = BusMessage(
            message_id=f"msg-{uuid4().hex[:12]}",
            source=source,
            topic=topic,
            message_type=message_type,
            payload=dict(payload),
            target=target,
            correlation_id=correlation_id,
            reply_to=reply_to,
            priority=max(0, min(100, int(priority))),
            headers=dict(headers or {}),
            metadata=dict(metadata or {}),
            tags=[str(item) for item in (tags or [])],
        )
        return message

    def summarize(self) -> Dict[str, Any]:
        return {
            "protocol_count": len(self._protocols),
            "topic_routes": dict(self._topic_map),
            "protocols": [
                {
                    "name": protocol.name,
                    "version": protocol.version,
                    "domains": list(protocol.domains),
                    "allowed_types": list(protocol.allowed_types),
                }
                for protocol in self._protocols.values()
            ],
        }

    def _register_defaults(self) -> None:
        self.register_protocol(BusProtocol(name="general", description="Fallback protocol for system bus messages", domains=["general", "bus"]))
        self.register_protocol(BusProtocol(name="brain_loop", description="Brain loop coordination protocol", domains=["brain", "brain_loop", "cognitive"]))
        self.register_protocol(BusProtocol(name="reasoning", description="Reasoning engine coordination protocol", domains=["reasoning", "reasoning_engine"]))
        self.register_protocol(BusProtocol(name="planning", description="Planning system coordination protocol", domains=["planning", "planner", "goal_planning"]))
        self.register_protocol(BusProtocol(name="agent", description="Multi-agent system coordination protocol", domains=["agent", "agent_system", "multi_agent"]))
        self.register_protocol(BusProtocol(name="action", description="Action system coordination protocol", domains=["action", "execution", "orchestration"]))
        self.register_protocol(BusProtocol(name="simulation", description="Simulation engine coordination protocol", domains=["simulation", "world_model", "scenario"]))
        self.register_protocol(BusProtocol(name="goal", description="Goal manager protocol", domains=["goal", "goal_manager", "objective"]))
        self.register_protocol(BusProtocol(name="memory", description="Memory system protocol", domains=["memory", "knowledge"]))
        self.register_protocol(BusProtocol(name="self_improvement", description="Self-improvement and learning protocol", domains=["self_improvement", "learning", "tool_learning"]))
        self.register_protocol(BusProtocol(name="interfaces", description="Voice, chat, and command interfaces", domains=["voice", "chat", "commands", "uci"]))

