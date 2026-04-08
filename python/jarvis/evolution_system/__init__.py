"""Evolution System package for autonomous capability upgrades."""

from jarvis.evolution_system.evolution_core import EvolutionCore, EvolutionCycleResult, EvolutionPolicy
from jarvis.evolution_system.capability_analyzer import CapabilityAnalyzer, CapabilityGap, CapabilityReport
from jarvis.evolution_system.improvement_planner import ImprovementPlanner, ImprovementPlan, PlanStep, PlanBundle
from jarvis.evolution_system.feature_generator import FeatureGenerator, GeneratedFeature, GeneratedBundle
from jarvis.evolution_system.sandbox_tester import SandboxTester, SandboxResult, SandboxBatch
from jarvis.evolution_system.deployment_controller import DeploymentController, DeploymentResult, RollbackRecord
from jarvis.evolution_system.feature_registry import FeatureRegistry, FeatureRecord, FeatureVersion

__all__ = [
    "EvolutionCore",
    "EvolutionCycleResult",
    "EvolutionPolicy",
    "CapabilityAnalyzer",
    "CapabilityGap",
    "CapabilityReport",
    "ImprovementPlanner",
    "ImprovementPlan",
    "PlanStep",
    "PlanBundle",
    "FeatureGenerator",
    "GeneratedFeature",
    "GeneratedBundle",
    "SandboxTester",
    "SandboxResult",
    "SandboxBatch",
    "DeploymentController",
    "DeploymentResult",
    "RollbackRecord",
    "FeatureRegistry",
    "FeatureRecord",
    "FeatureVersion",
]
