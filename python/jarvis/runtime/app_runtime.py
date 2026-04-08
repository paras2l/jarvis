"""Main runtime composition root.

Creates concrete implementations and wires dependencies together.
"""

from __future__ import annotations

from jarvis.core.context.context_engine import ContextEngine
from jarvis.core.orchestrator.agent_orchestrator import AgentOrchestrator
from jarvis.core.planner.planner_engine import PlannerEngine
from jarvis.memory.memory_system import MemorySystem
from jarvis.skills.skill_registry import SkillRegistry


class JarvisRuntime:
    """Runtime facade for higher-level app entrypoints."""

    def __init__(self) -> None:
        self.memory = MemorySystem()
        self.skills = SkillRegistry()
        self.context = ContextEngine()
        self.planner = PlannerEngine()
        self.orchestrator = AgentOrchestrator(
            context_engine=self.context,
            planner=self.planner,
            skill_registry=self.skills,
            memory=self.memory,
        )

    def run_once(self, goal: str) -> str:
        report = self.orchestrator.execute_goal(goal)
        lines = [f"Goal: {report.goal}"]
        for item in report.step_results:
            status = "OK" if item.success else "FAIL"
            lines.append(f"[{status}] {item.step_id} -> {item.output}")
        return "\n".join(lines)
