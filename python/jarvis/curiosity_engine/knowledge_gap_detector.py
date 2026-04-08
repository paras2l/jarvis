"""Knowledge gap detector for the Curiosity Engine.

Identifies weak or missing knowledge areas by combining:
- memory signals (semantic + explicit traces)
- world model state (constraints, opportunities, confidence)
- reasoning/planning telemetry snapshots
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Mapping

from jarvis.memory.memory_system import MemorySystem
from jarvis.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class KnowledgeGap:
    gap_id: str
    domain: str
    title: str
    description: str
    urgency: float
    confidence: float
    novelty: float
    evidence: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def score(self) -> float:
        return round(self.urgency * 0.45 + self.confidence * 0.35 + self.novelty * 0.2, 4)


@dataclass(slots=True)
class KnowledgeGapReport:
    generated_at: str
    gaps: List[KnowledgeGap] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def top(self, limit: int = 5) -> List[KnowledgeGap]:
        if limit <= 0:
            return []
        return sorted(self.gaps, key=lambda row: row.score, reverse=True)[:limit]


class KnowledgeGapDetector:
    """Detect weak knowledge areas to trigger autonomous research."""

    def __init__(self, memory: MemorySystem, world_model: WorldStateModel) -> None:
        self._memory = memory
        self._world_model = world_model

    def detect(
        self,
        *,
        focus_domains: Iterable[str] | None = None,
        limit: int = 12,
    ) -> KnowledgeGapReport:
        now = datetime.now(timezone.utc).isoformat()
        world = self._world_model.current()
        requested_domains = [item.strip().lower() for item in (focus_domains or []) if str(item).strip()]

        gaps: List[KnowledgeGap] = []
        gaps.extend(self._from_world_state(world))
        gaps.extend(self._from_reasoning_memory())
        gaps.extend(self._from_planning_memory())
        gaps.extend(self._from_self_improvement_memory())
        gaps.extend(self._from_domain_queries(requested_domains))

        deduped = self._deduplicate(gaps)
        if requested_domains:
            deduped = [row for row in deduped if row.domain in requested_domains or any(tag in requested_domains for tag in row.tags)]

        deduped = sorted(deduped, key=lambda row: row.score, reverse=True)[: max(1, int(limit))]
        report = KnowledgeGapReport(
            generated_at=now,
            gaps=deduped,
            metadata={
                "world_health": world.system_health,
                "world_confidence": world.confidence,
                "requested_domains": requested_domains,
                "count": len(deduped),
            },
        )
        self._persist(report)
        return report

    def _from_world_state(self, world: Any) -> List[KnowledgeGap]:
        out: List[KnowledgeGap] = []
        if world.confidence < 0.65:
            out.append(
                self._mk(
                    domain="world_model",
                    title="Low world-state confidence",
                    description="World model confidence is below threshold; new external evidence is needed.",
                    urgency=0.82,
                    confidence=0.78,
                    novelty=0.72,
                    evidence=[f"world_confidence={world.confidence}"],
                    tags=["world_model", "confidence", "uncertainty"],
                )
            )

        for constraint in list(getattr(world, "constraints", [])):
            text = str(constraint).lower()
            if "high_stakes" in text:
                out.append(
                    self._mk(
                        domain="risk_intelligence",
                        title="High-stakes domain requires current evidence",
                        description="The active domain is high stakes and should be refreshed with external data.",
                        urgency=0.88,
                        confidence=0.81,
                        novelty=0.67,
                        evidence=[f"constraint={constraint}"],
                        tags=["risk", "market", "policy"],
                    )
                )
            if "deadline" in text:
                out.append(
                    self._mk(
                        domain="execution_optimization",
                        title="Deadline pressure knowledge gap",
                        description="Need tactics and benchmarks for faster execution under deadlines.",
                        urgency=0.77,
                        confidence=0.7,
                        novelty=0.65,
                        evidence=[f"constraint={constraint}"],
                        tags=["planning", "execution", "deadline"],
                    )
                )

        opportunities = [str(item).lower() for item in getattr(world, "opportunities", [])]
        if "market_intel_enrichment" in opportunities:
            out.append(
                self._mk(
                    domain="market_intelligence",
                    title="Market intelligence enrichment",
                    description="Current context indicates an opportunity to update market intelligence.",
                    urgency=0.72,
                    confidence=0.69,
                    novelty=0.73,
                    evidence=["opportunity=market_intel_enrichment"],
                    tags=["market", "research", "intel"],
                )
            )

        return out

    def _from_reasoning_memory(self) -> List[KnowledgeGap]:
        out: List[KnowledgeGap] = []
        hits = self._memory.semantic_search("reasoning uncertainty low confidence unknown", top_k=8)
        if not hits:
            return out

        top = hits[0]
        if top.score > 0.22:
            out.append(
                self._mk(
                    domain="reasoning_support",
                    title="Reasoning uncertainty trend",
                    description="Reasoning traces indicate recurring uncertainty and missing background knowledge.",
                    urgency=min(0.9, 0.45 + top.score),
                    confidence=min(0.9, 0.42 + top.score),
                    novelty=0.62,
                    evidence=[f"semantic_hit={item.doc_id}:{item.score:.3f}" for item in hits[:4]],
                    tags=["reasoning", "uncertainty", "knowledge"],
                )
            )

        return out

    def _from_planning_memory(self) -> List[KnowledgeGap]:
        out: List[KnowledgeGap] = []
        hits = self._memory.semantic_search("planning failed blocked missing dependencies", top_k=8)
        if not hits:
            return out

        avg = sum(item.score for item in hits) / len(hits)
        if avg > 0.2:
            out.append(
                self._mk(
                    domain="planning_resilience",
                    title="Planning resilience gap",
                    description="Planning and scheduling traces suggest missing procedural knowledge.",
                    urgency=min(0.85, 0.4 + avg),
                    confidence=min(0.82, 0.38 + avg),
                    novelty=0.66,
                    evidence=[f"planning_hit={item.doc_id}:{item.score:.3f}" for item in hits[:3]],
                    tags=["planning", "workflow", "resilience"],
                )
            )
        return out

    def _from_self_improvement_memory(self) -> List[KnowledgeGap]:
        out: List[KnowledgeGap] = []
        hits = self._memory.semantic_search("self improvement capability gap detector", top_k=8)
        if not hits:
            return out

        avg = sum(item.score for item in hits) / len(hits)
        if avg > 0.18:
            out.append(
                self._mk(
                    domain="capability_intelligence",
                    title="Capability trend gap",
                    description="Self-improvement history indicates repeated capability shortfalls requiring fresh research.",
                    urgency=min(0.84, 0.41 + avg),
                    confidence=min(0.79, 0.36 + avg),
                    novelty=0.71,
                    evidence=[f"improvement_hit={item.doc_id}:{item.score:.3f}" for item in hits[:3]],
                    tags=["self_improvement", "capabilities", "learning"],
                )
            )

        return out

    def _from_domain_queries(self, domains: List[str]) -> List[KnowledgeGap]:
        out: List[KnowledgeGap] = []
        for domain in domains:
            hits = self._memory.semantic_search(f"{domain} latest trends research updates", top_k=6)
            if not hits:
                out.append(
                    self._mk(
                        domain=domain,
                        title=f"Sparse memory coverage for {domain}",
                        description=f"No meaningful semantic history found for domain '{domain}'.",
                        urgency=0.74,
                        confidence=0.68,
                        novelty=0.82,
                        evidence=["semantic_search_returned_empty"],
                        tags=[domain, "coverage"],
                    )
                )
                continue

            avg = sum(item.score for item in hits) / len(hits)
            if avg < 0.24:
                out.append(
                    self._mk(
                        domain=domain,
                        title=f"Weak memory confidence for {domain}",
                        description=f"Semantic signals for '{domain}' are weak and should be reinforced.",
                        urgency=0.68,
                        confidence=0.61,
                        novelty=0.76,
                        evidence=[f"avg_score={avg:.3f}"],
                        tags=[domain, "coverage", "confidence"],
                    )
                )
        return out

    def _persist(self, report: KnowledgeGapReport) -> None:
        payload = {
            "type": "curiosity_knowledge_gap_report",
            "generated_at": report.generated_at,
            "count": len(report.gaps),
            "metadata": dict(report.metadata),
            "gaps": [
                {
                    "gap_id": row.gap_id,
                    "domain": row.domain,
                    "title": row.title,
                    "score": row.score,
                    "urgency": row.urgency,
                    "confidence": row.confidence,
                    "novelty": row.novelty,
                    "tags": list(row.tags),
                    "evidence": list(row.evidence[:6]),
                }
                for row in report.gaps
            ],
        }
        self._memory.remember_short_term(
            key="curiosity:last_gap_report",
            value=payload,
            tags=["curiosity", "knowledge_gap"],
        )
        self._memory.remember_long_term(
            key=f"curiosity:gap_report:{report.generated_at}",
            value=payload,
            source="curiosity_engine.knowledge_gap_detector",
            importance=0.78,
            tags=["curiosity", "knowledge_gap"],
        )

    def _deduplicate(self, rows: List[KnowledgeGap]) -> List[KnowledgeGap]:
        merged: Dict[str, KnowledgeGap] = {}
        for row in rows:
            key = f"{row.domain}|{row.title.lower()}"
            existing = merged.get(key)
            if existing is None:
                merged[key] = row
                continue
            existing.urgency = max(existing.urgency, row.urgency)
            existing.confidence = max(existing.confidence, row.confidence)
            existing.novelty = max(existing.novelty, row.novelty)
            existing.evidence = self._merge_unique(existing.evidence, row.evidence)
            existing.tags = self._merge_unique(existing.tags, row.tags)
            existing.metadata.update(row.metadata)
        return list(merged.values())

    @staticmethod
    def _merge_unique(left: List[str], right: List[str]) -> List[str]:
        seen = set(left)
        out = list(left)
        for item in right:
            if item in seen:
                continue
            seen.add(item)
            out.append(item)
        return out

    @staticmethod
    def _mk(
        *,
        domain: str,
        title: str,
        description: str,
        urgency: float,
        confidence: float,
        novelty: float,
        evidence: List[str],
        tags: List[str],
    ) -> KnowledgeGap:
        return KnowledgeGap(
            gap_id=f"gap-{datetime.now(timezone.utc).timestamp()}-{abs(hash(title)) % 100000}",
            domain=domain,
            title=title,
            description=description,
            urgency=round(max(0.05, min(1.0, urgency)), 4),
            confidence=round(max(0.05, min(1.0, confidence)), 4),
            novelty=round(max(0.05, min(1.0, novelty)), 4),
            evidence=list(evidence),
            tags=list(tags),
            metadata={"detected_at": datetime.now(timezone.utc).isoformat()},
        )
