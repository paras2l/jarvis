"""Task-to-agent routing based on capability matching and load."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional

from jarvis.agent_system.agent_core import AgentCore
from jarvis.agent_system.agent_registry import AgentRegistry


@dataclass(slots=True)
class CapabilityRoute:
    """Routing result for one candidate agent."""

    agent_id: str
    score: float
    reason: str


@dataclass(slots=True)
class CapabilityRouter:
    """Computes best-fit candidates for tasks using capability and load heuristics."""

    registry: AgentRegistry

    def route_task(
        self,
        required_capabilities: List[str],
        *,
        context: Optional[Mapping[str, Any]] = None,
        top_k: int = 3,
    ) -> List[CapabilityRoute]:
        """Return top routing candidates sorted by descending score."""

        context = context or {}
        candidates = self.registry.search(required_capabilities, include_busy=True)
        routes: List[CapabilityRoute] = []

        for agent in candidates:
            capability_score = agent.capability_score(required_capabilities)
            load_penalty = min(0.4, len(agent.task_queue) * 0.05)
            health_boost = 0.1 if agent.success_rate() >= 0.8 else 0.0
            priority_bonus = self._priority_bonus(agent, context)

            score = max(0.0, min(1.0, capability_score - load_penalty + health_boost + priority_bonus))
            reason = (
                f"capability={capability_score:.2f}, load_penalty={load_penalty:.2f}, "
                f"health_boost={health_boost:.2f}, priority_bonus={priority_bonus:.2f}"
            )
            routes.append(CapabilityRoute(agent_id=agent.agent_id, score=round(score, 4), reason=reason))

        routes.sort(key=lambda route: route.score, reverse=True)
        return routes[: max(1, top_k)] if routes else []

    def select_best_agent(
        self,
        required_capabilities: List[str],
        *,
        context: Optional[Mapping[str, Any]] = None,
    ) -> Optional[AgentCore]:
        routes = self.route_task(required_capabilities, context=context, top_k=1)
        if not routes:
            return None
        return self.registry.get_agent(routes[0].agent_id)

    def route_batch(
        self,
        tasks: List[Mapping[str, Any]],
        *,
        default_top_k: int = 2,
    ) -> Dict[str, List[CapabilityRoute]]:
        """Route a list of tasks and return candidate sets by task id."""

        results: Dict[str, List[CapabilityRoute]] = {}
        for task in tasks:
            task_id = str(task.get("task_id", task.get("id", "unknown_task")))
            required = [str(item) for item in task.get("required_capabilities", [])]
            context = task.get("context", {}) if isinstance(task.get("context"), dict) else {}
            results[task_id] = self.route_task(required, context=context, top_k=default_top_k)
        return results

    def _priority_bonus(self, agent: AgentCore, context: Mapping[str, Any]) -> float:
        if context.get("prefer_role") and str(context.get("prefer_role")).lower() == agent.role.lower():
            return 0.08
        return 0.0
