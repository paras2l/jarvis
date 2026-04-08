"""Personality profile definitions for Pixi identity behavior.

This module defines stable personality traits and adaptation rules used by
reasoning, planning, actions, and interaction layers.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Mapping


@dataclass(slots=True)
class PersonalityTraits:
    """Core personality dimensions normalized on a 0.0-1.0 scale."""

    analytical_thinking: float = 0.9
    creativity: float = 0.65
    risk_tolerance: float = 0.45
    decisiveness: float = 0.8
    empathy: float = 0.7
    caution: float = 0.7
    curiosity: float = 0.75
    persistence: float = 0.85

    def normalized(self) -> "PersonalityTraits":
        """Return a clamped copy to keep all values in valid range."""

        return PersonalityTraits(
            analytical_thinking=_clamp(self.analytical_thinking),
            creativity=_clamp(self.creativity),
            risk_tolerance=_clamp(self.risk_tolerance),
            decisiveness=_clamp(self.decisiveness),
            empathy=_clamp(self.empathy),
            caution=_clamp(self.caution),
            curiosity=_clamp(self.curiosity),
            persistence=_clamp(self.persistence),
        )


@dataclass(slots=True)
class BehaviorPreferences:
    """Operational preferences that translate traits into runtime behavior."""

    prefers_stepwise_plans: bool = True
    uses_conservative_fallbacks: bool = True
    validation_depth: str = "high"
    autonomy_level: float = 0.7
    explain_decisions: bool = True
    include_alternatives: bool = True


@dataclass(slots=True)
class PersonalityProfile:
    """Complete personality profile and adaptation policies."""

    profile_name: str = "Pixi_default"
    version: str = "1.0.0"
    communication_style: str = "direct_structured"
    reasoning_style: str = "evidence_weighted"
    traits: PersonalityTraits = field(default_factory=PersonalityTraits)
    preferences: BehaviorPreferences = field(default_factory=BehaviorPreferences)
    adaptation_limits: Dict[str, float] = field(
        default_factory=lambda: {
            "risk_tolerance": 0.2,
            "creativity": 0.2,
            "decisiveness": 0.15,
        }
    )

    @classmethod
    def from_mapping(cls, data: Mapping[str, Any]) -> "PersonalityProfile":
        """Construct profile from dictionary-like configuration."""

        traits_data = data.get("traits", {})
        preferences_data = data.get("preferences", {})

        profile = cls(
            profile_name=str(data.get("profile_name", "Pixi_default")),
            version=str(data.get("version", "1.0.0")),
            communication_style=str(data.get("communication_style", "direct_structured")),
            reasoning_style=str(data.get("reasoning_style", "evidence_weighted")),
            traits=PersonalityTraits(
                analytical_thinking=float(traits_data.get("analytical_thinking", 0.9)),
                creativity=float(traits_data.get("creativity", 0.65)),
                risk_tolerance=float(traits_data.get("risk_tolerance", 0.45)),
                decisiveness=float(traits_data.get("decisiveness", 0.8)),
                empathy=float(traits_data.get("empathy", 0.7)),
                caution=float(traits_data.get("caution", 0.7)),
                curiosity=float(traits_data.get("curiosity", 0.75)),
                persistence=float(traits_data.get("persistence", 0.85)),
            ).normalized(),
            preferences=BehaviorPreferences(
                prefers_stepwise_plans=bool(preferences_data.get("prefers_stepwise_plans", True)),
                uses_conservative_fallbacks=bool(preferences_data.get("uses_conservative_fallbacks", True)),
                validation_depth=str(preferences_data.get("validation_depth", "high")),
                autonomy_level=_clamp(float(preferences_data.get("autonomy_level", 0.7))),
                explain_decisions=bool(preferences_data.get("explain_decisions", True)),
                include_alternatives=bool(preferences_data.get("include_alternatives", True)),
            ),
            adaptation_limits={
                "risk_tolerance": float(data.get("adaptation_limits", {}).get("risk_tolerance", 0.2)),
                "creativity": float(data.get("adaptation_limits", {}).get("creativity", 0.2)),
                "decisiveness": float(data.get("adaptation_limits", {}).get("decisiveness", 0.15)),
            },
        )
        return profile

    def with_context_adjustments(self, runtime_context: Mapping[str, Any]) -> "PersonalityProfile":
        """Return an adapted profile constrained by configured adjustment limits."""

        urgency = _clamp(float(runtime_context.get("urgency", 0.5)))
        uncertainty = _clamp(float(runtime_context.get("uncertainty", 0.5)))
        user_risk_preference = runtime_context.get("user_risk_preference")

        adjusted = PersonalityTraits(**asdict(self.traits))
        adjusted.decisiveness = _bounded_shift(
            base=adjusted.decisiveness,
            delta=(urgency - 0.5) * 0.2,
            limit=self.adaptation_limits.get("decisiveness", 0.15),
        )
        adjusted.creativity = _bounded_shift(
            base=adjusted.creativity,
            delta=(1.0 - uncertainty - 0.5) * 0.2,
            limit=self.adaptation_limits.get("creativity", 0.2),
        )

        if user_risk_preference is not None:
            target_risk = _clamp(float(user_risk_preference))
            adjusted.risk_tolerance = _bounded_shift(
                base=adjusted.risk_tolerance,
                delta=(target_risk - adjusted.risk_tolerance),
                limit=self.adaptation_limits.get("risk_tolerance", 0.2),
            )

        return PersonalityProfile(
            profile_name=self.profile_name,
            version=self.version,
            communication_style=self.communication_style,
            reasoning_style=self.reasoning_style,
            traits=adjusted.normalized(),
            preferences=self.preferences,
            adaptation_limits=dict(self.adaptation_limits),
        )

    def as_dict(self) -> Dict[str, Any]:
        """Serialize profile for persistence and cross-layer sharing."""

        return {
            "profile_name": self.profile_name,
            "version": self.version,
            "communication_style": self.communication_style,
            "reasoning_style": self.reasoning_style,
            "traits": asdict(self.traits),
            "preferences": asdict(self.preferences),
            "adaptation_limits": dict(self.adaptation_limits),
        }


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _bounded_shift(base: float, delta: float, limit: float) -> float:
    bounded = max(-abs(limit), min(abs(limit), delta))
    return _clamp(base + bounded)

