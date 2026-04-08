"""Continuous cognitive loop for Pixi.

This is the heartbeat of the architecture. It continuously observes, reasons,
plans, acts, reflects, and learns while checking system stability between cycles.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import threading
import time
from typing import Any, Dict, List, Optional

from Pixi.brain_loop.action_cycle import ActionCycle, ActionCycleResult
from Pixi.brain_loop.learning_cycle import LearningCycle, LearningCycleResult
from Pixi.brain_loop.observation_cycle import ObservationCycle, ObservationRecord
from Pixi.brain_loop.reasoning_cycle import ReasoningCycle, ReasoningCycleResult
from Pixi.brain_loop.reflection_cycle import ReflectionCycle, ReflectionCycleResult
from Pixi.core.contracts import ContextSnapshot
from Pixi.stability_core.stability_core import SystemStabilityCore, StabilityCycleResult


@dataclass(slots=True)
class BrainLoopState:
    loop_id: str = "brain-loop"
    cycle_counter: int = 0
    last_cycle_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_observation_at: str = ""
    last_reasoning_at: str = ""
    last_action_at: str = ""
    last_reflection_at: str = ""
    last_learning_at: str = ""
    active: bool = False


@dataclass(slots=True)
class BrainLoopCycleReport:
    cycle_id: str
    timestamp: str
    observation: Dict[str, Any]
    reasoning: Dict[str, Any]
    action: Dict[str, Any]
    reflection: Dict[str, Any]
    learning: Dict[str, Any]
    stability: Dict[str, Any]
    notes: List[str] = field(default_factory=list)


@dataclass(slots=True)
class BrainLoopCore:
    """Runs the continuous cognitive loop and coordinates all major modules."""

    observation_cycle: ObservationCycle
    reasoning_cycle: ReasoningCycle
    action_cycle: ActionCycle
    reflection_cycle: ReflectionCycle
    learning_cycle: LearningCycle
    stability_core: SystemStabilityCore
    state: BrainLoopState = field(default_factory=BrainLoopState)
    loop_interval_seconds: float = 1.5
    max_history: int = 250
    cycle_history: List[BrainLoopCycleReport] = field(default_factory=list)

    _running: bool = False
    _thread: Optional[threading.Thread] = None
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def start(self) -> None:
        """Start the continuous loop in the background."""

        with self._lock:
            if self._running:
                return
            self._running = True
            self.state.active = True
            self._thread = threading.Thread(target=self._run_forever, name="Pixi-brain-loop", daemon=True)
            self._thread.start()

    def stop(self, timeout_seconds: float = 3.0) -> None:
        """Stop the continuous loop gracefully."""

        with self._lock:
            self._running = False
            self.state.active = False
            thread = self._thread
            self._thread = None
        self.stability_core.stop_background(timeout_seconds=timeout_seconds)
        if thread is not None and thread.is_alive():
            thread.join(timeout=timeout_seconds)

    def run_cycle(self, context: ContextSnapshot, *, metadata: Optional[Dict[str, Any]] = None) -> BrainLoopCycleReport:
        """Execute one full observation-to-learning cycle."""

        self.state.cycle_counter += 1
        cycle_id = f"brain-{self.state.cycle_counter}-{int(time.time())}"
        metadata = metadata or {}

        stability = self.stability_core.run_once()
        observation = self.observation_cycle.observe(context, metadata=metadata)
        reasoning = self.reasoning_cycle.run(self.observation_cycle.summarize(observation), context)
        action = self.action_cycle.run(reasoning.planning_payload)
        reflection = self.reflection_cycle.run(
            self.action_cycle.summarize(action),
            self.reasoning_cycle.summarize(reasoning),
        )
        learning = self.learning_cycle.run(
            self.reflection_cycle.summarize(reflection),
            self.reasoning_cycle.summarize(reasoning),
        )

        report = BrainLoopCycleReport(
            cycle_id=cycle_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            observation=self.observation_cycle.summarize(observation),
            reasoning=self.reasoning_cycle.summarize(reasoning),
            action=self.action_cycle.summarize(action),
            reflection=self.reflection_cycle.summarize(reflection),
            learning=self.learning_cycle.summarize(learning),
            stability=self._stability_summary(stability),
            notes=self._derive_notes(stability, observation, reasoning, action, reflection, learning),
        )

        self._update_state(report)
        self._append(report)
        self._persist(report)
        return report

    def run_for_cycles(self, context: ContextSnapshot, cycle_count: int, *, metadata: Optional[Dict[str, Any]] = None) -> List[BrainLoopCycleReport]:
        """Run a bounded number of cycles for tests or foreground execution."""

        reports: List[BrainLoopCycleReport] = []
        for _ in range(max(0, cycle_count)):
            reports.append(self.run_cycle(context, metadata=metadata))
        return reports

    def latest_report(self) -> Optional[BrainLoopCycleReport]:
        if not self.cycle_history:
            return None
        return self.cycle_history[-1]

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "state": {
                "loop_id": self.state.loop_id,
                "cycle_counter": self.state.cycle_counter,
                "last_cycle_at": self.state.last_cycle_at,
                "active": self.state.active,
            },
            "latest_report": self.latest_report().__dict__ if self.latest_report() else None,
            "observation": self.observation_cycle.diagnostics(),
            "reasoning": self.reasoning_cycle.diagnostics(),
            "action": self.action_cycle.diagnostics(),
            "reflection": self.reflection_cycle.diagnostics(),
            "learning": self.learning_cycle.diagnostics(),
            "stability": self.stability_core.diagnostics(),
        }

    def _run_forever(self) -> None:
        while self._running:
            try:
                context = self._build_context()
                self.run_cycle(context, metadata={"mode": "continuous"})
            except Exception as exc:  # noqa: BLE001
                self.stability_core.handle_failure(error=f"brain_loop_cycle_error:{exc}")
            time.sleep(max(0.5, self.loop_interval_seconds))

    def _build_context(self) -> ContextSnapshot:
        latest_observation = self.observation_cycle.last_observation
        if latest_observation is not None:
            ctx = latest_observation.context
            return ContextSnapshot(
                current_application=ctx.current_application,
                user_activity=ctx.user_activity,
                time_of_day=ctx.time_of_day,
                signals=dict(ctx.signals),
            )
        return ContextSnapshot(
            current_application="unknown",
            user_activity="idle",
            time_of_day="unknown",
            signals={"brain_loop": True},
        )

    @staticmethod
    def _stability_summary(stability: StabilityCycleResult) -> Dict[str, Any]:
        return {
            "timestamp": stability.timestamp,
            "throttle_applied": stability.throttle_applied,
            "resource_snapshot": dict(stability.resource_snapshot),
            "health_snapshot": dict(stability.health_snapshot),
            "notes": list(stability.notes),
        }

    @staticmethod
    def _derive_notes(
        stability: StabilityCycleResult,
        observation: ObservationRecord,
        reasoning: ReasoningCycleResult,
        action: ActionCycleResult,
        reflection: ReflectionCycleResult,
        learning: LearningCycleResult,
    ) -> List[str]:
        notes: List[str] = []
        if stability.throttle_applied:
            notes.append("Stability core applied throttling during cycle.")
        if observation.world_state.system_health in {"degraded", "critical"}:
            notes.append("Observation detected stressed environment.")
        if reasoning.reasoning_report.confidence < 0.7:
            notes.append("Reasoning confidence remained moderate.")
        if int(action.planner_feedback.get("failed", 0)) > 0:
            notes.append("Agent execution produced failures.")
        if reflection.reflection_score < 0.65:
            notes.append("Reflection suggests cycle should become more conservative.")
        if learning.confidence_adjustment < 0:
            notes.append("Learning reduced confidence for future cycles.")
        return notes

    def _update_state(self, report: BrainLoopCycleReport) -> None:
        self.state.last_cycle_at = report.timestamp
        self.state.last_observation_at = report.observation.get("timestamp", report.timestamp)
        self.state.last_reasoning_at = report.reasoning.get("timestamp", report.timestamp)
        self.state.last_action_at = report.timestamp
        self.state.last_reflection_at = report.reflection.get("timestamp", report.timestamp)
        self.state.last_learning_at = report.learning.get("timestamp", report.timestamp)

    def _append(self, report: BrainLoopCycleReport) -> None:
        self.cycle_history.append(report)
        if len(self.cycle_history) > self.max_history:
            self.cycle_history = self.cycle_history[-self.max_history :]

    def _persist(self, report: BrainLoopCycleReport) -> None:
        stability = self.stability_core.memory_system
        if stability is None:
            return
        payload = {
            "cycle_id": report.cycle_id,
            "timestamp": report.timestamp,
            "state": self.diagnostics()["state"],
            "observation": report.observation,
            "reasoning": report.reasoning,
            "action": report.action,
            "reflection": report.reflection,
            "learning": report.learning,
            "stability": report.stability,
            "notes": report.notes,
        }
        stability.remember_short_term(
            key="brain_loop:last_cycle",
            value=payload,
            tags=["brain_loop", "cycle"],
        )
        stability.remember_long_term(
            key=f"brain_loop:cycle:{report.cycle_id}",
            value=payload,
            source="brain_loop.brain_loop_core",
            importance=0.9,
            tags=["brain_loop", "cycle"],
        )

