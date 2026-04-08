"""Consensus engine for Agent Swarm Lab.

Selects best solution from multiple candidate outputs using weighted scoring
and role-diversity voting.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List

from Pixi.agent_swarm_lab.result_collector import CollectedResult
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ConsensusDecision:
    run_id: str
    winner_agent_id: str
    winner_role: str
    selected_solution: str
    confidence: float
    score: float
    rationale: List[str] = field(default_factory=list)
    alternatives: List[Dict[str, Any]] = field(default_factory=list)
    voting: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConsensusEngine:
    """Combine voting and scoring to choose a final swarm answer."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def decide(self, *, run_id: str, results: Iterable[CollectedResult]) -> ConsensusDecision:
        rows = list(results)
        if not rows:
            empty = ConsensusDecision(
                run_id=run_id,
                winner_agent_id="none",
                winner_role="none",
                selected_solution="No results produced by swarm.",
                confidence=0.05,
                score=0.0,
                rationale=["empty_result_set"],
                alternatives=[],
                voting={"total_votes": 0},
                metadata={"generated_at": datetime.now(timezone.utc).isoformat()},
            )
            self._persist(empty)
            return empty

        scored = self._score_rows(rows)
        winner = sorted(scored, key=lambda item: item["final_score"], reverse=True)[0]

        alternatives = [
            {
                "agent_id": row["row"].agent_id,
                "role": row["row"].role,
                "score": row["final_score"],
                "confidence": row["row"].confidence,
            }
            for row in sorted(scored, key=lambda item: item["final_score"], reverse=True)[1:6]
        ]

        rationale = [
            f"Winner scored highest weighted score ({winner['final_score']:.3f}).",
            f"Role diversity votes contributed {winner['votes']} votes.",
            f"Candidate confidence={winner['row'].confidence:.3f} and execution score={winner['row'].score:.3f}.",
        ]

        decision = ConsensusDecision(
            run_id=run_id,
            winner_agent_id=winner["row"].agent_id,
            winner_role=winner["row"].role,
            selected_solution=winner["row"].candidate_solution,
            confidence=round(min(0.98, winner["row"].confidence * 0.75 + winner["final_score"] * 0.25), 4),
            score=round(winner["final_score"], 4),
            rationale=rationale,
            alternatives=alternatives,
            voting={
                "total_votes": sum(item["votes"] for item in scored),
                "role_votes": self._role_vote_breakdown(scored),
            },
            metadata={"generated_at": datetime.now(timezone.utc).isoformat(), "candidate_count": len(rows)},
        )
        self._persist(decision)
        return decision

    def _score_rows(self, rows: List[CollectedResult]) -> List[Dict[str, Any]]:
        role_votes = self._role_votes(rows)
        out: List[Dict[str, Any]] = []
        for row in rows:
            votes = role_votes.get(row.role, 0)
            quality = row.score * 0.55 + row.confidence * 0.35
            penalty = min(0.2, len(row.weaknesses) * 0.025)
            bonus = min(0.1, len(row.strengths) * 0.02)
            vote_bonus = min(0.12, votes * 0.03)
            final_score = max(0.0, min(1.0, quality - penalty + bonus + vote_bonus))
            out.append({"row": row, "votes": votes, "final_score": final_score})
        return out

    @staticmethod
    def _role_votes(rows: List[CollectedResult]) -> Dict[str, int]:
        # Simple heuristic: higher average score roles receive more voting weight.
        grouped: Dict[str, List[float]] = {}
        for row in rows:
            grouped.setdefault(row.role, []).append(row.score)

        votes: Dict[str, int] = {}
        for role, scores in grouped.items():
            avg = mean(scores)
            if avg >= 0.8:
                votes[role] = 4
            elif avg >= 0.65:
                votes[role] = 3
            elif avg >= 0.5:
                votes[role] = 2
            else:
                votes[role] = 1
        return votes

    @staticmethod
    def _role_vote_breakdown(rows: List[Dict[str, Any]]) -> Dict[str, int]:
        out: Dict[str, int] = {}
        for item in rows:
            role = item["row"].role
            out[role] = item["votes"]
        return out

    def _persist(self, decision: ConsensusDecision) -> None:
        payload = {
            "run_id": decision.run_id,
            "winner_agent_id": decision.winner_agent_id,
            "winner_role": decision.winner_role,
            "selected_solution": decision.selected_solution,
            "confidence": decision.confidence,
            "score": decision.score,
            "rationale": list(decision.rationale),
            "alternatives": list(decision.alternatives),
            "voting": dict(decision.voting),
            "metadata": dict(decision.metadata),
        }
        self._memory.remember_short_term(
            key="swarm:last_consensus",
            value=payload,
            tags=["swarm", "consensus"],
        )
        self._memory.remember_long_term(
            key=f"swarm:consensus:{decision.run_id}",
            value=payload,
            source="agent_swarm_lab.consensus_engine",
            importance=0.84,
            tags=["swarm", "consensus"],
        )

