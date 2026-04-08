"""Swarm controller for Agent Swarm Lab.

Orchestrates parallel sub-agent exploration for complex problems.
Pipeline:
1) Validate run policy and loop guards
2) Spawn specialized temporary agents
3) Divide the problem into parallel subtasks
4) Execute agents under API/compute budgets
5) Collect candidate outputs
6) Select winner through consensus
7) Persist run artifacts for learning
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Dict, Iterable, List
import uuid

from Pixi.agent_swarm_lab.agent_executor import AgentExecutor, ExecutionBatch, ExecutionBudget
from Pixi.agent_swarm_lab.agent_spawner import AgentSpawner, SpawnPolicy, SpawnedAgent
from Pixi.agent_swarm_lab.consensus_engine import ConsensusDecision, ConsensusEngine
from Pixi.agent_swarm_lab.result_collector import CollectionReport, ResultCollector
from Pixi.agent_swarm_lab.swarm_memory import SwarmMemory, SwarmRunRecord
from Pixi.agent_swarm_lab.task_divider import DivisionPlan, TaskDivider
from Pixi.core.contracts import ContextSnapshot
from Pixi.memory.memory_system import MemorySystem
from Pixi.system_bus.bus_core import SystemBus


@dataclass(slots=True)
class SwarmPolicy:
    max_spawned_agents: int = 8
    max_swarm_depth: int = 1
    min_minutes_between_runs: int = 4
    max_runs_per_hour: int = 20
    max_api_calls_total: int = 40
    max_compute_steps_total: int = 500
    max_api_calls_per_agent: int = 8
    max_compute_steps_per_agent: int = 120


@dataclass(slots=True)
class SwarmRunResult:
    run_id: str
    started_at: str
    completed_at: str
    triggered: bool
    reason: str
    agents: List[SpawnedAgent] = field(default_factory=list)
    division: DivisionPlan | None = None
    execution: ExecutionBatch | None = None
    collection: CollectionReport | None = None
    consensus: ConsensusDecision | None = None
    notes: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class SwarmController:
    """Coordinates the full agent-swarm lifecycle."""

    def __init__(
        self,
        memory: MemorySystem,
        *,
        system_bus: SystemBus | None = None,
        policy: SwarmPolicy | None = None,
        spawner: AgentSpawner | None = None,
        divider: TaskDivider | None = None,
        executor: AgentExecutor | None = None,
        collector: ResultCollector | None = None,
        consensus: ConsensusEngine | None = None,
        swarm_memory: SwarmMemory | None = None,
    ) -> None:
        self._memory = memory
        self._bus = system_bus
        self.policy = policy or SwarmPolicy()

        self.spawner = spawner or AgentSpawner(
            memory=memory,
            policy=SpawnPolicy(max_agents=self.policy.max_spawned_agents),
        )
        self.divider = divider or TaskDivider(memory=memory)
        self.executor = executor or AgentExecutor(
            memory=memory,
            budget=ExecutionBudget(
                max_api_calls_total=self.policy.max_api_calls_total,
                max_compute_steps_total=self.policy.max_compute_steps_total,
                max_api_calls_per_agent=self.policy.max_api_calls_per_agent,
                max_compute_steps_per_agent=self.policy.max_compute_steps_per_agent,
            ),
        )
        self.collector = collector or ResultCollector(memory=memory)
        self.consensus = consensus or ConsensusEngine(memory=memory)
        self.swarm_memory = swarm_memory or SwarmMemory(memory=memory)

        self._lock = RLock()
        self._last_run_at: datetime | None = None
        self._run_history: List[datetime] = []
        self._active_depth = 0

    def run(
        self,
        *,
        problem: str,
        context: ContextSnapshot | None = None,
        requested_roles: Iterable[str] | None = None,
        force: bool = False,
    ) -> SwarmRunResult:
        started = datetime.now(timezone.utc)
        run_id = f"swarm-{int(started.timestamp())}-{uuid.uuid4().hex[:8]}"

        allowed, reason = self._can_run(force=force)
        if not allowed:
            result = SwarmRunResult(
                run_id=run_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=False,
                reason=reason,
                notes=["swarm_skipped"],
            )
            self._record(result)
            self._publish("swarm.run.skipped", {"run_id": run_id, "reason": reason})
            return result

        notes: List[str] = []
        errors: List[str] = []
        agents: List[SpawnedAgent] = []
        division: DivisionPlan | None = None
        execution: ExecutionBatch | None = None
        collection: CollectionReport | None = None
        decision: ConsensusDecision | None = None

        self._mark_started(started)
        self._publish("swarm.run.started", {"run_id": run_id, "problem": problem[:220]})

        try:
            role_list = list(requested_roles or [])
            agents = self.spawner.spawn(
                run_id=run_id,
                problem=problem,
                requested_roles=role_list,
                max_agents=self.policy.max_spawned_agents,
            )
            if len(agents) > self.policy.max_spawned_agents:
                agents = agents[: self.policy.max_spawned_agents]
                notes.append("agent_limit_enforced")

            division = self.divider.divide(
                run_id=run_id,
                problem=problem,
                roles=[agent.role for agent in agents],
                max_tasks=max(6, len(agents) * 3),
            )

            execution_context = {
                "swarm_active": True,
                "swarm_depth": self._active_depth,
                "app": "unknown" if context is None else context.current_application,
                "activity": "unknown" if context is None else context.user_activity,
            }
            execution = self.executor.execute(
                run_id=run_id,
                agents=agents,
                tasks=division.tasks,
                context=execution_context,
            )

            collection = self.collector.collect(run_id=run_id, executions=execution.executions)
            decision = self.consensus.decide(run_id=run_id, results=collection.results)

            self._persist_run(
                run_id=run_id,
                problem=problem,
                agents=agents,
                division=division,
                execution=execution,
                decision=decision,
                status="completed",
            )

            result = SwarmRunResult(
                run_id=run_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=True,
                reason="ok",
                agents=agents,
                division=division,
                execution=execution,
                collection=collection,
                consensus=decision,
                notes=notes,
                errors=errors,
                metadata={
                    "agent_count": len(agents),
                    "task_count": len(division.tasks),
                    "winner_role": decision.winner_role,
                    "winner_score": decision.score,
                },
            )
            self._record(result)
            self._publish(
                "swarm.run.completed",
                {
                    "run_id": run_id,
                    "agent_count": len(agents),
                    "task_count": len(division.tasks),
                    "winner_role": decision.winner_role,
                    "winner_score": decision.score,
                },
            )
            return result

        except Exception as exc:  # noqa: BLE001
            errors.append(f"{type(exc).__name__}: {exc}")
            self._persist_run(
                run_id=run_id,
                problem=problem,
                agents=agents,
                division=division,
                execution=execution,
                decision=decision,
                status="failed",
            )
            result = SwarmRunResult(
                run_id=run_id,
                started_at=started.isoformat(),
                completed_at=datetime.now(timezone.utc).isoformat(),
                triggered=True,
                reason="error",
                agents=agents,
                division=division,
                execution=execution,
                collection=collection,
                consensus=decision,
                notes=notes,
                errors=errors,
            )
            self._record(result)
            self._publish("swarm.run.failed", {"run_id": run_id, "error": str(exc)}, severity="error")
            return result

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))

        if topic in {"swarm.run", "swarm.experiment"}:
            problem = str(payload.get("problem", "")).strip()
            if not problem:
                return {"status": "error", "reason": "missing_problem"}
            context = payload.get("context")
            result = self.run(
                problem=problem,
                context=context,
                requested_roles=list(payload.get("requested_roles", [])),
                force=bool(payload.get("force", False)),
            )
            return {
                "run_id": result.run_id,
                "triggered": result.triggered,
                "reason": result.reason,
                "winner_role": None if result.consensus is None else result.consensus.winner_role,
                "winner_score": None if result.consensus is None else result.consensus.score,
            }

        if topic in {"swarm.diagnostics", "swarm.status"}:
            return self.diagnostics()

        return {"status": "ignored", "topic": topic}

    def diagnostics(self) -> Dict[str, Any]:
        recent = self._run_history[-60:]
        now = datetime.now(timezone.utc)
        hour_count = sum(1 for item in recent if now - item <= timedelta(hours=1))

        return {
            "active_depth": self._active_depth,
            "last_run_at": None if self._last_run_at is None else self._last_run_at.isoformat(),
            "runs_last_hour": hour_count,
            "policy": {
                "max_spawned_agents": self.policy.max_spawned_agents,
                "max_swarm_depth": self.policy.max_swarm_depth,
                "min_minutes_between_runs": self.policy.min_minutes_between_runs,
                "max_runs_per_hour": self.policy.max_runs_per_hour,
                "max_api_calls_total": self.policy.max_api_calls_total,
                "max_compute_steps_total": self.policy.max_compute_steps_total,
            },
            "memory": self.swarm_memory.summarize(),
        }

    def safety_status(self) -> Dict[str, Any]:
        diag = self.diagnostics()
        policy = diag.get("policy", {})
        safety = {
            "agent_limit": policy.get("max_spawned_agents", 0),
            "recursion_depth_limit": policy.get("max_swarm_depth", 0),
            "api_budget_limit": policy.get("max_api_calls_total", 0),
            "compute_budget_limit": policy.get("max_compute_steps_total", 0),
            "runs_last_hour": diag.get("runs_last_hour", 0),
            "active_depth": diag.get("active_depth", 0),
        }
        safety["healthy"] = (
            safety["active_depth"] <= safety["recursion_depth_limit"]
            and safety["runs_last_hour"] <= self.policy.max_runs_per_hour
        )
        return safety

    def recent_outcomes(self, limit: int = 10) -> List[Dict[str, Any]]:
        rows = self.swarm_memory.load_recent_runs(limit=max(1, int(limit)))
        return [
            {
                "run_id": row.get("run_id", ""),
                "status": row.get("status", "unknown"),
                "score": row.get("score", 0.0),
                "confidence": row.get("confidence", 0.0),
                "created_at": row.get("created_at", ""),
            }
            for row in rows
        ]

    def _can_run(self, *, force: bool) -> tuple[bool, str]:
        if self._active_depth >= self.policy.max_swarm_depth and not force:
            return False, "recursive_swarm_loop_blocked"

        with self._lock:
            now = datetime.now(timezone.utc)
            if not force and self._last_run_at is not None:
                if now - self._last_run_at < timedelta(minutes=self.policy.min_minutes_between_runs):
                    return False, "rate_limited"

            self._trim_run_history(now)
            if not force and len(self._run_history) >= self.policy.max_runs_per_hour:
                return False, "hourly_run_limit"

        return True, "allowed"

    def _mark_started(self, started: datetime) -> None:
        with self._lock:
            self._last_run_at = started
            self._run_history.append(started)
            self._active_depth += 1

    def _record(self, result: SwarmRunResult) -> None:
        with self._lock:
            self._active_depth = max(0, self._active_depth - 1)

        payload = {
            "run_id": result.run_id,
            "triggered": result.triggered,
            "reason": result.reason,
            "started_at": result.started_at,
            "completed_at": result.completed_at,
            "notes": list(result.notes),
            "errors": list(result.errors),
            "metadata": dict(result.metadata),
        }
        self._memory.remember_short_term(
            key="swarm:last_run_result",
            value=payload,
            tags=["swarm", "controller"],
        )

    def _persist_run(
        self,
        *,
        run_id: str,
        problem: str,
        agents: List[SpawnedAgent],
        division: DivisionPlan | None,
        execution: ExecutionBatch | None,
        decision: ConsensusDecision | None,
        status: str,
    ) -> None:
        best_strategy = "none" if decision is None else decision.selected_solution[:260]
        confidence = 0.0 if decision is None else decision.confidence
        score = 0.0 if decision is None else decision.score
        task_count = 0 if division is None else len(division.tasks)

        record = SwarmRunRecord(
            run_id=run_id,
            problem=problem,
            status=status,
            agent_count=len(agents),
            task_count=task_count,
            best_strategy=best_strategy,
            confidence=confidence,
            score=score,
            created_at=datetime.now(timezone.utc).isoformat(),
            metadata={
                "winner_role": None if decision is None else decision.winner_role,
                "budget": None if execution is None else dict(execution.budget),
            },
        )
        self.swarm_memory.record_run(record)

    def _trim_run_history(self, now: datetime) -> None:
        self._run_history = [item for item in self._run_history if now - item <= timedelta(hours=1)]

    def _publish(self, event_type: str, payload: Dict[str, Any], *, severity: str = "info") -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=event_type,
            source="agent_swarm_lab",
            payload=payload,
            topic=event_type,
            severity=severity,
            tags=["swarm", "system_bus"],
        )

