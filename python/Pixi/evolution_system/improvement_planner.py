"""Improvement planner for Evolution System.

Transforms capability gaps into concrete, ordered implementation plans
with explicit safety and validation requirements.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List

from Pixi.evolution_system.capability_analyzer import CapabilityGap
from Pixi.memory.memory_system import MemorySystem


@dataclass(slots=True)
class PlanStep:
    step_id: str
    title: str
    description: str
    owner: str
    safety_gate: str
    acceptance_criteria: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ImprovementPlan:
    plan_id: str
    gap_id: str
    feature_name: str
    objective: str
    priority: int
    estimated_effort: str
    risk_level: str
    target_files: List[str] = field(default_factory=list)
    proposed_tags: List[str] = field(default_factory=list)
    steps: List[PlanStep] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PlanBundle:
    generated_at: str
    plans: List[ImprovementPlan] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)


class ImprovementPlanner:
    """Plan generation for capability upgrades and new tools."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

    def create_plans(
        self,
        gaps: Iterable[CapabilityGap],
        *,
        max_plans: int = 10,
    ) -> PlanBundle:
        rows = list(gaps)
        ordered = sorted(rows, key=lambda item: item.score, reverse=True)[: max(1, int(max_plans))]

        plans = [self._plan_for_gap(gap) for gap in ordered]
        bundle = PlanBundle(
            generated_at=datetime.now(timezone.utc).isoformat(),
            plans=plans,
            metrics=self._metrics(plans),
        )
        self._persist(bundle)
        return bundle

    def _plan_for_gap(self, gap: CapabilityGap) -> ImprovementPlan:
        plan_id = f"plan-{int(datetime.now(timezone.utc).timestamp())}-{abs(hash(gap.gap_id)) % 100000}"
        feature_name = self._feature_name(gap)
        priority = self._priority(gap)
        risk_level = self._risk_level(gap)
        effort = self._effort_estimate(gap, risk_level)
        target_files = self._target_files(gap)
        tags = list(dict.fromkeys([gap.category, *gap.tags, "evolution"]))

        steps = [
            PlanStep(
                step_id=f"{plan_id}-s1",
                title="Design feature contract",
                description="Define interfaces, expected behavior, and non-functional constraints.",
                owner="evolution_planner",
                safety_gate="design_review",
                acceptance_criteria=[
                    "Inputs and outputs are explicit",
                    "Failure modes are documented",
                    "Core file impact is identified",
                ],
            ),
            PlanStep(
                step_id=f"{plan_id}-s2",
                title="Generate implementation",
                description="Generate new feature module or patch candidate files in staging.",
                owner="feature_generator",
                safety_gate="generation_complete",
                acceptance_criteria=[
                    "Generated files compile",
                    "All changes are tracked in manifest",
                    "No production write occurs yet",
                ],
            ),
            PlanStep(
                step_id=f"{plan_id}-s3",
                title="Sandbox validation",
                description="Run isolated tests for syntax, behavior, and guardrail constraints.",
                owner="sandbox_tester",
                safety_gate="sandbox_pass",
                acceptance_criteria=[
                    "No critical errors",
                    "Expected behavior verified",
                    "Safety assertions pass",
                ],
            ),
            PlanStep(
                step_id=f"{plan_id}-s4",
                title="Deployment approval",
                description="Require explicit validation and deployment gate checks.",
                owner="deployment_controller",
                safety_gate="approval",
                acceptance_criteria=[
                    "Validation approved",
                    "Rollback snapshot prepared",
                    "Feature registry updated",
                ],
            ),
        ]

        return ImprovementPlan(
            plan_id=plan_id,
            gap_id=gap.gap_id,
            feature_name=feature_name,
            objective=gap.description,
            priority=priority,
            estimated_effort=effort,
            risk_level=risk_level,
            target_files=target_files,
            proposed_tags=tags,
            steps=steps,
            metadata={
                "source_gap_title": gap.title,
                "source_gap_score": gap.score,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "suggested_actions": list(gap.suggested_actions),
            },
        )

    @staticmethod
    def _feature_name(gap: CapabilityGap) -> str:
        base = gap.title.lower().replace(" ", "_").replace("-", "_")
        cleaned = "".join(ch for ch in base if ch.isalnum() or ch == "_").strip("_")
        return f"evo_{cleaned or 'feature'}"

    @staticmethod
    def _priority(gap: CapabilityGap) -> int:
        score = gap.score
        if score >= 0.88:
            return 95
        if score >= 0.78:
            return 85
        if score >= 0.68:
            return 75
        return 62

    @staticmethod
    def _risk_level(gap: CapabilityGap) -> str:
        if gap.category in {"safety", "reliability"} and gap.impact >= 0.8:
            return "high"
        if gap.impact >= 0.72 or gap.urgency >= 0.8:
            return "medium"
        return "low"

    @staticmethod
    def _effort_estimate(gap: CapabilityGap, risk_level: str) -> str:
        base = 1
        if gap.category in {"performance", "resource_management", "safety"}:
            base += 1
        if risk_level == "high":
            base += 2
        elif risk_level == "medium":
            base += 1

        if base >= 4:
            return "large"
        if base == 3:
            return "medium"
        return "small"

    @staticmethod
    def _target_files(gap: CapabilityGap) -> List[str]:
        mapping = {
            "reliability": [
                "python/Pixi/extensions/reliability_guard.py",
                "python/Pixi/extensions/fallback_executor.py",
            ],
            "efficiency": [
                "python/Pixi/extensions/workflow_optimizer.py",
            ],
            "performance": [
                "python/Pixi/extensions/performance_optimizer.py",
                "python/Pixi/extensions/cache_layer.py",
            ],
            "resource_management": [
                "python/Pixi/extensions/resource_governor.py",
            ],
            "safety": [
                "python/Pixi/extensions/safety_auditor.py",
                "python/Pixi/extensions/decision_validator.py",
            ],
            "capability_coverage": [
                "python/Pixi/extensions/capability_bridge.py",
            ],
        }
        return list(mapping.get(gap.category, ["python/Pixi/extensions/generic_evolution_feature.py"]))

    @staticmethod
    def _metrics(plans: List[ImprovementPlan]) -> Dict[str, Any]:
        if not plans:
            return {"count": 0, "avg_priority": 0.0, "risk": {}}

        risk: Dict[str, int] = {}
        for row in plans:
            risk[row.risk_level] = risk.get(row.risk_level, 0) + 1

        return {
            "count": len(plans),
            "avg_priority": round(mean([row.priority for row in plans]), 2),
            "risk": risk,
        }

    def _persist(self, bundle: PlanBundle) -> None:
        payload = {
            "generated_at": bundle.generated_at,
            "metrics": dict(bundle.metrics),
            "plans": [
                {
                    "plan_id": row.plan_id,
                    "gap_id": row.gap_id,
                    "feature_name": row.feature_name,
                    "objective": row.objective,
                    "priority": row.priority,
                    "estimated_effort": row.estimated_effort,
                    "risk_level": row.risk_level,
                    "target_files": list(row.target_files),
                    "tags": list(row.proposed_tags),
                    "steps": [
                        {
                            "step_id": step.step_id,
                            "title": step.title,
                            "safety_gate": step.safety_gate,
                            "acceptance_criteria": list(step.acceptance_criteria),
                        }
                        for step in row.steps
                    ],
                }
                for row in bundle.plans
            ],
        }
        self._memory.remember_short_term(
            key="evolution:last_plan_bundle",
            value=payload,
            tags=["evolution", "planning"],
        )
        self._memory.remember_long_term(
            key=f"evolution:plan_bundle:{bundle.generated_at}",
            value=payload,
            source="evolution_system.improvement_planner",
            importance=0.76,
            tags=["evolution", "planning"],
        )

