"""Inter-agent communication and shared message channels."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional
from uuid import uuid4


@dataclass(slots=True)
class AgentMessage:
    """One communication unit between agents."""

    message_id: str
    sender_agent_id: str
    recipient_agent_id: Optional[str]
    channel: str
    topic: str
    payload: Dict[str, Any]
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass(slots=True)
class AgentCommunicationBus:
    """Message bus supporting direct and channel-based communication."""

    channels: Dict[str, List[AgentMessage]] = field(default_factory=dict)
    inboxes: Dict[str, List[AgentMessage]] = field(default_factory=dict)
    broadcasts: List[AgentMessage] = field(default_factory=list)

    def send_direct(
        self,
        sender_agent_id: str,
        recipient_agent_id: str,
        topic: str,
        payload: Mapping[str, Any],
    ) -> AgentMessage:
        message = AgentMessage(
            message_id=str(uuid4()),
            sender_agent_id=sender_agent_id,
            recipient_agent_id=recipient_agent_id,
            channel="direct",
            topic=topic,
            payload=dict(payload),
        )
        self.inboxes.setdefault(recipient_agent_id, []).append(message)
        return message

    def publish(
        self,
        sender_agent_id: str,
        channel: str,
        topic: str,
        payload: Mapping[str, Any],
    ) -> AgentMessage:
        message = AgentMessage(
            message_id=str(uuid4()),
            sender_agent_id=sender_agent_id,
            recipient_agent_id=None,
            channel=channel,
            topic=topic,
            payload=dict(payload),
        )
        self.channels.setdefault(channel, []).append(message)
        self.broadcasts.append(message)
        return message

    def collect_inbox(self, agent_id: str) -> List[AgentMessage]:
        messages = self.inboxes.get(agent_id, [])
        self.inboxes[agent_id] = []
        return messages

    def read_channel(self, channel: str, limit: int = 20) -> List[AgentMessage]:
        entries = self.channels.get(channel, [])
        if limit <= 0:
            return entries
        return entries[-limit:]

    def share_task_result(
        self,
        sender_agent_id: str,
        task_id: str,
        result_payload: Mapping[str, Any],
    ) -> AgentMessage:
        return self.publish(
            sender_agent_id=sender_agent_id,
            channel="task_results",
            topic=f"task:{task_id}:result",
            payload={"task_id": task_id, "result": dict(result_payload)},
        )

    def request_collaboration(
        self,
        sender_agent_id: str,
        recipient_agent_id: str,
        task_id: str,
        request_payload: Mapping[str, Any],
    ) -> AgentMessage:
        return self.send_direct(
            sender_agent_id=sender_agent_id,
            recipient_agent_id=recipient_agent_id,
            topic=f"task:{task_id}:collaboration_request",
            payload={"task_id": task_id, "request": dict(request_payload)},
        )

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "channels": {name: len(messages) for name, messages in self.channels.items()},
            "inboxes": {agent_id: len(messages) for agent_id, messages in self.inboxes.items()},
            "broadcast_count": len(self.broadcasts),
        }
