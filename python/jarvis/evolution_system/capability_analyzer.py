"""Capability analyzer for Evolution System.

Detects capability limits and inefficiencies from runtime traces, memory,
and world-state context.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List

from jarvis.memory.memory_system import MemorySystem
from jarvis.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class CapabilityGap:
    gap_id: str
    category: str
    title: str
    description: str
    impact: float
    urgency: float
    confidence: float
    evidence: List[str] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def score(self) -> float:
        return round((self.impact * 0.4) + (self.urgency * 0.35) + (self.confidence * 0.25), 4)


@dataclass(slots=True)
class CapabilityReport:
    generated_at: str
    window_hours: int
    gaps: List[CapabilityGap] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def top(self, limit: int = 6) -> List[CapabilityGap]:
        return sorted(self.gaps, key=lambda item: item.score, reverse=True)[: max(1, int(limit))]


class CapabilityAnalyzer:
    """Analyze runtime outputs to locate capability deficiencies."""

    def __init__(self, memory: MemorySystem, world_model: WorldStateModel) -> None:
        self._memory = memory
        self._world_model = world_model

    def analyze(self, *, window_hours: int = 24, max_gaps: int = 24) -> CapabilityReport:
        now = datetime.now(timezone.utc)
        since = now - timedelta(hours=max(1, int(window_hours)))

        gaps: List[CapabilityGap] = []
        gaps.extend(self._gaps_from_failures(since))
        gaps.extend(self._gaps_from_retries(since))
        gaps.extend(self._gaps_from_latency(since))
        gaps.extend(self._gaps_from_world_state())
        gaps.extend(self._gaps_from_semantic_signals())

        gaps = self._deduplicate(gaps)
        gaps = sorted(gaps, key=lambda item: item.score, reverse=True)[: max(1, int(max_gaps))]

        report = CapabilityReport(
            generated_at=now.isoformat(),
            window_hours=max(1, int(window_hours)),
            gaps=gaps,
            metrics=self._build_metrics(gaps),
        )
        self._persist(report)
        return report

    def _gaps_from_failures(self, since: datetime) -> List[CapabilityGap]:
        rows = self._memory.long_term.find_by_tags(["brain", "task_result"], limit=600)
        failures = []
        for row in rows:
            stamp = self._best_time(row.value)
            if stamp is not None and stamp < since:
                continue
            if not bool(row.value.get("success", True)):
                failures.append(row)

        out: List[CapabilityGap] = []
        if len(failures) >= 3:
            summaries = [str(item.value.get("summary", "")) for item in failures[:8]]
            out.append(
                self._mk_gap(
                    category="reliability",
                    title="High task failure volume",
                    description="Task execution failures indicate missing resilience or fallback capabilities.",
                    impact=min(0.95, 0.45 + len(failures) * 0.03),
                    urgency=0.83,
                    confidence=0.78,
                    evidence=[entry[:180] for entry in summaries if entry],
                    suggested_actions=[
                        "Add fallback execution policies",
                        "Improve precondition checks before tool invocation",
                        "Generate remediation helper for common failure classes",
                    ],
                    tags=["failures", "reliability"],
                )
            )
        return out

    def _gaps_from_retries(self, since: datetime) -> List[CapabilityGap]:
        rows = self._memory.long_term.search_text("retry requeue task failed attempt", limit=300)
        evidence = []
        for row in rows:
            stamp = self._best_time(row.value)
            if stamp is not None and stamp < since:
                continue
            evidence.append(f"{row.key}:{str(row.value)[:180]}")

        if len(evidence) < 3:
            return []

        return [
            self._mk_gap(
                category="efficiency",
                title="Retry pressure is elevated",
                description="Frequent retries suggest weak task decomposition or brittle skills.",
                impact=min(0.9, 0.38 + len(evidence) * 0.02),
                urgency=0.75,
                confidence=0.72,
                evidence=evidence[:8],
                suggested_actions=[
                    "Generate preflight validator for risky tasks",
                    "Add tool recommendation hinting before execution",
                    "Split oversized tasks into smaller executable units",
                ],
                tags=["retry", "efficiency", "planning"],
            )
        ]

    def _gaps_from_latency(self, since: datetime) -> List[CapabilityGap]:
        rows = self._memory.long_term.search_text("latency slow timeout performance", limit=260)
        relevant = []
        for row in rows:
            stamp = self._best_time(row.value)
            if stamp is not None and stamp < since:
                continue
            relevant.append(row)

        if len(relevant) < 2:
            return []

        scores = [min(1.0, 0.45 + float(item.importance) * 0.4) for item in relevant[:20]]
        impact = mean(scores) if scores else 0.62

        return [
            self._mk_gap(
                category="performance",
                title="Performance bottleneck indicators",
                description="Latency-related signals indicate missing performance optimization capability.",
                impact=impact,
                urgency=0.68,
                confidence=0.69,
                evidence=[f"{item.key}:{str(item.value)[:150]}" for item in relevant[:10]],
                suggested_actions=[
                    "Generate lightweight caching layer for repeated calls",
                    "Introduce faster parsing/serialization helpers",
                    "Add async task batching for I/O-heavy operations",
                ],
                tags=["performance", "latency"],
            )
        ]

    def _gaps_from_world_state(self) -> List[CapabilityGap]:
        state = self._world_model.current()
        out: List[CapabilityGap] = []

        if state.system_health in {"degraded", "critical"}:
            out.append(
                self._mk_gap(
                    category="resource_management",
                    title="Resource-aware execution capability missing",
                    description="World-state health indicates heavy load and calls for adaptive execution strategies.",
                    impact=0.76,
                    urgency=0.81,
                    confidence=0.73,
                    evidence=[f"health={state.system_health}", f"constraints={state.constraints}"],
                    suggested_actions=[
                        "Generate adaptive rate limiter",
                        "Generate low-resource mode task selector",
                    ],
                    tags=["resource", "health", "adaptive"],
                )
            )

        if "high_stakes_domain" in state.constraints:
            out.append(
                self._mk_gap(
                    category="safety",
                    title="High-stakes guardrail coverage gap",
                    description="Detected high-stakes context requires stronger validation and explainability tooling.",
                    impact=0.86,
                    urgency=0.87,
                    confidence=0.8,
                    evidence=["constraint=high_stakes_domain", f"app={state.current_application}"],
                    suggested_actions=[
                        "Generate decision audit helper",
                        "Generate stricter output validator for high-risk flows",
                    ],
                    tags=["safety", "high_stakes"],
                )
            )

        return out

    def _gaps_from_semantic_signals(self) -> List[CapabilityGap]:
        queries = [
            "missing tool capability unable cannot",
            "manual repetitive task automation needed",
            "validation failed integration mismatch",
        ]
        out: List[CapabilityGap] = []
        for query in queries:
            hits = self._memory.semantic_search(query, top_k=8)
            if not hits:
                continue
            avg = sum(item.score for item in hits) / len(hits)
            if avg < 0.2:
                continue
            out.append(
                self._mk_gap(
                    category="capability_coverage",
                    title=f"Semantic deficiency pattern: {query}",
                    description="Semantic memory indicates recurring need for capability expansion.",
                    impact=min(0.92, 0.35 + avg),
                    urgency=min(0.9, 0.4 + avg),
                    confidence=min(0.88, 0.38 + avg),
                    evidence=[f"{item.doc_id}:{item.score:.3f}" for item in hits[:6]],
                    suggested_actions=[
                        "Generate missing helper tools",
                        "Add capability-specific validators",
                        "Add auto-discovery hints in planner/orchestrator",
                    ],
                    tags=["semantic", "coverage"],
                )
            )
        return out

    def _build_metrics(self, gaps: List[CapabilityGap]) -> Dict[str, Any]:
        if not gaps:
            return {"count": 0, "avg_score": 0.0, "max_score": 0.0, "categories": {}}

        categories: Dict[str, int] = {}
        for row in gaps:
            categories[row.category] = categories.get(row.category, 0) + 1

        scores = [row.score for row in gaps]
        return {
            "count": len(gaps),
            "avg_score": round(mean(scores), 4),
            "max_score": round(max(scores), 4),
            "categories": categories,
        }

    def _persist(self, report: CapabilityReport) -> None:
        payload = {
            "generated_at": report.generated_at,
            "window_hours": report.window_hours,
            "metrics": dict(report.metrics),
            "gaps": [
                {
                    "gap_id": row.gap_id,
                    "category": row.category,
                    "title": row.title,
                    "score": row.score,
                    "impact": row.impact,
                    "urgency": row.urgency,
                    "confidence": row.confidence,
                    "tags": list(row.tags),
                }
                for row in report.gaps
            ],
        }
        self._memory.remember_short_term(
            key="evolution:last_capability_report",
            value=payload,
            tags=["evolution", "capability_report"],
        )
        self._memory.remember_long_term(
            key=f"evolution:capability_report:{report.generated_at}",
            value=payload,
            source="evolution_system.capability_analyzer",
            importance=0.78,
            tags=["evolution", "capability_report"],
        )

    @staticmethod
    def _deduplicate(rows: List[CapabilityGap]) -> List[CapabilityGap]:
        merged: Dict[str, CapabilityGap] = {}
        for row in rows:
            key = f"{row.category}|{row.title.lower()}"
            current = merged.get(key)
            if current is None:
                merged[key] = row
                continue
            current.impact = max(current.impact, row.impact)
            current.urgency = max(current.urgency, row.urgency)
            current.confidence = max(current.confidence, row.confidence)
            current.evidence = list(dict.fromkeys(current.evidence + row.evidence))
            current.suggested_actions = list(dict.fromkeys(current.suggested_actions + row.suggested_actions))
            current.tags = list(dict.fromkeys(current.tags + row.tags))
            current.metadata.update(row.metadata)
        return list(merged.values())

    @staticmethod
    def _mk_gap(
        *,
        category: str,
        title: str,
        description: str,
        impact: float,
        urgency: float,
        confidence: float,
        evidence: List[str],
        suggested_actions: List[str],
        tags: List[str],
    ) -> CapabilityGap:
        return CapabilityGap(
            gap_id=f"gap-{datetime.now(timezone.utc).timestamp()}-{abs(hash(title)) % 100000}",
            category=category,
            title=title,
            description=description,
            impact=round(max(0.05, min(1.0, impact)), 4),
            urgency=round(max(0.05, min(1.0, urgency)), 4),
            confidence=round(max(0.05, min(1.0, confidence)), 4),
            evidence=list(evidence),
            suggested_actions=list(suggested_actions),
            tags=list(dict.fromkeys(tags + [category])),
            metadata={"detected_at": datetime.now(timezone.utc).isoformat()},
        )

    @staticmethod
    def _best_time(payload: Dict[str, Any]) -> datetime | None:
        keys = ["updated_at", "created_at", "timestamp", "completed_at", "started_at"]
        for key in keys:
            value = payload.get(key)
            if not value:
                continue
            try:
                return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except Exception:
                continue
        return None
