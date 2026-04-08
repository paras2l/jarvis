"""Constraint analyzer for Jarvis reasoning.

Evaluates capability, risk, timing, and resource limits before strategy
construction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List

from jarvis.reasoning_engine.goal_inference import GoalInferenceResult


@dataclass(slots=True)
class ConstraintItem:
    """A single constraint signal with quantified severity."""

    name: str
    category: str
    severity: float
    hard: bool
    description: str
    mitigation: str
    evidence: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ConstraintAnalysisResult:
    """Aggregated constraint profile for the current reasoning cycle."""

    hard_constraints: List[ConstraintItem] = field(default_factory=list)
    soft_constraints: List[ConstraintItem] = field(default_factory=list)
    capability_score: float = 0.0
    risk_score: float = 0.0
    time_pressure: float = 0.0
    resource_pressure: float = 0.0
    overall_feasibility: float = 0.0
    recommended_mode: str = "balanced"
    metadata: Dict[str, Any] = field(default_factory=dict)


class ConstraintAnalyzer:
    """Evaluates system and objective limitations for reasoning."""

    def analyze(
        self,
        inference: GoalInferenceResult,
        context: Any,
        *,
        world_state: Any | None = None,
        system_signals: Dict[str, Any] | None = None,
    ) -> ConstraintAnalysisResult:
        """Analyze constraints for inferred objective under current runtime state."""
        signals = dict(system_signals or {})
        hard = self._collect_hard_constraints(inference, context, world_state, signals)
        soft = self._collect_soft_constraints(inference, context, world_state, signals)

        capability = self._compute_capability_score(inference, context, world_state, hard, soft)
        risk = self._compute_risk_score(inference, world_state, hard, soft)
        time_pressure = self._compute_time_pressure(inference, context, world_state, signals)
        resource_pressure = self._compute_resource_pressure(context, world_state, signals)

        feasibility = self._compute_feasibility(capability, risk, time_pressure, resource_pressure, hard)
        mode = self._recommended_mode(risk, time_pressure, resource_pressure, hard)

        return ConstraintAnalysisResult(
            hard_constraints=hard,
            soft_constraints=soft,
            capability_score=capability,
            risk_score=risk,
            time_pressure=time_pressure,
            resource_pressure=resource_pressure,
            overall_feasibility=feasibility,
            recommended_mode=mode,
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "objective_type": inference.objective_type,
                "horizon": inference.horizon,
            },
        )

    def summarize(self, result: ConstraintAnalysisResult) -> Dict[str, Any]:
        """Compact diagnostic summary for memory and logging."""
        return {
            "hard": [row.name for row in result.hard_constraints],
            "soft": [row.name for row in result.soft_constraints[:6]],
            "capability": result.capability_score,
            "risk": result.risk_score,
            "time_pressure": result.time_pressure,
            "resource_pressure": result.resource_pressure,
            "feasibility": result.overall_feasibility,
            "mode": result.recommended_mode,
        }

    def _collect_hard_constraints(
        self,
        inference: GoalInferenceResult,
        context: Any,
        world_state: Any | None,
        signals: Dict[str, Any],
    ) -> List[ConstraintItem]:
        out: List[ConstraintItem] = []

        if inference.objective_type == "execution" and inference.confidence < 0.5:
            out.append(
                ConstraintItem(
                    name="low_intent_confidence",
                    category="intent",
                    severity=0.75,
                    hard=True,
                    description="Objective inference confidence is too low for autonomous execution.",
                    mitigation="Request explicit clarification or execute a safe preview path.",
                    evidence=[f"confidence={inference.confidence}"],
                )
            )

        if self._world_health(world_state) == "critical":
            out.append(
                ConstraintItem(
                    name="critical_system_health",
                    category="resource",
                    severity=0.88,
                    hard=True,
                    description="Runtime system health is critical and may fail heavy operations.",
                    mitigation="Use lightweight strategy, defer heavy tasks, or degrade gracefully.",
                    evidence=["world_state.system_health=critical"],
                )
            )

        if signals.get("emergency_mode") is True:
            out.append(
                ConstraintItem(
                    name="emergency_mode_active",
                    category="safety",
                    severity=0.96,
                    hard=True,
                    description="Emergency mode blocks non-essential autonomous behaviors.",
                    mitigation="Only execute stop/restore/safety primitives.",
                    evidence=["system_signals.emergency_mode=true"],
                )
            )

        if self._is_high_stakes_domain(inference, world_state) and inference.urgency > 0.9:
            out.append(
                ConstraintItem(
                    name="high_stakes_requires_guardrail",
                    category="safety",
                    severity=0.8,
                    hard=True,
                    description="High-stakes objective under extreme urgency requires conservative control path.",
                    mitigation="Force risk-controlled strategy with explicit checkpoints.",
                    evidence=["objective_domain=high_stakes", f"urgency={inference.urgency}"],
                )
            )

        return out

    def _collect_soft_constraints(
        self,
        inference: GoalInferenceResult,
        context: Any,
        world_state: Any | None,
        signals: Dict[str, Any],
    ) -> List[ConstraintItem]:
        out: List[ConstraintItem] = []

        if inference.horizon in {"immediate", "short_term"}:
            out.append(
                ConstraintItem(
                    name="limited_time_window",
                    category="time",
                    severity=0.58,
                    hard=False,
                    description="The objective appears time-sensitive and favors shorter sequences.",
                    mitigation="Prefer fast strategy variants and defer optional steps.",
                )
            )

        if str(getattr(context, "time_of_day", "")).lower() in {"night", "late_night"}:
            out.append(
                ConstraintItem(
                    name="low_energy_window",
                    category="time",
                    severity=0.42,
                    hard=False,
                    description="Late-day execution may reduce quality for long cognitive tasks.",
                    mitigation="Use concise output paths or split execution into phases.",
                )
            )

        if self._world_health(world_state) == "degraded":
            out.append(
                ConstraintItem(
                    name="degraded_system_health",
                    category="resource",
                    severity=0.53,
                    hard=False,
                    description="System health is degraded; intensive workflows may slow down.",
                    mitigation="Avoid heavy parallel workloads.",
                    evidence=["world_state.system_health=degraded"],
                )
            )

        if signals.get("pending_notifications", 0) and int(signals.get("pending_notifications", 0)) > 3:
            out.append(
                ConstraintItem(
                    name="high_notification_noise",
                    category="attention",
                    severity=0.35,
                    hard=False,
                    description="High interrupt noise can lower execution reliability.",
                    mitigation="Use shorter checkpoints and explicit state persistence.",
                )
            )

        if inference.objective_type == "creative" and inference.urgency > 0.75:
            out.append(
                ConstraintItem(
                    name="quality_speed_tradeoff",
                    category="quality",
                    severity=0.47,
                    hard=False,
                    description="Creative tasks under urgency may require depth-speed tradeoffs.",
                    mitigation="Deliver draft-first then refinement pass.",
                )
            )

        return out

    def _compute_capability_score(
        self,
        inference: GoalInferenceResult,
        context: Any,
        world_state: Any | None,
        hard: List[ConstraintItem],
        soft: List[ConstraintItem],
    ) -> float:
        score = 0.72
        score += (inference.confidence - 0.5) * 0.2

        app = str(getattr(context, "current_application", "")).lower()
        if "vscode" in app and inference.objective_type == "delivery":
            score += 0.05
        if "trading" in app and inference.objective_type == "analysis":
            score += 0.04

        if self._world_health(world_state) == "degraded":
            score -= 0.06
        if self._world_health(world_state) == "critical":
            score -= 0.12

        score -= sum(row.severity for row in hard) * 0.06
        score -= sum(row.severity for row in soft) * 0.02

        return round(min(0.99, max(0.05, score)), 4)

    def _compute_risk_score(
        self,
        inference: GoalInferenceResult,
        world_state: Any | None,
        hard: List[ConstraintItem],
        soft: List[ConstraintItem],
    ) -> float:
        risk = 0.28
        if self._is_high_stakes_domain(inference, world_state):
            risk += 0.22
        risk += inference.urgency * 0.12
        risk += sum(item.severity for item in hard) * 0.18
        risk += sum(item.severity for item in soft) * 0.05
        return round(min(0.99, max(0.01, risk)), 4)

    def _compute_time_pressure(
        self,
        inference: GoalInferenceResult,
        context: Any,
        world_state: Any | None,
        signals: Dict[str, Any],
    ) -> float:
        pressure = 0.25
        pressure += inference.urgency * 0.5
        if inference.horizon == "immediate":
            pressure += 0.14
        if signals.get("deadline_detected"):
            pressure += 0.2
        if str(getattr(context, "time_of_day", "")).lower() in {"night", "late_night"}:
            pressure += 0.04
        if self._world_health(world_state) == "critical":
            pressure += 0.05
        return round(min(0.99, max(0.05, pressure)), 4)

    def _compute_resource_pressure(
        self,
        context: Any,
        world_state: Any | None,
        signals: Dict[str, Any],
    ) -> float:
        pressure = 0.22
        metrics = self._metrics_from_context(context)
        cpu = float(metrics.get("cpu_percent", 0.0) or 0.0)
        mem = float(metrics.get("memory_percent", 0.0) or 0.0)

        pressure += min(0.35, cpu / 300.0)
        pressure += min(0.35, mem / 280.0)

        health = self._world_health(world_state)
        if health == "degraded":
            pressure += 0.15
        if health == "critical":
            pressure += 0.3

        if signals.get("active_tasks"):
            pressure += min(0.1, float(signals.get("active_tasks", 0)) * 0.02)

        return round(min(0.99, max(0.02, pressure)), 4)

    def _compute_feasibility(
        self,
        capability: float,
        risk: float,
        time_pressure: float,
        resource_pressure: float,
        hard: List[ConstraintItem],
    ) -> float:
        feasibility = capability * 0.55 + (1.0 - risk) * 0.2 + (1.0 - time_pressure) * 0.15 + (1.0 - resource_pressure) * 0.1
        if hard:
            feasibility -= 0.12 + min(0.2, len(hard) * 0.05)
        return round(min(0.99, max(0.01, feasibility)), 4)

    @staticmethod
    def _recommended_mode(risk: float, time_pressure: float, resource_pressure: float, hard: List[ConstraintItem]) -> str:
        if hard or risk > 0.72:
            return "cautious"
        if time_pressure > 0.72 and resource_pressure < 0.62:
            return "aggressive"
        if resource_pressure > 0.75:
            return "resource_saving"
        return "balanced"

    @staticmethod
    def _metrics_from_context(context: Any) -> Dict[str, Any]:
        signals = getattr(context, "signals", {})
        if not isinstance(signals, dict):
            return {}
        metrics = signals.get("system_metrics", {})
        return metrics if isinstance(metrics, dict) else {}

    @staticmethod
    def _world_health(world_state: Any | None) -> str:
        return str(getattr(world_state, "system_health", "unknown")).lower() if world_state is not None else "unknown"

    @staticmethod
    def _is_high_stakes_domain(inference: GoalInferenceResult, world_state: Any | None) -> bool:
        text = f"{inference.inferred_goal} {inference.objective_type}".lower()
        if any(token in text for token in ["trade", "market", "financial", "transfer", "delete"]):
            return True
        constraints = list(getattr(world_state, "constraints", [])) if world_state is not None else []
        return any("high_stakes" in str(item) for item in constraints)
