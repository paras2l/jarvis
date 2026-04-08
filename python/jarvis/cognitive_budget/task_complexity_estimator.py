"""Task complexity estimator for cognitive budget allocation.

Analyzes incoming tasks and produces complexity profiles that drive resource
allocation decisions. Factors include:
- Task length and vocabulary complexity
- External dependencies and integrations
- Reasoning requirements
- Uncertainty and decision branches
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List
import re

from jarvis.core.contracts import ContextSnapshot
from jarvis.memory.memory_system import MemorySystem


@dataclass(slots=True)
class TaskProfile:
    """Task complexity analysis result."""

    task_id: str
    complexity_score: float  # 0.0 to 1.0
    difficulty_category: str  # trivial, simple, moderate, complex, expert
    estimated_tokens: int
    has_external_dependencies: bool
    has_research_requirements: bool
    has_code_generation: bool
    decision_branches: int
    uncertainty_level: float  # 0.0 to 1.0
    reasoning_intensity: float  # 0.0 to 1.0
    estimated_time_seconds: int
    confidence: float  # 0.0 to 1.0
    notes: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class TaskComplexityEstimator:
    """Analyze tasks and produce complexity profiles."""

    def __init__(self, memory: MemorySystem) -> None:
        self._memory = memory

        self._complexity_patterns = {
            "trivial": {
                "keywords": ["hello", "simple", "basic", "trivial", "easy"],
                "max_tokens": 50,
                "score": 0.05,
            },
            "simple": {
                "keywords": ["basic", "standard", "common", "straightforward"],
                "max_tokens": 150,
                "score": 0.2,
            },
            "moderate": {
                "keywords": ["complex", "analyze", "combine", "integrate", "optimize"],
                "max_tokens": 500,
                "score": 0.5,
            },
            "complex": {
                "keywords": ["architecture", "design", "novel", "research", "multi-step"],
                "max_tokens": 1500,
                "score": 0.75,
            },
            "expert": {
                "keywords": ["cutting-edge", "breakthrough", "autonomous", "self-improving"],
                "max_tokens": 5000,
                "score": 0.95,
            },
        }

    def estimate(
        self,
        task_description: str,
        context: ContextSnapshot | None = None,
    ) -> TaskProfile:
        """Analyze task and produce complexity profile."""
        task_id = f"task_{hash(task_description) % 1000000:06d}"

        # Tokenize task text
        tokens = task_description.split()
        estimated_tokens = len(tokens) * 1.3  # rough conversion

        # Detect complexity features
        has_external = self._has_external_dependencies(task_description)
        has_research = self._has_research_requirements(task_description)
        has_code = self._has_code_generation(task_description)
        branches = self._count_decision_branches(task_description)
        uncertainty = self._estimate_uncertainty(task_description)
        reasoning = self._estimate_reasoning_intensity(task_description)

        # Compute composite score
        base_score = self._compute_base_score(task_description, estimated_tokens)
        score = self._adjust_score(
            base_score=base_score,
            has_external=has_external,
            has_research=has_research,
            has_code=has_code,
            branches=branches,
            uncertainty=uncertainty,
            reasoning=reasoning,
        )

        # Clamp to [0, 1]
        score = max(0.0, min(1.0, score))

        # Categorize difficulty
        category = self._categorize_difficulty(score)

        # Estimate execution time (seconds)
        time_estimate = self._estimate_time(
            score=score,
            branches=branches,
            has_research=has_research,
        )

        # Confidence in estimate
        confidence = self._confidence_score(
            description_length=len(task_description),
            has_context=context is not None,
            pattern_match=base_score < 0.5 or base_score > 0.8,
        )

        profile = TaskProfile(
            task_id=task_id,
            complexity_score=score,
            difficulty_category=category,
            estimated_tokens=int(estimated_tokens),
            has_external_dependencies=has_external,
            has_research_requirements=has_research,
            has_code_generation=has_code,
            decision_branches=branches,
            uncertainty_level=uncertainty,
            reasoning_intensity=reasoning,
            estimated_time_seconds=time_estimate,
            confidence=confidence,
            metadata={
                "analyzed_at": self._memory.get("system_time") or "unknown",
            },
        )

        self._store_profile(profile)
        return profile

    def _compute_base_score(self, description: str, token_count: float) -> float:
        """Compute base complexity score from text analysis."""
        lower = description.lower()
        score = 0.0

        for category, patterns in self._complexity_patterns.items():
            for keyword in patterns["keywords"]:
                if keyword in lower:
                    score = max(score, patterns["score"])

        # Adjust based on token count
        if token_count > 1500:
            score += 0.2
        elif token_count < 50:
            score = min(score, 0.1)

        return score

    def _has_external_dependencies(self, description: str) -> bool:
        """Check if task requires external API/research."""
        keywords = [
            "api",
            "external",
            "download",
            "fetch",
            "query",
            "integration",
            "third-party",
            "cloud",
            "network",
        ]
        lower = description.lower()
        return any(kw in lower for kw in keywords)

    def _has_research_requirements(self, description: str) -> bool:
        """Check if task requires information gathering."""
        keywords = [
            "research",
            "find",
            "investigate",
            "explore",
            "analyze",
            "summarize",
            "information",
            "data",
            "search",
        ]
        lower = description.lower()
        return any(kw in lower for kw in keywords)

    def _has_code_generation(self, description: str) -> bool:
        """Check if task requires code generation."""
        keywords = [
            "code",
            "function",
            "class",
            "implementation",
            "algorithm",
            "library",
            "script",
            "program",
            "api",
            "debug",
        ]
        lower = description.lower()
        return any(kw in lower for kw in keywords)

    @staticmethod
    def _count_decision_branches(description: str) -> int:
        """Estimate number of decision branches implied by task."""
        # Match conditional patterns
        if_then = len(re.findall(r"\b(if|then|else|case|when)\b", description.lower()))
        options = len(re.findall(r"\b(or|alternatively|either)\b", description.lower()))
        return max(1, if_then + options // 2)

    @staticmethod
    def _estimate_uncertainty(description: str) -> float:
        """Estimate how uncertain/ambiguous the task is."""
        uncertainty_words = [
            "maybe",
            "possibly",
            "uncertain",
            "ambiguous",
            "trade-off",
            "balance",
            "consider",
            "evaluate",
        ]
        lower = description.lower()
        count = sum(1 for w in uncertainty_words if w in lower)
        return min(0.9, count * 0.15)

    @staticmethod
    def _estimate_reasoning_intensity(description: str) -> float:
        """Estimate depth of reasoning required."""
        intensity_words = [
            "explain",
            "reason",
            "justify",
            "analyze",
            "evaluate",
            "compare",
            "contrast",
            "synthesize",
            "critical",
            "philosophical",
        ]
        lower = description.lower()
        count = sum(1 for w in intensity_words if w in lower)
        return min(0.95, count * 0.2)

    def _adjust_score(
        self,
        base_score: float,
        has_external: bool,
        has_research: bool,
        has_code: bool,
        branches: int,
        uncertainty: float,
        reasoning: float,
    ) -> float:
        """Adjust base score with feature weights."""
        adjustments = 0.0

        if has_external:
            adjustments += 0.15
        if has_research:
            adjustments += 0.1
        if has_code:
            adjustments += 0.12

        # Branch complexity
        adjustments += min(0.2, max(0, branches - 1) * 0.05)

        # Uncertainty and reasoning
        adjustments += uncertainty * 0.1
        adjustments += reasoning * 0.15

        return base_score + adjustments

    @staticmethod
    def _categorize_difficulty(score: float) -> str:
        """Map complexity score to difficulty category."""
        if score < 0.1:
            return "trivial"
        elif score < 0.3:
            return "simple"
        elif score < 0.6:
            return "moderate"
        elif score < 0.8:
            return "complex"
        else:
            return "expert"

    @staticmethod
    def _estimate_time(score: float, branches: int, has_research: bool) -> int:
        """Estimate task execution time in seconds."""
        base = int(score * 300)  # 0 to 300 seconds for complexity
        branch_time = branches * 20
        research_time = 120 if has_research else 0
        return base + branch_time + research_time

    @staticmethod
    def _confidence_score(description_length: int, has_context: bool, pattern_match: bool) -> float:
        """Estimate confidence in complexity estimate."""
        confidence = 0.7

        if description_length > 200:
            confidence += 0.15
        elif description_length < 50:
            confidence -= 0.1

        if has_context:
            confidence += 0.1

        if pattern_match:
            confidence += 0.05

        return min(0.95, max(0.3, confidence))

    def _store_profile(self, profile: TaskProfile) -> None:
        """Store profile in memory for learning."""
        self._memory.remember_long_term(
            key=f"task_profile:{profile.task_id}",
            value={
                "task_id": profile.task_id,
                "complexity_score": profile.complexity_score,
                "difficulty_category": profile.difficulty_category,
                "has_external_dependencies": profile.has_external_dependencies,
                "has_research_requirements": profile.has_research_requirements,
                "has_code_generation": profile.has_code_generation,
                "confidence": profile.confidence,
            },
            source="cognitive_budget.task_complexity_estimator",
            importance=0.6,
            tags=["task", "complexity", "profile"],
        )
