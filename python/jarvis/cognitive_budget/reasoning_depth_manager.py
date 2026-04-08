"""Reasoning depth manager for cognitive budget system.

Controls how deeply the system should reason through a problem before taking
action. Prevents runaway recursive reasoning loops while allowing complex
problems to receive thorough analysis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict

from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class ReasoningDepthPolicy:
    """Rules for reasoning depth allocation."""

    min_depth: int = 1
    max_depth: int = 8
    default_depth: int = 3
    allow_recursion: bool = False
    max_recursion_depth: int = 1
    depth_for_trivial: int = 1
    depth_for_simple: int = 2
    depth_for_moderate: int = 4
    depth_for_complex: int = 6
    depth_for_expert: int = 8


@dataclass(slots=True)
class ReasoningCycleRecord:
    """Record of a reasoning cycle."""

    cycle_id: str
    depth_level: int
    reasoning_steps_completed: int
    reasoning_steps_limit: int
    conclusion: str
    confidence: float
    recursion_level: int = 0
    branching_factor: int = 1
    tokens_used: int = 0
    timestamp: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class ReasoningDepthManager:
    """Manage reasoning depth allocation and cycles."""

    def __init__(self, memory: MemorySystem, policy: ReasoningDepthPolicy | None = None) -> None:
        self._memory = memory
        self.policy = policy or ReasoningDepthPolicy()
        self._active_cycles: Dict[str, ReasoningCycleRecord] = {}
        self._reasoning_history: list[ReasoningCycleRecord] = []
        self._recursion_stack: list[int] = []

    def compute_depth(
        self,
        complexity_score: float,
        allow_recursion: bool = False,
        max_depth: int | None = None,
    ) -> int:
        """Determine reasoning depth for task."""
        # Category-based depth
        if complexity_score < 0.1:
            category_depth = self.policy.depth_for_trivial
        elif complexity_score < 0.3:
            category_depth = self.policy.depth_for_simple
        elif complexity_score < 0.6:
            category_depth = self.policy.depth_for_moderate
        elif complexity_score < 0.8:
            category_depth = self.policy.depth_for_complex
        else:
            category_depth = self.policy.depth_for_expert

        # Apply max depth override
        if max_depth is not None:
            category_depth = min(category_depth, max_depth)

        # Enforce policy limits
        depth = max(self.policy.min_depth, min(self.policy.max_depth, category_depth))

        return depth

    def start_reasoning_cycle(
        self,
        task_id: str,
        max_depth: int,
        reasoning_steps_limit: int = 100,
    ) -> ReasoningCycleRecord:
        """Initialize a new reasoning cycle."""
        cycle_id = f"reasoning-{hash(task_id) % 1000000:06d}"

        record = ReasoningCycleRecord(
            cycle_id=cycle_id,
            depth_level=1,
            reasoning_steps_completed=0,
            reasoning_steps_limit=reasoning_steps_limit,
            conclusion="",
            confidence=0.0,
            recursion_level=len(self._recursion_stack),
        )

        self._active_cycles[cycle_id] = record
        self._recursion_stack.append(len(self._recursion_stack))
        return record

    def end_reasoning_cycle(
        self,
        cycle_id: str,
        conclusion: str,
        confidence: float,
        reasoning_steps_used: int,
    ) -> ReasoningCycleRecord | None:
        """Complete a reasoning cycle."""
        if cycle_id not in self._active_cycles:
            return None

        record = self._active_cycles[cycle_id]
        record.conclusion = conclusion
        record.confidence = confidence
        record.reasoning_steps_completed = reasoning_steps_used

        self._reasoning_history.append(record)
        del self._active_cycles[cycle_id]

        if self._recursion_stack:
            self._recursion_stack.pop()

        self._persist_cycle(record)
        return record

    def can_recurse(self) -> bool:
        """Check if recursion is allowed at current depth."""
        if not self.policy.allow_recursion:
            return False

        current_depth = len(self._recursion_stack)
        if current_depth >= self.policy.max_recursion_depth:
            return False

        return True

    def can_continue_reasoning(self, cycle_id: str) -> bool:
        """Check if reasoning can continue in this cycle."""
        if cycle_id not in self._active_cycles:
            return False

        record = self._active_cycles[cycle_id]

        # Check step limit
        if record.reasoning_steps_completed >= record.reasoning_steps_limit:
            return False

        # Check depth limit
        if record.depth_level >= self.policy.max_depth:
            return False

        # Check recursion limit
        if record.recursion_level >= self.policy.max_recursion_depth:
            return False

        return True

    def advance_reasoning(
        self,
        cycle_id: str,
        steps: int = 1,
    ) -> bool:
        """Advance reasoning step counter."""
        if cycle_id not in self._active_cycles:
            return False

        record = self._active_cycles[cycle_id]
        record.reasoning_steps_completed += steps

        if record.reasoning_steps_completed >= record.reasoning_steps_limit:
            return False

        return True

    def deepen_reasoning(
        self,
        cycle_id: str,
    ) -> bool:
        """Attempt to go deeper in reasoning."""
        if cycle_id not in self._active_cycles:
            return False

        record = self._active_cycles[cycle_id]

        if record.depth_level >= self.policy.max_depth:
            return False

        record.depth_level += 1
        return True

    def record_branching(
        self,
        cycle_id: str,
        branches: int,
    ) -> None:
        """Record when reasoning branches into multiple paths."""
        if cycle_id not in self._active_cycles:
            return

        record = self._active_cycles[cycle_id]
        record.branching_factor = max(record.branching_factor, branches)

    def statistics(self) -> Dict[str, Any]:
        """Return reasoning statistics."""
        if not self._reasoning_history:
            return {
                "total_cycles": 0,
                "avg_depth": 0,
                "avg_steps": 0,
                "avg_confidence": 0,
                "max_recursion_depth_reached": 0,
            }

        depths = [r.depth_level for r in self._reasoning_history]
        steps = [r.reasoning_steps_completed for r in self._reasoning_history]
        confidences = [r.confidence for r in self._reasoning_history]
        recursions = [r.recursion_level for r in self._reasoning_history]

        avg_depth = sum(depths) / len(depths) if depths else 0
        avg_steps = sum(steps) / len(steps) if steps else 0
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        max_recursion = max(recursions) if recursions else 0

        return {
            "total_cycles": len(self._reasoning_history),
            "avg_depth": round(avg_depth, 2),
            "avg_steps": round(avg_steps, 2),
            "avg_confidence": round(avg_confidence, 2),
            "max_recursion_depth_reached": max_recursion,
            "active_cycles": len(self._active_cycles),
            "current_recursion_depth": len(self._recursion_stack),
        }

    def _persist_cycle(self, record: ReasoningCycleRecord) -> None:
        """Store reasoning cycle in memory."""
        self._memory.remember_long_term(
            key=f"reasoning_cycle:{record.cycle_id}",
            value={
                "cycle_id": record.cycle_id,
                "depth_level": record.depth_level,
                "reasoning_steps_completed": record.reasoning_steps_completed,
                "conclusion": record.conclusion,
                "confidence": record.confidence,
                "recursion_level": record.recursion_level,
            },
            source="cognitive_budget.reasoning_depth_manager",
            importance=0.7,
            tags=["reasoning", "depth", "cycle"],
        )
