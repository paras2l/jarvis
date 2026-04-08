"""Task divider for Agent Swarm Lab.

Decomposes complex problems into parallel subtasks while preserving
shared constraints and execution ordering hints.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class SwarmTask:
    task_id: str
    run_id: str
    title: str
    objective: str
    role_hint: str
    priority: int
    dependencies: List[str] = field(default_factory=list)
    constraints: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DivisionPlan:
    run_id: str
    generated_at: str
    root_problem: str
    tasks: List[SwarmTask] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)


class TaskDivider:
    """Problem decomposition engine for parallel swarm exploration."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def divide(
        self,
        *,
        run_id: str,
        problem: str,
        roles: Iterable[str],
        max_tasks: int = 18,
    ) -> DivisionPlan:
        role_list = [str(item).strip().lower() for item in roles if str(item).strip()]
        role_list = role_list or ["research", "planner", "critic", "synthesizer"]

        candidate_units = self._extract_units(problem)
        tasks: List[SwarmTask] = []

        for idx, unit in enumerate(candidate_units):
            role = role_list[idx % len(role_list)]
            priority = max(30, 95 - idx * 4)
            dependencies = []
            if role == "synthesizer":
                dependencies = [task.task_id for task in tasks[: min(4, len(tasks))]]

            tasks.append(
                SwarmTask(
                    task_id=f"swarm-task-{run_id}-{idx + 1}",
                    run_id=run_id,
                    title=unit["title"],
                    objective=unit["objective"],
                    role_hint=role,
                    priority=priority,
                    dependencies=dependencies,
                    constraints={
                        "max_execution_seconds": 60,
                        "max_external_calls": 5,
                        "no_recursive_swarm": True,
                    },
                    metadata={
                        "unit_kind": unit["kind"],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            )
            if len(tasks) >= max(1, int(max_tasks)):
                break

        plan = DivisionPlan(
            run_id=run_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            root_problem=problem,
            tasks=tasks,
            summary=self._summarize(tasks),
        )
        self._persist(plan)
        return plan

    @staticmethod
    def _extract_units(problem: str) -> List[Dict[str, str]]:
        stripped = problem.strip()
        if not stripped:
            return [
                {"kind": "goal", "title": "Define objective", "objective": "Clarify target outcomes and constraints."},
                {"kind": "analysis", "title": "Gather evidence", "objective": "Collect evidence and baseline assumptions."},
                {"kind": "synthesis", "title": "Propose solution", "objective": "Synthesize best solution from findings."},
            ]

        # Split by sentence-like separators first, then commas as fallback.
        parts = [item.strip() for item in stripped.replace(";", ".").split(".") if item.strip()]
        if len(parts) < 3:
            parts = [item.strip() for item in stripped.split(",") if item.strip()]

        units: List[Dict[str, str]] = []
        for idx, part in enumerate(parts[:12]):
            kind = "analysis"
            lowered = part.lower()
            if any(token in lowered for token in ["design", "plan", "architecture", "roadmap"]):
                kind = "planning"
            elif any(token in lowered for token in ["risk", "constraint", "security", "failure"]):
                kind = "risk"
            elif any(token in lowered for token in ["implement", "code", "build", "integration"]):
                kind = "implementation"
            elif any(token in lowered for token in ["validate", "test", "verify"]):
                kind = "validation"

            units.append(
                {
                    "kind": kind,
                    "title": f"Subtask {idx + 1}: {part[:70]}",
                    "objective": part,
                }
            )

        # Ensure synthesis task exists to merge parallel exploration.
        units.append(
            {
                "kind": "synthesis",
                "title": "Synthesize multi-agent output",
                "objective": "Compare alternatives, resolve conflicts, and produce a final strategy.",
            }
        )
        return units

    @staticmethod
    def _summarize(tasks: List[SwarmTask]) -> Dict[str, Any]:
        counts: Dict[str, int] = {}
        for row in tasks:
            counts[row.role_hint] = counts.get(row.role_hint, 0) + 1

        return {
            "task_count": len(tasks),
            "role_distribution": counts,
            "max_priority": max((row.priority for row in tasks), default=0),
            "dependency_edges": sum(len(row.dependencies) for row in tasks),
        }

    def _persist(self, plan: DivisionPlan) -> None:
        payload = {
            "run_id": plan.run_id,
            "generated_at": plan.generated_at,
            "root_problem": plan.root_problem,
            "summary": dict(plan.summary),
            "tasks": [
                {
                    "task_id": row.task_id,
                    "title": row.title,
                    "role_hint": row.role_hint,
                    "priority": row.priority,
                    "dependencies": list(row.dependencies),
                }
                for row in plan.tasks
            ],
        }
        self._memory.remember_short_term(
            key="swarm:last_division_plan",
            value=payload,
            tags=["swarm", "division"],
        )
        self._memory.remember_long_term(
            key=f"swarm:division_plan:{plan.run_id}",
            value=payload,
            source="agent_swarm_lab.task_divider",
            importance=0.74,
            tags=["swarm", "division"],
        )

