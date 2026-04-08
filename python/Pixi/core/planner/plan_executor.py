"""Plan executor for Pixi Planner Engine."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List

from Pixi.core.contracts import ContextSnapshot, ExecutionPlan
from Pixi.core.planner.goal_parser import GoalParser, ParsedGoal
from Pixi.core.planner.strategy_selector import PlanStrategy, StrategySelector
from Pixi.core.planner.task_decomposer import TaskBlueprint, TaskDecomposer


class PlanExecutor:
    """High-level planner pipeline facade."""

    def __init__(
        self,
        parser: GoalParser | None = None,
        selector: StrategySelector | None = None,
        decomposer: TaskDecomposer | None = None,
    ) -> None:
        self._parser = parser or GoalParser()
        self._selector = selector or StrategySelector()
        self._decomposer = decomposer or TaskDecomposer()

    def build_execution_plan(self, goal: str, context: ContextSnapshot) -> ExecutionPlan:
        """Build and return contract-compatible execution plan."""
        parsed_goal = self._parser.parse(goal)
        strategy = self._selector.choose(parsed_goal, context)
        tasks = self._decomposer.decompose(parsed_goal, strategy)
        return self._decomposer.to_execution_plan(goal=goal, tasks=tasks)

    def build_diagnostics(self, goal: str, context: ContextSnapshot) -> Dict[str, Any]:
        """Build full diagnostics artifact for observability and debugging."""
        parsed_goal = self._parser.parse(goal)
        strategy = self._selector.choose(parsed_goal, context)
        tasks = self._decomposer.decompose(parsed_goal, strategy)
        plan = self._decomposer.to_execution_plan(goal=goal, tasks=tasks)

        return {
            "goal": goal,
            "context": {
                "current_application": context.current_application,
                "user_activity": context.user_activity,
                "time_of_day": context.time_of_day,
            },
            "parsed_goal": asdict(parsed_goal),
            "strategy": asdict(strategy),
            "tasks": [asdict(task) for task in tasks],
            "execution_plan": {
                "goal": plan.goal,
                "steps": [
                    {
                        "id": step.id,
                        "description": step.description,
                        "agent_role": step.agent_role,
                        "skill_name": step.skill_name,
                    }
                    for step in plan.steps
                ],
            },
        }

    def preview_task_outputs(self, goal: str, context: ContextSnapshot) -> List[str]:
        """Generate deterministic sample outputs for each planned task.

        This is not real skill execution; it is a planning preview useful for:
        - UX previews
        - dry-run checks
        - test snapshots
        """
        parsed_goal = self._parser.parse(goal)
        strategy = self._selector.choose(parsed_goal, context)
        tasks = self._decomposer.decompose(parsed_goal, strategy)

        outputs: List[str] = []
        for task in tasks:
            outputs.append(self._render_task_output(task, parsed_goal, strategy))
        return outputs

    @staticmethod
    def _render_task_output(task: TaskBlueprint, parsed_goal: ParsedGoal, strategy: PlanStrategy) -> str:
        return (
            f"[{task.id}] {task.title}: "
            f"agent={task.agent_role}, skill={task.skill_name}, "
            f"priority={task.priority}, eta={task.estimated_minutes}m, "
            f"mode={strategy.mode}, domain={parsed_goal.domain}"
        )


def _print_plan(plan: ExecutionPlan) -> None:
    print(f"Goal: {plan.goal}")
    for step in plan.steps:
        print(f"  - {step.id} | {step.agent_role} | {step.skill_name}")
        print(f"    {step.description}")


def run_examples() -> None:
    """Run example goals and print resulting tasks and sample outputs."""
    executor = PlanExecutor()

    examples = [
        (
            "Create a YouTube video about AI tools for beginners",
            ContextSnapshot(current_application="browser", user_activity="research", time_of_day="evening", signals={}),
        ),
        (
            "Build a landing page for my product and validate performance",
            ContextSnapshot(current_application="vscode", user_activity="development", time_of_day="afternoon", signals={}),
        ),
        (
            "Research competitor pricing and summarize actionable insights",
            ContextSnapshot(current_application="spreadsheet", user_activity="analysis", time_of_day="morning", signals={}),
        ),
    ]

    for idx, (goal, context) in enumerate(examples):
        print("=" * 90)
        print(f"Example {idx + 1}: {goal}")
        print(f"Context -> app={context.current_application}, activity={context.user_activity}, tod={context.time_of_day}")

        plan = executor.build_execution_plan(goal, context)
        print("\nPlanned Tasks:")
        _print_plan(plan)

        print("\nTask Output Preview:")
        for item in executor.preview_task_outputs(goal, context):
            print(f"  {item}")

        print("\nDiagnostics Snapshot Keys:")
        diagnostics = executor.build_diagnostics(goal, context)
        print(f"  {list(diagnostics.keys())}")


def _cli() -> None:
    run_examples()


if __name__ == "__main__":
    _cli()

