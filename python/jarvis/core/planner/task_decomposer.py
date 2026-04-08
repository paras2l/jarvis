"""Task decomposer for Jarvis Planner Engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from jarvis.core.contracts import ExecutionPlan, PlanStep
from jarvis.core.planner.goal_parser import ParsedGoal
from jarvis.core.planner.strategy_selector import PlanStrategy


@dataclass(slots=True)
class TaskBlueprint:
    """Expanded planning task before conversion to PlanStep."""

    id: str
    title: str
    description: str
    agent_role: str
    skill_name: str
    depends_on: List[str] = field(default_factory=list)
    estimated_minutes: int = 15
    priority: str = "normal"


class TaskDecomposer:
    """Generates task graph from goal semantics."""

    def decompose(self, parsed_goal: ParsedGoal, strategy: PlanStrategy) -> List[TaskBlueprint]:
        tasks = self._base_tasks(parsed_goal)
        if parsed_goal.domain == "video_production":
            tasks.extend(self._video_extension(parsed_goal))
        elif parsed_goal.domain == "software_development":
            tasks.extend(self._development_extension(parsed_goal, strategy))
        elif parsed_goal.domain == "research_analysis":
            tasks.extend(self._research_extension())

        self._apply_constraints(tasks, parsed_goal.constraints)
        self._apply_priority_profile(tasks, strategy.priority_profile)

        if strategy.requires_approval:
            tasks.append(
                TaskBlueprint(
                    id=f"t{len(tasks) + 1}",
                    title="Approval Checkpoint",
                    description="Request user approval before executing high-risk actions.",
                    agent_role="SafetyAgent",
                    skill_name="request_approval",
                    depends_on=[tasks[-1].id] if tasks else [],
                    estimated_minutes=2,
                    priority="critical",
                )
            )

        return tasks

    def _base_tasks(self, parsed_goal: ParsedGoal) -> List[TaskBlueprint]:
        return [
            TaskBlueprint(
                id="t1",
                title="Understand Goal",
                description=f"Clarify intent and success criteria for: {parsed_goal.raw_goal}",
                agent_role="PlannerAgent",
                skill_name="clarify_goal",
                estimated_minutes=10,
            ),
            TaskBlueprint(
                id="t2",
                title="Create Execution Path",
                description="Prepare an ordered action path and identify dependencies.",
                agent_role="PlannerAgent",
                skill_name="create_execution_path",
                depends_on=["t1"],
                estimated_minutes=12,
            ),
        ]

    def to_execution_plan(self, goal: str, tasks: List[TaskBlueprint]) -> ExecutionPlan:
        """Convert task blueprints into contract ExecutionPlan."""
        steps: List[PlanStep] = []
        for task in tasks:
            dependency_hint = f" Depends on: {', '.join(task.depends_on)}." if task.depends_on else ""
            step_description = (
                f"{task.title} - {task.description}. "
                f"Estimate: {task.estimated_minutes} min. Priority: {task.priority}."
                f"{dependency_hint}"
            )
            steps.append(
                PlanStep(
                    id=task.id,
                    description=step_description,
                    agent_role=task.agent_role,
                    skill_name=task.skill_name,
                )
            )
        return ExecutionPlan(goal=goal, steps=steps)

    def _video_extension(self, parsed_goal: ParsedGoal) -> List[TaskBlueprint]:
        return [
            TaskBlueprint(
                id="t3",
                title="Research Topic",
                description=f"Gather references and trends for: {parsed_goal.raw_goal}",
                agent_role="ResearchAgent",
                skill_name="research_topic",
                depends_on=["t2"],
                estimated_minutes=20,
            ),
            TaskBlueprint(
                id="t4",
                title="Generate Script",
                description="Create script with hook, narrative flow, and call-to-action.",
                agent_role="CreativeAgent",
                skill_name="generate_script",
                depends_on=["t3"],
                estimated_minutes=25,
            ),
            TaskBlueprint(
                id="t5",
                title="Create Visuals",
                description="Prepare visual prompts, slides, B-roll plan, and thumbnail concept.",
                agent_role="DesignAgent",
                skill_name="create_visual_assets",
                depends_on=["t4"],
                estimated_minutes=30,
            ),
            TaskBlueprint(
                id="t6",
                title="Assemble Video",
                description="Assemble script, visuals, and narration into final editable timeline.",
                agent_role="MediaAgent",
                skill_name="assemble_video",
                depends_on=["t5"],
                estimated_minutes=35,
            ),
        ]

    def _development_extension(self, parsed_goal: ParsedGoal, strategy: PlanStrategy) -> List[TaskBlueprint]:
        tasks = [
            TaskBlueprint(
                id="t3",
                title="Analyze Requirements",
                description=f"Extract implementation scope from goal: {parsed_goal.raw_goal}",
                agent_role="PlannerAgent",
                skill_name="analyze_requirements",
                depends_on=["t2"],
                estimated_minutes=15,
            ),
            TaskBlueprint(
                id="t4",
                title="Design Solution",
                description="Draft module boundaries, interfaces, and validation plan.",
                agent_role="ArchitectureAgent",
                skill_name="design_solution",
                depends_on=["t3"],
                estimated_minutes=20,
            ),
            TaskBlueprint(
                id="t5",
                title="Implement Changes",
                description="Implement code updates incrementally with safety checks.",
                agent_role="DevelopmentAgent",
                skill_name="implement_code",
                depends_on=["t4"],
                estimated_minutes=45,
            ),
            TaskBlueprint(
                id="t6",
                title="Validate Build",
                description="Run tests, linting, and targeted regression checks.",
                agent_role="QAAgent",
                skill_name="run_validation",
                depends_on=["t5"],
                estimated_minutes=20,
            ),
            TaskBlueprint(
                id="t7",
                title="Summarize Delivery",
                description="Generate concise delivery notes with risks and next actions.",
                agent_role="CommunicationAgent",
                skill_name="summarize_delivery",
                depends_on=["t6"],
                estimated_minutes=10,
            ),
        ]

        if strategy.mode == "iterative_delivery":
            tasks.insert(
                3,
                TaskBlueprint(
                    id="t5b",
                    title="Checkpoint Demo",
                    description="Produce a midpoint demo summary before final validation.",
                    agent_role="CommunicationAgent",
                    skill_name="prepare_checkpoint_demo",
                    depends_on=["t5"],
                    estimated_minutes=8,
                ),
            )
        return tasks

    def _research_extension(self) -> List[TaskBlueprint]:
        return [
            TaskBlueprint(
                id="t3",
                title="Define Research Questions",
                description="Convert goal into clear, answerable questions.",
                agent_role="ResearchAgent",
                skill_name="define_questions",
                depends_on=["t2"],
                estimated_minutes=10,
            ),
            TaskBlueprint(
                id="t4",
                title="Collect Sources",
                description="Collect and rank sources by reliability and relevance.",
                agent_role="ResearchAgent",
                skill_name="collect_sources",
                depends_on=["t3"],
                estimated_minutes=25,
            ),
            TaskBlueprint(
                id="t5",
                title="Synthesize Findings",
                description="Synthesize findings into evidence-backed conclusions.",
                agent_role="AnalysisAgent",
                skill_name="synthesize_findings",
                depends_on=["t4"],
                estimated_minutes=20,
            ),
            TaskBlueprint(
                id="t6",
                title="Generate Brief",
                description="Create actionable summary with caveats and next steps.",
                agent_role="CommunicationAgent",
                skill_name="generate_brief",
                depends_on=["t5"],
                estimated_minutes=12,
            ),
        ]

    def _apply_constraints(self, tasks: List[TaskBlueprint], constraints: List[str]) -> None:
        if not constraints:
            return

        for task in tasks:
            for constraint in constraints:
                if constraint.startswith("deadline"):
                    task.priority = "high"
                    task.estimated_minutes = max(5, task.estimated_minutes - 3)
                if constraint.startswith("budget_limit") and "design" in task.title.lower():
                    task.description += " Favor low-cost and reusable assets."
                if constraint.startswith("required_tool"):
                    task.description += f" Respect tool requirement: {constraint}."

    def _apply_priority_profile(self, tasks: List[TaskBlueprint], profile: str) -> None:
        if not tasks:
            return

        if profile == "deadline_driven":
            for task in tasks:
                task.priority = "high" if task.id in {"t1", "t2"} else task.priority
            return

        if profile == "energy_conserving":
            for task in tasks:
                if task.estimated_minutes > 25:
                    task.estimated_minutes = max(15, task.estimated_minutes - 5)
            return

        if profile == "quality_first":
            tasks.append(
                TaskBlueprint(
                    id=f"t{len(tasks) + 1}",
                    title="Quality Review",
                    description="Perform deep quality review and improvement pass.",
                    agent_role="QAAgent",
                    skill_name="quality_review",
                    depends_on=[tasks[-1].id],
                    estimated_minutes=15,
                    priority="high",
                )
            )
