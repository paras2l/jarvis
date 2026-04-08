"""Agent spawner for Agent Swarm Lab.

Creates temporary specialized agents for one swarm run with strict limits.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List
import uuid

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class SpawnPolicy:
    max_agents: int = 8
    allowed_roles: List[str] = field(
        default_factory=lambda: [
            "research",
            "planner",
            "critic",
            "optimizer",
            "coder",
            "validator",
            "risk_analyst",
            "synthesizer",
        ]
    )
    allow_duplicate_roles: bool = True


@dataclass(slots=True)
class SpawnedAgent:
    agent_id: str
    run_id: str
    role: str
    goal: str
    specialization: str
    capabilities: List[str] = field(default_factory=list)
    constraints: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentSpawner:
    """Create bounded temporary sub-agents for swarm experiments."""

    def __init__(self, memory: MemorySystem, policy: SpawnPolicy | None = None) -> None:
        self._memory = memory
        self.policy = policy or SpawnPolicy()

    def spawn(
        self,
        *,
        run_id: str,
        problem: str,
        requested_roles: Iterable[str] | None = None,
        max_agents: int | None = None,
    ) -> List[SpawnedAgent]:
        limit = min(self.policy.max_agents, max(1, int(max_agents or self.policy.max_agents)))
        roles = self._resolve_roles(problem=problem, requested_roles=requested_roles, limit=limit)

        agents: List[SpawnedAgent] = []
        for role in roles[:limit]:
            agents.append(self._mk_agent(run_id=run_id, role=role, problem=problem))

        self._persist(run_id=run_id, agents=agents)
        return agents

    def _resolve_roles(self, *, problem: str, requested_roles: Iterable[str] | None, limit: int) -> List[str]:
        if requested_roles:
            cleaned = [str(item).strip().lower() for item in requested_roles if str(item).strip()]
        else:
            cleaned = self._suggest_roles(problem)

        allowed = set(self.policy.allowed_roles)
        filtered = [item for item in cleaned if item in allowed]
        if not filtered:
            filtered = ["research", "planner", "critic", "optimizer"]

        if not self.policy.allow_duplicate_roles:
            seen: set[str] = set()
            deduped: List[str] = []
            for item in filtered:
                if item in seen:
                    continue
                seen.add(item)
                deduped.append(item)
            filtered = deduped

        return filtered[: max(1, limit)]

    @staticmethod
    def _suggest_roles(problem: str) -> List[str]:
        text = problem.lower()
        roles = ["research", "planner", "critic", "synthesizer"]
        if any(token in text for token in ["code", "api", "bug", "performance", "refactor"]):
            roles.extend(["coder", "validator", "optimizer"])
        if any(token in text for token in ["risk", "trade", "security", "policy"]):
            roles.append("risk_analyst")
        return roles

    def _mk_agent(self, *, run_id: str, role: str, problem: str) -> SpawnedAgent:
        spec = self._specialization_for_role(role, problem)
        return SpawnedAgent(
            agent_id=f"swarm-agent-{uuid.uuid4().hex[:10]}",
            run_id=run_id,
            role=role,
            goal=f"Explore {role} approach for: {problem[:180]}",
            specialization=spec,
            capabilities=self._capabilities_for_role(role),
            constraints={
                "max_steps": 8,
                "max_tokens": 1800,
                "no_recursive_swarm_spawn": True,
            },
            metadata={
                "spawned_at": datetime.now(timezone.utc).isoformat(),
                "temporary": True,
            },
        )

    @staticmethod
    def _specialization_for_role(role: str, problem: str) -> str:
        mapping = {
            "research": "evidence gathering and references",
            "planner": "strategy decomposition and milestones",
            "critic": "failure modes and edge-case analysis",
            "optimizer": "latency/cost and throughput improvements",
            "coder": "implementation path and interfaces",
            "validator": "tests and invariants",
            "risk_analyst": "risk matrix and safeguards",
            "synthesizer": "cross-agent synthesis",
        }
        base = mapping.get(role, "general exploration")
        return f"{base} for problem scope '{problem[:90]}'"

    @staticmethod
    def _capabilities_for_role(role: str) -> List[str]:
        mapping = {
            "research": ["search", "fact_check", "compare_sources"],
            "planner": ["task_breakdown", "roadmapping", "dependency_mapping"],
            "critic": ["failure_analysis", "constraint_check", "counterexample_generation"],
            "optimizer": ["profiling", "cost_estimation", "optimization"],
            "coder": ["implementation_design", "api_contracts", "code_generation"],
            "validator": ["test_design", "assertion_generation", "verification"],
            "risk_analyst": ["risk_scoring", "safety_review", "mitigation"],
            "synthesizer": ["consensus_building", "merge_strategies", "summary"],
        }
        return list(mapping.get(role, ["analysis"]))

    def _persist(self, *, run_id: str, agents: List[SpawnedAgent]) -> None:
        payload = {
            "run_id": run_id,
            "count": len(agents),
            "agents": [
                {
                    "agent_id": row.agent_id,
                    "role": row.role,
                    "goal": row.goal,
                    "specialization": row.specialization,
                    "capabilities": list(row.capabilities),
                }
                for row in agents
            ],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._memory.remember_short_term(
            key="swarm:last_spawn",
            value=payload,
            tags=["swarm", "spawn"],
        )
        self._memory.remember_long_term(
            key=f"swarm:spawn:{run_id}",
            value=payload,
            source="agent_swarm_lab.agent_spawner",
            importance=0.72,
            tags=["swarm", "spawn"],
        )

