"""Goal Management Layer for Pixi.

Provides long-running goal lifecycle management:
- goal registry
- decomposition into milestones
- milestone tracking
- progress evaluation
- scheduling
"""

from Pixi.goal_manager.goal_decomposer import GoalDecomposer, GoalDecompositionResult, MilestoneRecord
from Pixi.goal_manager.goal_manager import GoalManager, ScheduledMilestonePlan
from Pixi.goal_manager.goal_registry import GoalRecord, GoalRegistry
from Pixi.goal_manager.goal_scheduler import GoalScheduler, ScheduledGoal
from Pixi.goal_manager.milestone_tracker import MilestoneProgress, MilestoneTracker
from Pixi.goal_manager.progress_evaluator import ProgressEvaluation, ProgressEvaluator

__all__ = [
    "GoalDecomposer",
    "GoalDecompositionResult",
    "GoalManager",
    "GoalRecord",
    "GoalRegistry",
    "GoalScheduler",
    "MilestoneProgress",
    "MilestoneRecord",
    "MilestoneTracker",
    "ProgressEvaluation",
    "ProgressEvaluator",
    "ScheduledGoal",
    "ScheduledMilestonePlan",
]

