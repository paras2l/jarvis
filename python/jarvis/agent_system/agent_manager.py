"""Lifecycle, monitoring, and scaling manager for Jarvis multi-agent fleet."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional

from jarvis.agent_system.agent_core import AgentCapability, AgentCore, AgentStatus
from jarvis.agent_system.agent_registry import AgentRegistry
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class AgentManager:
    """Manages initialization, health monitoring, and dynamic scaling of agents."""

    registry: AgentRegistry
    memory_system: Optional[MemorySystem] = None
    autoscale_enabled: bool = True
    min_agents: int = 1
    max_agents: int = 24

    def initialize_default_agents(self) -> List[AgentCore]:
        """Create a default workforce aligned with planning and action stages."""

        default_specs = [
            {
                "name": "Research Analyst",
                "role": "reasoning",
                "capabilities": [
                    AgentCapability("research", 0.9, ["analysis", "fact_check"]),
                    AgentCapability("reasoning", 0.85, ["inference"]),
                ],
            },
            {
                "name": "Plan Designer",
                "role": "planning",
                "capabilities": [
                    AgentCapability("planning", 0.9, ["task_breakdown"]),
                    AgentCapability("optimization", 0.75, ["scheduling"]),
                ],
            },
            {
                "name": "Action Operator",
                "role": "action",
                "capabilities": [
                    AgentCapability("execution", 0.85, ["automation", "tool_use"]),
                    AgentCapability("monitoring", 0.75, ["status_tracking"]),
                ],
            },
        ]

        agents: List[AgentCore] = []
        for spec in default_specs:
            agent = AgentCore.create(
                name=spec["name"],
                role=spec["role"],
                capabilities=spec["capabilities"],
                metadata={"origin": "agent_manager.initialize_default_agents"},
            )
            self.registry.register_agent(agent)
            agents.append(agent)

        self._persist_registry_snapshot()
        return agents

    def add_agent(
        self,
        name: str,
        role: str,
        capabilities: List[AgentCapability],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentCore:
        """Dynamically add a new specialized agent at runtime."""

        if len(self.registry.agents) >= self.max_agents:
            raise ValueError("Maximum agent limit reached")

        agent = AgentCore.create(
            name=name,
            role=role,
            capabilities=capabilities,
            metadata=metadata or {},
        )
        self.registry.register_agent(agent)
        self._persist_registry_snapshot()
        return agent

    def remove_agent(self, agent_id: str) -> bool:
        if len(self.registry.agents) <= self.min_agents:
            return False

        removed = self.registry.unregister_agent(agent_id)
        if removed is None:
            return False

        self._persist_registry_snapshot()
        return True

    def monitor_agents(self) -> Dict[str, Any]:
        """Return current health and workload summary across all agents."""

        snapshots = [agent.health_snapshot() for agent in self.registry.all_agents()]
        total = len(snapshots)
        idle = sum(1 for item in snapshots if item["status"] == AgentStatus.IDLE.value)
        busy = sum(1 for item in snapshots if item["status"] == AgentStatus.BUSY.value)
        degraded = sum(1 for item in snapshots if item["status"] == AgentStatus.DEGRADED.value)
        queued = sum(int(item["queue_depth"]) for item in snapshots)

        summary = {
            "total_agents": total,
            "idle_agents": idle,
            "busy_agents": busy,
            "degraded_agents": degraded,
            "total_queue_depth": queued,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "agents": snapshots,
        }

        if self.autoscale_enabled:
            summary["autoscale_action"] = self._autoscale_decision(summary)

        self._persist_monitoring_summary(summary)
        return summary

    def scale_if_needed(self) -> Dict[str, Any]:
        """Scale agent fleet based on queue and utilization heuristics."""

        health = self.monitor_agents()
        action = health.get("autoscale_action", {"action": "none"})

        if action.get("action") == "scale_out":
            created = self._scale_out(
                role=str(action.get("role", "generalist")),
                capability_name=str(action.get("capability", "general")),
                count=int(action.get("count", 1)),
            )
            return {"action": "scale_out", "created_agents": [a.agent_id for a in created]}

        if action.get("action") == "scale_in":
            removed = self._scale_in(count=int(action.get("count", 1)))
            return {"action": "scale_in", "removed_agents": removed}

        return {"action": "none"}

    def _autoscale_decision(self, summary: Mapping[str, Any]) -> Dict[str, Any]:
        total = int(summary.get("total_agents", 0))
        queue_depth = int(summary.get("total_queue_depth", 0))
        busy = int(summary.get("busy_agents", 0))

        utilization = (busy / float(total)) if total > 0 else 0.0

        if queue_depth >= max(3, total * 2) and total < self.max_agents:
            return {
                "action": "scale_out",
                "count": 1,
                "role": "execution",
                "capability": "execution",
                "reason": "Queue depth high relative to current capacity",
            }

        if queue_depth == 0 and utilization < 0.2 and total > self.min_agents:
            return {
                "action": "scale_in",
                "count": 1,
                "reason": "Sustained low utilization and no queued work",
            }

        return {"action": "none", "reason": "Capacity is balanced"}

    def _scale_out(self, role: str, capability_name: str, count: int) -> List[AgentCore]:
        created: List[AgentCore] = []
        for index in range(max(0, count)):
            if len(self.registry.agents) >= self.max_agents:
                break
            capability = AgentCapability(name=capability_name, proficiency=0.72, tags=[role, "autoscaled"])
            agent = self.add_agent(
                name=f"{role.title()} Auto Agent {index + 1}",
                role=role,
                capabilities=[capability],
                metadata={"autoscaled": True},
            )
            created.append(agent)
        return created

    def _scale_in(self, count: int) -> List[str]:
        removable = [
            agent for agent in self.registry.all_agents()
            if not agent.task_queue and agent.status == AgentStatus.IDLE
        ]

        removed_ids: List[str] = []
        for agent in removable[: max(0, count)]:
            if len(self.registry.agents) <= self.min_agents:
                break
            if self.remove_agent(agent.agent_id):
                removed_ids.append(agent.agent_id)

        return removed_ids

    def _persist_registry_snapshot(self) -> None:
        if self.memory_system is None:
            return
        self.memory_system.remember_long_term(
            key="agent_system:registry_snapshot",
            value=self.registry.registry_snapshot(),
            source="agent_manager.registry",
            importance=0.75,
            tags=["agent_system", "registry"],
        )

    def _persist_monitoring_summary(self, summary: Mapping[str, Any]) -> None:
        if self.memory_system is None:
            return
        self.memory_system.remember_short_term(
            key="agent_system:monitoring_summary",
            value=dict(summary),
            tags=["agent_system", "monitoring"],
        )
