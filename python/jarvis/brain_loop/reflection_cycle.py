"""Reflection cycle for the Jarvis cognitive loop.

Evaluates action outcomes, goal progress, and stability implications so the loop
can decide how to adapt on the next iteration.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from jarvis.goal_manager.goal_manager import GoalManager
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ReflectionCycleResult:
    reflection_id: str
    timestamp: str
    action_summary: Dict[str, Any]
    goal_progress: Dict[str, Any]
    stability_notes: List[str] = field(default_factory=list)
    reflection_score: float = 0.0
    recommended_focus: List[str] = field(default_factory=list)


@dataclass(slots=True)
class ReflectionCycle:
    """Reviews execution outcomes and quantifies goal progress."""

    memory: MemorySystem
    goal_manager: GoalManager
    last_result: Optional[ReflectionCycleResult] = None
    history: List[ReflectionCycleResult] = field(default_factory=list)
    history_limit: int = 200

    def run(self, action_summary: Dict[str, Any], reasoning_summary: Dict[str, Any]) -> ReflectionCycleResult:
        """Evaluate what happened and determine the next adaptation focus."""

        successful = int(action_summary.get("successful", 0))
        failed = int(action_summary.get("failed", 0))
        total = max(1, successful + failed)
        success_rate = successful / float(total)
        confidence = float(reasoning_summary.get("confidence", 0.5))

        score = round(min(1.0, success_rate * 0.6 + confidence * 0.4), 4)
        stability_notes = self._derive_notes(action_summary, reasoning_summary, score)
        goal_progress = self._extract_goal_progress(reasoning_summary)
        recommended_focus = self._derive_focus(stability_notes, goal_progress)

        result = ReflectionCycleResult(
            reflection_id=f"reflect-{uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            action_summary=dict(action_summary),
            goal_progress=goal_progress,
            stability_notes=stability_notes,
            reflection_score=score,
            recommended_focus=recommended_focus,
        )
        self.last_result = result
        self._append(result)
        self._persist(result)
        self._update_goal_manager(goal_progress)
        return result

    def summarize(self, result: Optional[ReflectionCycleResult] = None) -> Dict[str, Any]:
        result = result or self.last_result
        if result is None:
            return {"available": False, "reason": "no_reflection_result"}

        return {
            "available": True,
            "reflection_id": result.reflection_id,
            "reflection_score": result.reflection_score,
            "successful": int(result.action_summary.get("successful", 0)),
            "failed": int(result.action_summary.get("failed", 0)),
            "goal_progress": dict(result.goal_progress),
            "recommended_focus": list(result.recommended_focus),
            "notes": list(result.stability_notes),
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.history),
            "latest": self.summarize(),
        }

    @staticmethod
    def _extract_goal_progress(reasoning_summary: Dict[str, Any]) -> Dict[str, Any]:
        goal_summary = reasoning_summary.get("goal_summary", {})
        return {
            "goal_id": goal_summary.get("goal_id"),
            "status": goal_summary.get("status", "unknown"),
            "scheduled_plans": int(goal_summary.get("scheduled_plans", 0)),
            "priority": goal_summary.get("priority", 0),
            "confidence": float(goal_summary.get("confidence", 0.0) or 0.0),
        }

    @staticmethod
    def _derive_notes(action_summary: Dict[str, Any], reasoning_summary: Dict[str, Any], score: float) -> List[str]:
        notes: List[str] = []
        if int(action_summary.get("failed", 0)) > 0:
            notes.append("Some agent actions failed during execution.")
        if float(reasoning_summary.get("confidence", 0.0)) < 0.7:
            notes.append("Reasoning confidence remained moderate.")
        if score < 0.6:
            notes.append("Reflection score indicates weak cycle efficiency.")
        if int(action_summary.get("dispatched", 0)) == 0:
            notes.append("No tasks were dispatched in this cycle.")
        return notes

    @staticmethod
    def _derive_focus(notes: List[str], goal_progress: Dict[str, Any]) -> List[str]:
        focus: List[str] = []
        if any("failed" in note.lower() for note in notes):
            focus.append("reduce_execution_failures")
        if any("confidence" in note.lower() for note in notes):
            focus.append("improve_reasoning_confidence")
        if goal_progress.get("status") not in {"active", "in_progress", "completed"}:
            focus.append("stabilize_goal_tracking")
        if not focus:
            focus.append("maintain_current_path")
        return focus

    def _update_goal_manager(self, goal_progress: Dict[str, Any]) -> None:
        goal_id = goal_progress.get("goal_id")
        if not goal_id:
            return
        self.goal_manager._registry.annotate(  # noqa: SLF001
            goal_id,
            {
                "last_reflection": {
                    "reflection_score": self.last_result.reflection_score if self.last_result else 0.0,
                    "goal_progress": dict(goal_progress),
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    def _append(self, result: ReflectionCycleResult) -> None:
        self.history.append(result)
        if len(self.history) > self.history_limit:
            self.history = self.history[-self.history_limit :]

    def _persist(self, result: ReflectionCycleResult) -> None:
        payload = {
            "reflection_id": result.reflection_id,
            "timestamp": result.timestamp,
            "summary": self.summarize(result),
        }
        self.memory.remember_short_term(
            key="brain_loop:last_reflection",
            value=payload,
            tags=["brain_loop", "reflection"],
        )
        self.memory.remember_long_term(
            key=f"brain_loop:reflection:{result.reflection_id}",
            value=payload,
            source="brain_loop.reflection_cycle",
            importance=0.75,
            tags=["brain_loop", "reflection"],
        )
