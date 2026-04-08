"""Swarm memory for Agent Swarm Lab.

Persists swarm experiments so future runs can reuse proven patterns,
failed approaches, and consensus outcomes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class SwarmRunRecord:
    run_id: str
    problem: str
    status: str
    agent_count: int
    task_count: int
    best_strategy: str
    confidence: float
    score: float
    created_at: str
    metadata: Dict[str, Any] = field(default_factory=dict)


class SwarmMemory:
    """Storage facade for swarm experiment lifecycle and retrieval."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def record_run(self, record: SwarmRunRecord) -> None:
        payload = {
            "run_id": record.run_id,
            "problem": record.problem,
            "status": record.status,
            "agent_count": record.agent_count,
            "task_count": record.task_count,
            "best_strategy": record.best_strategy,
            "confidence": record.confidence,
            "score": record.score,
            "created_at": record.created_at,
            "metadata": dict(record.metadata),
        }
        self._memory.remember_short_term(
            key="swarm:last_run",
            value=payload,
            tags=["swarm", "run"],
        )
        self._memory.remember_long_term(
            key=f"swarm:run:{record.run_id}",
            value=payload,
            source="agent_swarm_lab.swarm_memory",
            importance=max(0.6, min(0.96, record.score)),
            tags=["swarm", "run", record.status],
        )
        self._memory.remember_semantic(
            doc_id=f"swarm:run:{record.run_id}",
            text=(
                f"Swarm run {record.run_id} status={record.status} score={record.score:.2f} "
                f"strategy={record.best_strategy} problem={record.problem[:420]}"
            ),
            metadata={"type": "swarm_run", "confidence": record.confidence},
        )

    def record_artifact(
        self,
        *,
        run_id: str,
        kind: str,
        payload: Dict[str, Any],
        importance: float = 0.7,
        tags: Iterable[str] | None = None,
    ) -> None:
        key = f"swarm:artifact:{run_id}:{kind}:{int(datetime.now(timezone.utc).timestamp())}"
        all_tags = ["swarm", "artifact", kind]
        if tags:
            all_tags.extend(str(item) for item in tags)

        self._memory.remember_long_term(
            key=key,
            value=dict(payload),
            source="agent_swarm_lab.swarm_memory",
            importance=max(0.1, min(1.0, importance)),
            tags=all_tags,
        )

    def search_similar_runs(self, problem: str, limit: int = 6) -> List[Dict[str, Any]]:
        hits = self._memory.semantic_search(f"swarm run strategy {problem}", top_k=max(1, int(limit)))
        out: List[Dict[str, Any]] = []
        for row in hits:
            out.append(
                {
                    "doc_id": row.doc_id,
                    "score": row.score,
                    "snippet": row.text[:260],
                    "metadata": dict(row.metadata),
                }
            )
        return out

    def load_recent_runs(self, limit: int = 20) -> List[Dict[str, Any]]:
        records = self._memory.long_term.find_by_tags(["swarm", "run"], limit=max(1, int(limit)))
        out: List[Dict[str, Any]] = []
        for item in records:
            value = dict(item.value)
            out.append(
                {
                    "run_id": value.get("run_id", ""),
                    "status": value.get("status", "unknown"),
                    "problem": value.get("problem", ""),
                    "score": value.get("score", 0.0),
                    "confidence": value.get("confidence", 0.0),
                    "created_at": value.get("created_at", ""),
                }
            )
        return out

    def summarize(self) -> Dict[str, Any]:
        records = self.load_recent_runs(limit=200)
        if not records:
            return {"count": 0, "status": {}, "avg_score": 0.0}

        status: Dict[str, int] = {}
        score_sum = 0.0
        for row in records:
            state = str(row.get("status", "unknown"))
            status[state] = status.get(state, 0) + 1
            score_sum += float(row.get("score", 0.0) or 0.0)

        return {
            "count": len(records),
            "status": status,
            "avg_score": round(score_sum / len(records), 4),
            "last_run_id": records[0].get("run_id", "") if records else "",
        }

    def failure_patterns(self, limit: int = 100) -> Dict[str, Any]:
        rows = self.load_recent_runs(limit=max(1, int(limit)))
        failed = [row for row in rows if str(row.get("status", "")) == "failed"]
        if not failed:
            return {
                "failed_count": 0,
                "failure_rate": 0.0,
                "score_when_failed_avg": 0.0,
            }

        avg_failed_score = sum(float(row.get("score", 0.0) or 0.0) for row in failed) / len(failed)
        return {
            "failed_count": len(failed),
            "failure_rate": round(len(failed) / max(1, len(rows)), 4),
            "score_when_failed_avg": round(avg_failed_score, 4),
            "last_failed_run": failed[0].get("run_id", ""),
        }

    def export_learning_snapshot(self, limit: int = 60) -> Dict[str, Any]:
        recent = self.load_recent_runs(limit=max(1, int(limit)))
        similar_index: List[Dict[str, Any]] = []
        for row in recent[:12]:
            similar_index.append(
                {
                    "run_id": row.get("run_id", ""),
                    "problem": str(row.get("problem", ""))[:160],
                    "score": row.get("score", 0.0),
                    "status": row.get("status", ""),
                }
            )

        return {
            "summary": self.summarize(),
            "failures": self.failure_patterns(limit=limit),
            "recent": recent,
            "index": similar_index,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

