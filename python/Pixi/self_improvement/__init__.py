"""Self-Improvement Engine package for Pixi.

The package provides an end-to-end capability growth loop:
- analyze runtime performance
- detect capability gaps
- generate new skill templates
- schedule learning tasks
- coordinate safe integration cycles
"""

from Pixi.self_improvement.capability_gap_detector import CapabilityGap, CapabilityGapDetector, GapDetectionResult
from Pixi.self_improvement.improvement_manager import ImprovementCycleResult, ImprovementManager
from Pixi.self_improvement.learning_scheduler import LearningRunResult, LearningScheduler, LearningTask
from Pixi.self_improvement.performance_analyzer import ErrorFrequencyRecord, PerformanceAnalyzer, PerformanceReport
from Pixi.self_improvement.tool_builder import BuildResult, SkillTemplate, ToolBuilder
from Pixi.tool_learning.tool_learning_core import ToolLearningCore, ToolLearningResult

__all__ = [
    "BuildResult",
    "CapabilityGap",
    "CapabilityGapDetector",
    "ErrorFrequencyRecord",
    "GapDetectionResult",
    "ImprovementCycleResult",
    "ImprovementManager",
    "LearningRunResult",
    "LearningScheduler",
    "LearningTask",
    "PerformanceAnalyzer",
    "PerformanceReport",
    "ToolLearningCore",
    "ToolLearningResult",
    "SkillTemplate",
    "ToolBuilder",
]

