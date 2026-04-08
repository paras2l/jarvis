"""Capability gap detector for Pixi self-improvement."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from Pixi.memory.memory_system import MemorySystem
from Pixi.self_improvement.performance_analyzer import ErrorFrequencyRecord, PerformanceReport
from Pixi.world_model.world_state import WorldStateModel


@dataclass(slots=True)
class CapabilityGap:
    gap_id: str
    category: str
    title: str
    description: str
    severity: float
    impact_score: float
    confidence: float
    missing_capability: str
    evidence: List[str] = field(default_factory=list)
    suggested_actions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GapDetectionResult:
    generated_at: str
    total_gaps: int
    high_priority_gaps: int
    gaps: List[CapabilityGap] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class CapabilityGapDetector:
    def __init__(self, memory: MemorySystem, world_state: WorldStateModel) -> None:
        self._memory = memory
        self._world_state = world_state

    def detect(self, report: PerformanceReport) -> GapDetectionResult:
        now = datetime.now(timezone.utc).isoformat()
        gaps: List[CapabilityGap] = []

        gaps.extend(self._gaps_from_success_rate(report))
        gaps.extend(self._gaps_from_retries(report))
        gaps.extend(self._gaps_from_error_frequency(report.top_errors, report.error_frequency_per_hour))
        gaps.extend(self._gaps_from_slow_signals(report))
        gaps.extend(self._gaps_from_hints(report.weak_skill_hints))

        deduped = self._deduplicate(gaps)
        self._normalize(deduped)

        result = GapDetectionResult(
            generated_at=now,
            total_gaps=len(deduped),
            high_priority_gaps=sum(1 for row in deduped if row.severity >= 0.72),
            gaps=deduped,
            metadata={
                "window_minutes": report.window_minutes,
                "success_rate": report.success_rate,
                "error_frequency_per_hour": report.error_frequency_per_hour,
                "system_health": self._world_state.current().system_health,
            },
        )
        self._persist(result)
        return result

    def top_gaps(self, result: GapDetectionResult, limit: int = 5) -> List[CapabilityGap]:
        return sorted(result.gaps, key=lambda row: (row.severity, row.impact_score), reverse=True)[: max(1, limit)]

    def _gaps_from_success_rate(self, report: PerformanceReport) -> List[CapabilityGap]:
        if report.total_tasks < 6:
            return []
        if report.success_rate < 0.6:
            return [
                self._mk(
                    "execution_reliability",
                    "Low task success rate",
                    "Pixi is failing a significant portion of runtime tasks.",
                    0.86,
                    0.88,
                    0.82,
                    "resilient_task_execution",
                    [f"success_rate={report.success_rate}", f"failed_tasks={report.failed_tasks}"],
                    ["Introduce fallback skills for common failures.", "Add preflight validation."],
                )
            ]
        if report.success_rate < 0.78:
            return [
                self._mk(
                    "execution_reliability",
                    "Moderate reliability gap",
                    "Task success rate is below desired reliability threshold.",
                    0.66,
                    0.72,
                    0.74,
                    "task_recovery_and_retry_optimization",
                    [f"success_rate={report.success_rate}"],
                    ["Improve retry policies by task type."],
                )
            ]
        return []

    def _gaps_from_retries(self, report: PerformanceReport) -> List[CapabilityGap]:
        if report.average_attempts < 1.6:
            return []
        return [
            self._mk(
                "execution_efficiency",
                "High retry pressure",
                "Tasks are frequently retried, increasing cost and latency.",
                min(0.92, 0.5 + report.average_attempts * 0.18),
                min(0.95, 0.45 + report.average_attempts * 0.15),
                0.75,
                "first_pass_accuracy",
                [f"average_attempts={report.average_attempts}"],
                ["Strengthen preconditions before invoking tools."],
            )
        ]

    def _gaps_from_error_frequency(self, top_errors: List[ErrorFrequencyRecord], error_frequency_per_hour: float) -> List[CapabilityGap]:
        if error_frequency_per_hour <= 2.0:
            return []
        severity = min(0.95, 0.45 + error_frequency_per_hour * 0.06)
        out: List[CapabilityGap] = []
        for row in top_errors[:4]:
            out.append(
                self._mk(
                    "error_resilience",
                    f"Frequent {row.error_type} in {row.component}",
                    f"Repeated {row.error_type} in {row.component}.{row.operation} indicates missing resilience patterns.",
                    severity,
                    min(0.95, 0.4 + row.count * 0.08),
                    0.78,
                    self._map_error(row.error_type),
                    [f"component={row.component}", f"operation={row.operation}", f"count={row.count}"],
                    ["Build targeted recovery wrappers.", "Add failure-path test cases."],
                )
            )
        return out

    def _gaps_from_slow_signals(self, report: PerformanceReport) -> List[CapabilityGap]:
        if not report.slow_signals:
            return []
        return [
            self._mk(
                "performance_optimization",
                "Slow execution paths detected",
                "Performance analysis indicates slow runtime actions and bottlenecks.",
                0.68,
                0.74,
                0.73,
                "latency_aware_planning_and_execution",
                [f"signal={name}" for name in report.slow_signals],
                ["Introduce fast-path tools for high-volume operations."],
            )
        ]

    def _gaps_from_hints(self, hints: List[str]) -> List[CapabilityGap]:
        mapping = {
            "skill_coverage": ("skill_coverage", "Missing skill coverage", "dynamic_skill_discovery_and_generation"),
            "autonomous_decisioning": ("autonomy", "Human-help dependency", "bounded_autonomous_decisioning"),
            "world_model_strategy_selection": ("strategic_reasoning", "World model confidence gap", "scenario_quality_improvement"),
        }
        out: List[CapabilityGap] = []
        for hint in hints:
            spec = mapping.get(hint)
            if spec is None:
                continue
            category, title, capability = spec
            out.append(
                self._mk(
                    category,
                    title,
                    f"Weak signal '{hint}' indicates capability weakness.",
                    0.72,
                    0.78,
                    0.72,
                    capability,
                    [f"hint={hint}"],
                    ["Create targeted learning and tool-generation tasks."],
                )
            )
        return out

    def _deduplicate(self, gaps: List[CapabilityGap]) -> List[CapabilityGap]:
        merged: Dict[str, CapabilityGap] = {}
        for gap in gaps:
            key = f"{gap.category}|{gap.missing_capability}"
            existing = merged.get(key)
            if existing is None:
                merged[key] = gap
                continue
            existing.severity = max(existing.severity, gap.severity)
            existing.impact_score = max(existing.impact_score, gap.impact_score)
            existing.confidence = max(existing.confidence, gap.confidence)
            existing.evidence = self._merge_unique(existing.evidence, gap.evidence)
            existing.suggested_actions = self._merge_unique(existing.suggested_actions, gap.suggested_actions)
        return list(merged.values())

    @staticmethod
    def _normalize(gaps: List[CapabilityGap]) -> None:
        for row in gaps:
            row.severity = round(min(1.0, max(0.05, row.severity)), 4)
            row.impact_score = round(min(1.0, max(0.05, row.impact_score)), 4)
            row.confidence = round(min(1.0, max(0.05, row.confidence)), 4)

    def _persist(self, result: GapDetectionResult) -> None:
        payload = {
            "type": "gap_detection",
            "generated_at": result.generated_at,
            "total_gaps": result.total_gaps,
            "high_priority_gaps": result.high_priority_gaps,
            "gaps": [
                {
                    "gap_id": row.gap_id,
                    "category": row.category,
                    "title": row.title,
                    "severity": row.severity,
                    "impact_score": row.impact_score,
                    "confidence": row.confidence,
                    "missing_capability": row.missing_capability,
                    "evidence": row.evidence,
                }
                for row in result.gaps
            ],
            "metadata": result.metadata,
        }
        self._memory.remember_long_term(
            key=f"self_improvement:gaps:{result.generated_at}",
            value=payload,
            source="self_improvement.capability_gap_detector",
            importance=0.82,
            tags=["self_improvement", "gap_detection"],
        )
        self._memory.remember_short_term(
            key="self_improvement:last_gaps",
            value=payload,
            tags=["self_improvement", "gap_detection"],
        )

    def _mk(
        self,
        category: str,
        title: str,
        description: str,
        severity: float,
        impact: float,
        confidence: float,
        capability: str,
        evidence: List[str],
        actions: List[str],
    ) -> CapabilityGap:
        now_key = int(datetime.now(timezone.utc).timestamp() * 1000)
        return CapabilityGap(
            gap_id=f"gap-{category}-{now_key}-{abs(hash(title)) % 10000}",
            category=category,
            title=title,
            description=description,
            severity=severity,
            impact_score=impact,
            confidence=confidence,
            missing_capability=capability,
            evidence=list(evidence),
            suggested_actions=list(actions),
            metadata={"detected_at": datetime.now(timezone.utc).isoformat()},
        )

    @staticmethod
    def _map_error(error_type: str) -> str:
        if error_type == "TimeoutError":
            return "timeout_aware_execution"
        if error_type == "ConnectionError":
            return "resilient_network_interactions"
        if error_type == "PermissionError":
            return "policy_compliant_action_routing"
        if error_type == "ValueError":
            return "input_validation_and_sanitization"
        return "general_runtime_resilience"

    @staticmethod
    def _merge_unique(left: List[str], right: List[str]) -> List[str]:
        out: List[str] = []
        seen: set[str] = set()
        for item in left + right:
            key = item.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            out.append(key)
        return out


