"""Goal Management Layer for Jarvis.

Provides long-running goal lifecycle management:
- goal registry
- decomposition into milestones
- milestone tracking
- progress evaluation
- scheduling
"""

from jarvis.goal_manager.goal_decomposer import GoalDecomposer, GoalDecompositionResult, MilestoneRecord
from jarvis.goal_manager.goal_manager import GoalManager, ScheduledMilestonePlan
from jarvis.goal_manager.goal_registry import GoalRecord, GoalRegistry
from jarvis.goal_manager.goal_scheduler import GoalScheduler, ScheduledGoal
from jarvis.goal_manager.milestone_tracker import MilestoneProgress, MilestoneTracker
from jarvis.goal_manager.progress_evaluator import ProgressEvaluation, ProgressEvaluator

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
