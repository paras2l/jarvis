"""Reasoning core coordinator for Pixi.

Orchestrates:
context + world model -> goal inference -> constraint analysis -> strategy
generation -> decision selection -> planner handoff payload.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List
import uuid

from Pixi.memory.memory_system import MemorySystem
from Pixi.reasoning_engine.constraint_analyzer import ConstraintAnalysisResult, ConstraintAnalyzer
from Pixi.reasoning_engine.decision_engine import ReasoningDecision, ReasoningDecisionEngine
from Pixi.reasoning_engine.goal_inference import GoalInferenceEngine, GoalInferenceResult
from Pixi.reasoning_engine.strategy_generator import StrategyGenerationResult, StrategyGenerator
from Pixi.system_bus.bus_core import SystemBus
from Pixi.world_model.world_state import WorldStateModel, WorldStateSnapshot


@dataclass(slots=True)
class ReasoningReport:
    """End-to-end reasoning output passed into planning stage."""

    reasoning_id: str
    objective: str
    planning_goal: str
    confidence: float
    inferred: GoalInferenceResult
    constraints: ConstraintAnalysisResult
    strategies: StrategyGenerationResult
    decision: ReasoningDecision
    world_state: WorldStateSnapshot
    trace: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class ReasoningCore:
    """Central coordinator for Pixi reasoning pipeline."""

    def __init__(
        self,
        memory: MemorySystem,
        world_state_model: WorldStateModel | None = None,
        goal_inference_engine: GoalInferenceEngine | None = None,
        constraint_analyzer: ConstraintAnalyzer | None = None,
        strategy_generator: StrategyGenerator | None = None,
        decision_engine: ReasoningDecisionEngine | None = None,
        system_bus: SystemBus | None = None,
    ) -> None:
        self._memory = memory
        self._world_state = world_state_model or WorldStateModel(memory)
        self._goal_inference = goal_inference_engine or GoalInferenceEngine()
        self._constraint_analyzer = constraint_analyzer or ConstraintAnalyzer()
        self._strategy_generator = strategy_generator or StrategyGenerator()
        self._decision_engine = decision_engine or ReasoningDecisionEngine()
        self._bus = system_bus
        self._cycle = 0

    def reason(
        self,
        objective_text: str,
        context: Any,
        *,
        queued_goals: List[Dict[str, Any]] | None = None,
        objective_metadata: Dict[str, Any] | None = None,
    ) -> ReasoningReport:
        """Run full reasoning pipeline and return report for planner handoff."""
        self._cycle += 1
        reasoning_id = f"reason-{self._cycle}-{uuid.uuid4().hex[:8]}"
        metadata = dict(objective_metadata or {})

        world_state = self._world_state.refresh(context)
        system_signals = self._compose_system_signals(context, world_state, metadata)

        inferred = self._goal_inference.infer(
            objective_text,
            context,
            queued_goals=queued_goals,
            world_signals=system_signals,
        )

        constraints = self._constraint_analyzer.analyze(
            inferred,
            context,
            world_state=world_state,
            system_signals=system_signals,
        )

        strategies = self._strategy_generator.generate(
            inferred,
            constraints,
            context=context,
            world_state=world_state,
            max_strategies=6,
        )

        decision = self._decision_engine.decide(
            inferred,
            constraints,
            strategies,
            context=context,
            world_state=world_state,
        )

        trace = self._build_trace(reasoning_id, inferred, constraints, decision)

        report = ReasoningReport(
            reasoning_id=reasoning_id,
            objective=inferred.inferred_goal,
            planning_goal=decision.planning_goal,
            confidence=decision.confidence,
            inferred=inferred,
            constraints=constraints,
            strategies=strategies,
            decision=decision,
            world_state=world_state,
            trace=trace,
            metadata={
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "cycle": self._cycle,
                **metadata,
            },
        )

        self._persist(report)
        self._publish(
            "reasoning.completed",
            {
                "reasoning_id": report.reasoning_id,
                "objective": report.objective,
                "planning_goal": report.planning_goal,
                "confidence": report.confidence,
            },
        )
        return report

    def reason_from_context(
        self,
        context: Any,
        *,
        queued_goals: List[Dict[str, Any]] | None = None,
        metadata: Dict[str, Any] | None = None,
    ) -> ReasoningReport:
        """Run reasoning in proactive mode when explicit objective is absent."""
        world_state = self._world_state.refresh(context)
        system_signals = self._compose_system_signals(context, world_state, metadata or {})
        inferred = self._goal_inference.infer_from_signals(context, world_signals=system_signals)

        return self.reason(
            inferred.inferred_goal,
            context,
            queued_goals=queued_goals,
            objective_metadata=metadata,
        )

    def handle_bus_message(self, message: Dict[str, Any]) -> Dict[str, Any]:
        topic = str(message.get("topic", "")).lower()
        payload = dict(message.get("payload", {}))
        context = payload.get("context")

        if topic in {"reasoning.request", "reasoning.run", "brain.reasoning"}:
            report = self.reason(
                str(payload.get("objective", payload.get("goal", ""))),
                context,
                queued_goals=list(payload.get("queued_goals", [])),
                objective_metadata=dict(payload.get("metadata", {})),
            )
            return {
                "reasoning_id": report.reasoning_id,
                "planning_goal": report.planning_goal,
                "confidence": report.confidence,
            }

        if topic in {"reasoning.from_context", "reasoning.proactive"}:
            report = self.reason_from_context(
                context,
                queued_goals=list(payload.get("queued_goals", [])),
                metadata=dict(payload.get("metadata", {})),
            )
            return {
                "reasoning_id": report.reasoning_id,
                "planning_goal": report.planning_goal,
                "confidence": report.confidence,
            }

        return {"status": "ignored", "topic": topic}

    def planning_payload(self, report: ReasoningReport) -> Dict[str, Any]:
        """Return planner handoff payload for use by runtime brain loop."""
        return {
            "goal": report.planning_goal,
            "reasoning_id": report.reasoning_id,
            "objective": report.objective,
            "confidence": report.confidence,
            "selected_strategy": report.decision.selected_strategy_id,
            "selected_style": report.decision.selected_style,
            "horizon": report.inferred.horizon,
            "urgency": report.inferred.urgency,
            "constraints_mode": report.constraints.recommended_mode,
            "world_health": report.world_state.system_health,
            "trace": report.trace[:10],
        }

    def diagnostics(self, report: ReasoningReport) -> Dict[str, Any]:
        """Diagnostics snapshot for debugging and runtime introspection."""
        return {
            "reasoning_id": report.reasoning_id,
            "objective": report.objective,
            "planning_goal": report.planning_goal,
            "confidence": report.confidence,
            "goal_inference": self._goal_inference.summarize(report.inferred),
            "constraints": self._constraint_analyzer.summarize(report.constraints),
            "strategies": self._strategy_generator.summarize(report.strategies),
            "decision": self._decision_engine.summarize(report.decision),
            "world_state": {
                "app": report.world_state.current_application,
                "activity": report.world_state.user_activity,
                "health": report.world_state.system_health,
                "confidence": report.world_state.confidence,
            },
            "trace": report.trace,
        }

    def _compose_system_signals(
        self,
        context: Any,
        world_state: WorldStateSnapshot,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        signals: Dict[str, Any] = {}

        raw = getattr(context, "signals", {})
        if isinstance(raw, dict):
            for key, value in raw.items():
                signals[key] = value

        metrics = signals.get("system_metrics", {})
        if isinstance(metrics, dict):
            cpu = float(metrics.get("cpu_percent", 0.0) or 0.0)
            mem = float(metrics.get("memory_percent", 0.0) or 0.0)
            signals["resource_hot"] = cpu > 85 or mem > 85

        signals["system_health"] = world_state.system_health
        signals["high_stakes_domain"] = any("high_stakes" in str(item) for item in world_state.constraints)
        signals["deadline_detected"] = any("deadline" in str(item).lower() for item in world_state.constraints)
        signals["pending_notifications"] = len(signals.get("pending_notifications", [])) if isinstance(signals.get("pending_notifications"), list) else int(metadata.get("pending_notifications", 0) or 0)

        if "emergency" in str(metadata.get("mode", "")).lower():
            signals["emergency_mode"] = True

        return signals

    @staticmethod
    def _build_trace(
        reasoning_id: str,
        inferred: GoalInferenceResult,
        constraints: ConstraintAnalysisResult,
        decision: ReasoningDecision,
    ) -> List[str]:
        trace = [
            f"reasoning_id={reasoning_id}",
            f"inferred_goal={inferred.inferred_goal}",
            f"objective_type={inferred.objective_type}",
            f"inference_confidence={inferred.confidence}",
            f"constraint_mode={constraints.recommended_mode}",
            f"constraint_feasibility={constraints.overall_feasibility}",
            f"strategy_selected={decision.selected_strategy_id}",
            f"decision_confidence={decision.confidence}",
        ]
        if decision.scores:
            trace.append("scoreboard=" + ",".join(f"{row.strategy_id}:{row.total:.3f}" for row in decision.scores[:4]))
        return trace

    def _persist(self, report: ReasoningReport) -> None:
        inference_summary = self._goal_inference.summarize(report.inferred)
        constraint_summary = self._constraint_analyzer.summarize(report.constraints)
        strategy_summary = self._strategy_generator.summarize(report.strategies)
        decision_summary = self._decision_engine.summarize(report.decision)

        payload = {
            "reasoning_id": report.reasoning_id,
            "objective": report.objective,
            "planning_goal": report.planning_goal,
            "confidence": report.confidence,
            "world_health": report.world_state.system_health,
            "inference": inference_summary,
            "constraints": constraint_summary,
            "strategies": strategy_summary,
            "decision": decision_summary,
            "trace": report.trace,
            "metadata": report.metadata,
        }

        self._memory.remember_short_term(
            key="reasoning:last_report",
            value=payload,
            tags=["reasoning", "pipeline"],
        )
        self._memory.remember_short_term(
            key=f"reasoning:cycle:{report.reasoning_id}",
            value=payload,
            tags=["reasoning", "cycle"],
        )
        self._memory.remember_long_term(
            key=f"reasoning:report:{report.reasoning_id}",
            value=payload,
            source="reasoning_core",
            importance=0.79,
            tags=["reasoning", "decision"],
        )
        self._memory.remember_semantic(
            doc_id=f"reasoning:{report.reasoning_id}",
            text=(
                f"goal={report.objective}; selected={report.decision.selected_strategy_name}; "
                f"style={report.decision.selected_style}; confidence={report.confidence}; "
                f"health={report.world_state.system_health}"
            ),
            metadata={"type": "reasoning_report", "confidence": report.confidence},
        )

    def _publish(self, topic: str, payload: Dict[str, Any]) -> None:
        if self._bus is None:
            return
        self._bus.publish_event(
            event_type=topic,
            source="reasoning_engine",
            payload=payload,
            topic=topic,
            tags=["reasoning", "system_bus"],
        )

