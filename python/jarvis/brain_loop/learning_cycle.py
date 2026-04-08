"""Learning cycle for the Jarvis cognitive loop.

Applies reflection outcomes to knowledge, memory, and future strategy selection
so the cognitive loop improves over time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from jarvis.memory.memory_system import MemorySystem
from jarvis.self_improvement.improvement_manager import ImprovementManager


@dataclass(slots=True)
class LearningCycleResult:
    learning_id: str
    timestamp: str
    reflection_summary: Dict[str, Any]
    learned_patterns: Dict[str, Any]
    memory_updates: List[str] = field(default_factory=list)
    improvement_actions: List[str] = field(default_factory=list)
    confidence_adjustment: float = 0.0


@dataclass(slots=True)
class LearningCycle:
    """Updates memory and system strategy from reflection output."""

    memory: MemorySystem
    improvement_manager: Optional[ImprovementManager] = None
    last_result: Optional[LearningCycleResult] = None
    history: List[LearningCycleResult] = field(default_factory=list)
    history_limit: int = 200

    def run(self, reflection_summary: Dict[str, Any], reasoning_summary: Dict[str, Any]) -> LearningCycleResult:
        """Convert reflection into memory, knowledge, and improvement updates."""

        learned_patterns = self._extract_patterns(reflection_summary, reasoning_summary)
        memory_updates = self._persist_learning(reflection_summary, learned_patterns)
        improvement_actions = self._run_improvement_feedback(reflection_summary)
        confidence_adjustment = self._confidence_adjustment(reflection_summary, reasoning_summary)

        result = LearningCycleResult(
            learning_id=f"learn-{uuid4().hex[:12]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            reflection_summary=dict(reflection_summary),
            learned_patterns=learned_patterns,
            memory_updates=memory_updates,
            improvement_actions=improvement_actions,
            confidence_adjustment=confidence_adjustment,
        )
        self.last_result = result
        self._append(result)
        self._persist_result(result)
        return result

    def summarize(self, result: Optional[LearningCycleResult] = None) -> Dict[str, Any]:
        result = result or self.last_result
        if result is None:
            return {"available": False, "reason": "no_learning_result"}

        return {
            "available": True,
            "learning_id": result.learning_id,
            "reflection_score": float(result.reflection_summary.get("reflection_score", 0.0)),
            "memory_updates": list(result.memory_updates),
            "improvement_actions": list(result.improvement_actions),
            "confidence_adjustment": result.confidence_adjustment,
            "learned_patterns": dict(result.learned_patterns),
        }

    def diagnostics(self) -> Dict[str, Any]:
        return {
            "history_count": len(self.history),
            "latest": self.summarize(),
        }

    def _extract_patterns(self, reflection_summary: Dict[str, Any], reasoning_summary: Dict[str, Any]) -> Dict[str, Any]:
        score = float(reflection_summary.get("reflection_score", 0.0) or 0.0)
        successful = int(reflection_summary.get("successful", 0))
        failed = int(reflection_summary.get("failed", 0))
        focus = list(reflection_summary.get("recommended_focus", []))
        goal_progress = dict(reflection_summary.get("goal_progress", {}))

        return {
            "execution_balance": {
                "successful": successful,
                "failed": failed,
                "success_rate": round(successful / float(max(1, successful + failed)), 4),
            },
            "reflection_score": score,
            "focus": focus,
            "goal_status": goal_progress.get("status", "unknown"),
            "reasoning_confidence": float(reasoning_summary.get("confidence", 0.0) or 0.0),
        }

    def _persist_learning(self, reflection_summary: Dict[str, Any], learned_patterns: Dict[str, Any]) -> List[str]:
        updates: List[str] = []
        payload = {
            "reflection_summary": dict(reflection_summary),
            "learned_patterns": dict(learned_patterns),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

        self.memory.remember_short_term(
            key="brain_loop:last_learning",
            value=payload,
            tags=["brain_loop", "learning"],
        )
        updates.append("short_term_memory")

        self.memory.remember_long_term(
            key=f"brain_loop:learning:{payload['timestamp']}",
            value=payload,
            source="brain_loop.learning_cycle",
            importance=0.82,
            tags=["brain_loop", "learning"],
        )
        updates.append("long_term_memory")

        self.memory.remember_semantic(
            doc_id=f"brain_loop:learning:{payload['timestamp']}",
            text=f"reflection_score={learned_patterns['reflection_score']} focus={','.join(learned_patterns['focus'])}",
            metadata={"type": "brain_loop_learning"},
        )
        updates.append("semantic_memory")

        return updates

    def _run_improvement_feedback(self, reflection_summary: Dict[str, Any]) -> List[str]:
        actions: List[str] = []
        if self.improvement_manager is None:
            return actions

        score = float(reflection_summary.get("reflection_score", 0.0) or 0.0)
        if score < 0.65:
            actions.append("trigger_self_improvement_cycle")
            try:
                self.improvement_manager.run_cycle(
                    context=self._dummy_context(),
                    force=True,
                    integrate_placeholders=True,
                    max_new_tools=2,
                    learning_runs_per_cycle=1,
                )
            except Exception:
                actions.append("self_improvement_cycle_failed")
        else:
            actions.append("self_improvement_not_required")
        return actions

    @staticmethod
    def _confidence_adjustment(reflection_summary: Dict[str, Any], reasoning_summary: Dict[str, Any]) -> float:
        reflection_score = float(reflection_summary.get("reflection_score", 0.0) or 0.0)
        reasoning_confidence = float(reasoning_summary.get("confidence", 0.0) or 0.0)
        delta = (reflection_score + reasoning_confidence) / 2.0 - 0.5
        return round(delta, 4)

    def _persist_result(self, result: LearningCycleResult) -> None:
        self.memory.remember_short_term(
            key=f"brain_loop:learning_result:{result.learning_id}",
            value=self.summarize(result),
            tags=["brain_loop", "learning"],
        )

    def _append(self, result: LearningCycleResult) -> None:
        self.history.append(result)
        if len(self.history) > self.history_limit:
            self.history = self.history[-self.history_limit :]

    @staticmethod
    def _dummy_context() -> Any:
        from jarvis.core.contracts import ContextSnapshot

        return ContextSnapshot(
            current_application="brain_loop",
            user_activity="learning",
            time_of_day="unknown",
            signals={"brain_loop": True},
        )
