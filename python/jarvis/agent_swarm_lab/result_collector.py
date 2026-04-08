"""Result collector for Agent Swarm Lab.

Aggregates execution outputs into structured result rows for downstream
consensus scoring.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List

from jarvis.agent_swarm_lab.agent_executor import AgentExecution
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class CollectedResult:
    run_id: str
    agent_id: str
    role: str
    task_id: str
    candidate_solution: str
    confidence: float
    score: float
    strengths: List[str] = field(default_factory=list)
    weaknesses: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class CollectionReport:
    run_id: str
    generated_at: str
    results: List[CollectedResult] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class ResultCollector:
    """Transform raw agent executions into comparable candidate results."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def collect(self, *, run_id: str, executions: Iterable[AgentExecution]) -> CollectionReport:
        rows = list(executions)
        results = [self._to_result(row) for row in rows]

        report = CollectionReport(
            run_id=run_id,
            generated_at=datetime.now(timezone.utc).isoformat(),
            results=results,
            metrics=self._metrics(results),
        )
        self._persist(report)
        return report

    def _to_result(self, execution: AgentExecution) -> CollectedResult:
        strengths: List[str] = []
        weaknesses: List[str] = []

        if execution.success:
            strengths.append("completed_assigned_exploration")
        else:
            weaknesses.append("execution_unsuccessful")

        if execution.api_calls_used <= 3:
            strengths.append("api_efficient")
        elif execution.api_calls_used >= 7:
            weaknesses.append("api_heavy")

        if execution.compute_steps_used <= 40:
            strengths.append("compute_efficient")
        elif execution.compute_steps_used >= 90:
            weaknesses.append("compute_heavy")

        if execution.warnings:
            weaknesses.extend(execution.warnings)

        confidence = self._confidence(execution, strengths, weaknesses)
        candidate_solution = (
            f"Role={execution.role}; approach={execution.approach}; "
            f"summary={execution.summary[:220]}"
        )

        return CollectedResult(
            run_id=execution.run_id,
            agent_id=execution.agent_id,
            role=execution.role,
            task_id=execution.task_id,
            candidate_solution=candidate_solution,
            confidence=confidence,
            score=execution.score,
            strengths=strengths,
            weaknesses=weaknesses,
            metadata={
                "api_calls": execution.api_calls_used,
                "compute_steps": execution.compute_steps_used,
                "warnings": list(execution.warnings),
                "captured_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    @staticmethod
    def _confidence(execution: AgentExecution, strengths: List[str], weaknesses: List[str]) -> float:
        base = 0.5 + (execution.score * 0.35)
        base += min(0.12, len(strengths) * 0.03)
        base -= min(0.25, len(weaknesses) * 0.04)
        return round(max(0.05, min(0.97, base)), 4)

    @staticmethod
    def _metrics(results: List[CollectedResult]) -> Dict[str, Any]:
        if not results:
            return {"count": 0, "avg_score": 0.0, "avg_confidence": 0.0}

        by_role: Dict[str, int] = {}
        for row in results:
            by_role[row.role] = by_role.get(row.role, 0) + 1

        return {
            "count": len(results),
            "avg_score": round(mean([row.score for row in results]), 4),
            "avg_confidence": round(mean([row.confidence for row in results]), 4),
            "by_role": by_role,
        }

    def _persist(self, report: CollectionReport) -> None:
        payload = {
            "run_id": report.run_id,
            "generated_at": report.generated_at,
            "metrics": dict(report.metrics),
            "results": [
                {
                    "agent_id": row.agent_id,
                    "role": row.role,
                    "task_id": row.task_id,
                    "score": row.score,
                    "confidence": row.confidence,
                    "strengths": list(row.strengths),
                    "weaknesses": list(row.weaknesses),
                }
                for row in report.results
            ],
        }
        self._memory.remember_short_term(
            key="swarm:last_collection_report",
            value=payload,
            tags=["swarm", "collector"],
        )
        self._memory.remember_long_term(
            key=f"swarm:collection_report:{report.run_id}:{report.generated_at}",
            value=payload,
            source="agent_swarm_lab.result_collector",
            importance=0.76,
            tags=["swarm", "collector"],
        )
