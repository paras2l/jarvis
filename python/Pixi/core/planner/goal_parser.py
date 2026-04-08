"""Goal parsing for Pixi Planner Engine.

This module converts raw user goals into a normalized semantic structure used by
strategy selection and task decomposition.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Dict, List


@dataclass(slots=True)
class ParsedGoal:
    """Normalized representation of a raw goal string."""

    raw_goal: str
    normalized_goal: str
    intent: str
    domain: str
    desired_outcome: str
    keywords: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    complexity_score: float = 0.0
    risk_level: str = "low"


class GoalParser:
    """Parses high-level natural language goals into structured metadata."""

    _DOMAIN_HINTS: Dict[str, List[str]] = {
        "video_production": ["youtube", "video", "script", "visual", "edit", "thumbnail"],
        "software_development": ["app", "website", "code", "build", "debug", "api", "deploy"],
        "research_analysis": ["research", "analyze", "study", "investigate", "summarize"],
        "marketing_growth": ["campaign", "audience", "growth", "seo", "content strategy"],
        "operations_automation": ["automate", "workflow", "pipeline", "orchestrate", "process"],
    }

    _CONSTRAINT_PATTERNS: Dict[str, str] = {
        r"\bby\s+(tomorrow|tonight|today|\d{1,2}:\d{2})\b": "deadline",
        r"\bunder\s+\$?\d+\b": "budget_limit",
        r"\bwithout\s+([a-zA-Z0-9_\-\s]+)\b": "exclusion",
        r"\busing\s+([a-zA-Z0-9_\-\s]+)\b": "required_tool",
        r"\bfor\s+(beginners|experts|kids|students|developers)\b": "audience",
    }

    def parse(self, goal: str) -> ParsedGoal:
        """Parse a raw goal into a structured ParsedGoal object."""
        raw = goal.strip()
        normalized = self._normalize_text(raw)

        keywords = self._extract_keywords(normalized)
        domain = self._infer_domain(normalized)
        intent = self._infer_intent(normalized)
        desired_outcome = self._infer_desired_outcome(normalized, domain)
        constraints = self._extract_constraints(normalized)
        complexity_score = self._estimate_complexity(normalized, constraints)
        risk_level = self._estimate_risk_level(normalized, domain)

        return ParsedGoal(
            raw_goal=raw,
            normalized_goal=normalized,
            intent=intent,
            domain=domain,
            desired_outcome=desired_outcome,
            keywords=keywords,
            constraints=constraints,
            complexity_score=complexity_score,
            risk_level=risk_level,
        )

    @staticmethod
    def _normalize_text(text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip().lower()
        return cleaned

    def _infer_domain(self, normalized_goal: str) -> str:
        best_domain = "general"
        best_score = 0

        for domain, hints in self._DOMAIN_HINTS.items():
            score = sum(1 for token in hints if token in normalized_goal)
            if score > best_score:
                best_domain = domain
                best_score = score

        return best_domain

    @staticmethod
    def _infer_intent(normalized_goal: str) -> str:
        if any(token in normalized_goal for token in ("create", "build", "generate", "make")):
            return "create"
        if any(token in normalized_goal for token in ("analyze", "investigate", "research", "study")):
            return "analyze"
        if any(token in normalized_goal for token in ("improve", "optimize", "refactor", "enhance")):
            return "optimize"
        if any(token in normalized_goal for token in ("automate", "schedule", "orchestrate")):
            return "automate"
        return "general_assistance"

    @staticmethod
    def _infer_desired_outcome(normalized_goal: str, domain: str) -> str:
        if domain == "video_production":
            return "deliver a publish-ready video package"
        if domain == "software_development":
            return "deliver working software increments"
        if domain == "research_analysis":
            return "deliver evidence-backed insights"
        if domain == "marketing_growth":
            return "deliver growth-oriented campaign assets"
        if domain == "operations_automation":
            return "deliver repeatable automated workflow"

        if normalized_goal.startswith("create "):
            return normalized_goal.replace("create ", "", 1)
        return "deliver a complete actionable result"

    @staticmethod
    def _extract_keywords(normalized_goal: str) -> List[str]:
        tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9_\-]{2,}", normalized_goal)
        stop = {
            "create", "build", "make", "with", "without", "using", "for", "the", "and", "from",
            "into", "that", "this", "your", "my", "Pixi", "please",
        }
        keywords = [token for token in tokens if token not in stop]

        dedup: List[str] = []
        seen = set()
        for keyword in keywords:
            if keyword in seen:
                continue
            seen.add(keyword)
            dedup.append(keyword)
        return dedup[:20]

    def _extract_constraints(self, normalized_goal: str) -> List[str]:
        constraints: List[str] = []
        for pattern, label in self._CONSTRAINT_PATTERNS.items():
            match = re.search(pattern, normalized_goal)
            if not match:
                continue
            constraints.append(f"{label}:{match.group(0)}")

        if "must" in normalized_goal:
            constraints.append("strict_requirement:must")
        if "cannot" in normalized_goal or "can't" in normalized_goal:
            constraints.append("strict_requirement:cannot")
        return constraints

    @staticmethod
    def _estimate_complexity(normalized_goal: str, constraints: List[str]) -> float:
        word_count = len(normalized_goal.split())
        sequence_markers = sum(
            1 for marker in ("then", "after", "before", "step", "pipeline", "workflow") if marker in normalized_goal
        )
        score = (word_count / 30.0) + (len(constraints) * 0.25) + (sequence_markers * 0.35)
        return round(min(5.0, max(0.5, score)), 2)

    @staticmethod
    def _estimate_risk_level(normalized_goal: str, domain: str) -> str:
        high_risk_tokens = ("delete", "transfer", "payment", "trade", "production deploy", "shutdown")
        if any(token in normalized_goal for token in high_risk_tokens):
            return "high"
        if domain in {"software_development", "operations_automation"}:
            return "medium"
        return "low"

