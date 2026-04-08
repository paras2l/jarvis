"""Registry of available agents and capability metadata."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional

from Pixi.agent_system.agent_core import AgentCore, AgentStatus


@dataclass(slots=True)
class AgentRegistry:
    """Maintains all active agents and indexes by capability."""

    agents: Dict[str, AgentCore] = field(default_factory=dict)
    capability_index: Dict[str, List[str]] = field(default_factory=dict)

    def register_agent(self, agent: AgentCore) -> None:
        self.agents[agent.agent_id] = agent
        self._index_agent(agent)

    def unregister_agent(self, agent_id: str) -> Optional[AgentCore]:
        agent = self.agents.pop(agent_id, None)
        if agent is None:
            return None
        self._rebuild_index()
        return agent

    def get_agent(self, agent_id: str) -> Optional[AgentCore]:
        return self.agents.get(agent_id)

    def all_agents(self) -> List[AgentCore]:
        return list(self.agents.values())

    def available_agents(self) -> List[AgentCore]:
        return [a for a in self.agents.values() if a.status in {AgentStatus.IDLE, AgentStatus.BUSY}]

    def agents_by_capability(self, capability: str) -> List[AgentCore]:
        ids = self.capability_index.get(capability.strip().lower(), [])
        return [self.agents[i] for i in ids if i in self.agents]

    def search(
        self,
        required_capabilities: List[str],
        *,
        include_busy: bool = True,
    ) -> List[AgentCore]:
        """Return agents that support at least one required capability."""

        if not required_capabilities:
            candidates = self.available_agents()
            return candidates if include_busy else [a for a in candidates if a.status == AgentStatus.IDLE]

        matched_ids: set[str] = set()
        for capability in required_capabilities:
            for agent in self.agents_by_capability(capability):
                if not include_busy and agent.status != AgentStatus.IDLE:
                    continue
                matched_ids.add(agent.agent_id)

        return [self.agents[agent_id] for agent_id in matched_ids]

    def registry_snapshot(self) -> Dict[str, Any]:
        return {
            "total_agents": len(self.agents),
            "capabilities_indexed": len(self.capability_index),
            "agents": [agent.as_registry_record() for agent in self.agents.values()],
        }

    def load_from_records(self, records: Iterable[Dict[str, Any]]) -> None:
        """Hydrate registry from persisted records.

        This function restores minimal records and leaves tool wiring to manager.
        """

        self.agents.clear()
        self.capability_index.clear()

        from Pixi.agent_system.agent_core import AgentCapability

        for record in records:
            capabilities = [
                AgentCapability(
                    name=str(item.get("name", "unknown")),
                    proficiency=float(item.get("proficiency", 0.6)),
                    tags=[str(t) for t in item.get("tags", [])],
                )
                for item in record.get("capabilities", [])
            ]
            agent = AgentCore(
                agent_id=str(record.get("agent_id")),
                name=str(record.get("name", "Unnamed Agent")),
                role=str(record.get("role", "generalist")),
                capabilities=capabilities,
                metadata=dict(record.get("metadata", {})),
            )
            self.register_agent(agent)

    def _index_agent(self, agent: AgentCore) -> None:
        for capability in agent.capabilities:
            keys = [capability.name] + list(capability.tags)
            for key in keys:
                normalized = key.strip().lower()
                if not normalized:
                    continue
                self.capability_index.setdefault(normalized, [])
                if agent.agent_id not in self.capability_index[normalized]:
                    self.capability_index[normalized].append(agent.agent_id)

    def _rebuild_index(self) -> None:
        self.capability_index.clear()
        for agent in self.agents.values():
            self._index_agent(agent)

