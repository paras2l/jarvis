"""Reasoning Engine package for Jarvis.

Pipeline:
- goal inference
- constraint analysis
- strategy generation
- decision selection
- planning handoff generation
"""

from jarvis.reasoning_engine.constraint_analyzer import ConstraintAnalysisResult, ConstraintAnalyzer, ConstraintItem
from jarvis.reasoning_engine.decision_engine import ReasoningDecision, ReasoningDecisionEngine, StrategyScore
from jarvis.reasoning_engine.goal_inference import GoalHypothesis, GoalInferenceEngine, GoalInferenceResult
from jarvis.reasoning_engine.reasoning_core import ReasoningCore, ReasoningReport
from jarvis.reasoning_engine.strategy_generator import (
    StrategyGenerationResult,
    StrategyGenerator,
    StrategyOption,
    StrategyStep,
)

__all__ = [
    "ConstraintAnalysisResult",
    "ConstraintAnalyzer",
    "ConstraintItem",
    "GoalHypothesis",
    "GoalInferenceEngine",
    "GoalInferenceResult",
    "ReasoningCore",
    "ReasoningDecision",
    "ReasoningDecisionEngine",
    "ReasoningReport",
    "StrategyGenerationResult",
    "StrategyGenerator",
    "StrategyOption",
    "StrategyScore",
    "StrategyStep",
]
